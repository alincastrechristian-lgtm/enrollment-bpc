import { chromium, expect } from '@playwright/test';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

test('catalog toolbar debounces searches, combines filters and preserves newer edits', async () => {
	const root = mkdtempSync(path.resolve('.tmp-catalog-toolbar-'));
	const files = {
		'index.html': '<div id="app"></div><script type="module" src="/main.js"></script>',
		'main.js': `import {mount} from 'svelte'; import Harness from './Harness.svelte';
			mount(Harness, {target: document.getElementById('app')});`,
		'state.svelte.js': `export const page = $state({url: new URL(window.location.href)});`,
		'navigation.js': `import {onDestroy} from 'svelte'; import {page} from './state.svelte.js';
			const hooks = new Set(); let generation = 0;
			window.calls = []; window.delay = 0; window.fail = false;
			export function beforeNavigate(hook) { hooks.add(hook); onDestroy(() => hooks.delete(hook)); }
			function start(url) { for (const hook of hooks) hook({to: {url}}); return ++generation; }
			export async function goto(destination, options) {
				const url = new URL(destination); const current = start(url);
				window.calls.push({href: url.href, options});
				if (window.delay) await new Promise(resolve => setTimeout(resolve, window.delay));
				if (window.fail) throw new Error('Network unavailable');
				if (current === generation) page.url = url;
			}
			window.navigate = (query) => {const url = new URL(query, page.url); start(url); page.url = url;};`,
		'Harness.svelte': `<script>
			import Toolbar from '${path.resolve('src/lib/components/Catalog/CatalogToolbar.svelte').replaceAll('\\', '/')}';
			import {page} from './state.svelte.js';
			import z from 'zod';
			import {readFilterValues} from '${path.resolve('src/lib/components/Filter/fields.ts').replaceAll('\\', '/')}';
			const schema=z.object({name:z.string().optional(), description:z.string().nullable().optional(), isActive:z.boolean().optional(), yearLevel:z.number().int().min(1).max(4).optional(), dateApplied:z.date().optional(), category:z.enum(['Core','Elective']).optional()});
			let visible = $state(true);
			</script>
			<button onclick={() => visible = !visible}>Toggle toolbar</button>
			{#if visible}<Toolbar search={page.url.searchParams.get('q') ?? ''}
			status={page.url.searchParams.get('status') ?? 'all'} placeholder="Search records" searchLabel="Search records"
			filterSchema={schema} filters={readFilterValues(schema, page.url.searchParams)} statusOptions={[{value:'all',label:'All statuses'}, {value:'active',label:'Active'}, {value:'inactive',label:'Inactive'}]}>
			<button type="button">New record</button></Toolbar>{/if}`
	};
	let server;
	let browser;
	try {
		for (const [name, contents] of Object.entries(files))
			writeFileSync(path.join(root, name), contents);
		server = await createServer({
			root,
			configFile: false,
			plugins: [svelte({ configFile: false, preprocess: vitePreprocess() })],
			resolve: {
				alias: [
					{ find: '$app/state', replacement: path.join(root, 'state.svelte.js') },
					{ find: '$app/navigation', replacement: path.join(root, 'navigation.js') }
				]
			},
			server: { host: '127.0.0.1', port: 0 }
		});
		await server.listen();
		browser = await chromium.launch({ headless: true, channel: 'msedge' });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?page=3&keep=yes`);
		const input = page.getByRole('searchbox');
		await expect(input).toBeVisible();
		await expect(page.getByRole('button', { name: 'Search', exact: true })).toHaveCount(0);
		const now = new Date('2026-10-08T00:00:00Z');
		await page.clock.install({ time: now });
		await page.clock.pauseAt(now);
		const calls = () => page.evaluate(() => window.calls);
		const status = page.getByRole('combobox', { name: 'Status filter' });
		async function selectStatus(value) {
			if (!(await status.isVisible())) await page.getByRole('button', { name: /^Filters/ }).click();
			await status.selectOption(value);
		}

		await input.fill('B');
		await page.clock.fastForward(200);
		await input.fill('BS');
		await selectStatus('active');
		await input.focus();
		await page.clock.fastForward(399);
		assert.equal((await calls()).length, 0);
		await page.clock.fastForward(1);
		await expect.poll(async () => (await calls()).length).toBe(1);
		let request = (await calls())[0];
		assert.equal(new URL(request.href).search, '?keep=yes&q=BS&status=active');
		assert.deepEqual(request.options, { reset: false, replace: true });
		await expect(input).toBeFocused();
		await input.fill('BS');
		await page.clock.fastForward(500);
		assert.equal((await calls()).length, 1);

		await input.fill('');
		await selectStatus('all');
		await page.clock.fastForward(400);
		await expect.poll(async () => (await calls()).length).toBe(2);
		assert.equal(new URL((await calls())[1].href).search, '?keep=yes');

		// Enter applies immediately and cancels the pending automatic request.
		await input.fill('Enter');
		await input.press('Enter');
		await expect.poll(async () => (await calls()).length).toBe(3);
		await page.clock.fastForward(500);
		assert.equal((await calls()).length, 3);

		// Finishing an older slow request must not reset a newer draft.
		await page.evaluate(() => (window.delay = 300));
		await input.fill('Old');
		await page.clock.fastForward(400);
		await input.fill('Newest');
		await page.clock.fastForward(300);
		await expect(input).toHaveValue('Newest');
		await page.clock.fastForward(100);
		await page.clock.fastForward(300);
		assert.equal(new URL((await calls()).at(-1).href).searchParams.get('q'), 'Newest');
		await page.evaluate(() => (window.delay = 0));

		// Browser navigation cancels pending searches and restores URL state.
		let count = (await calls()).length;
		await input.fill('Cancelled');
		await page.evaluate(() => window.navigate('?q=Restored&status=inactive&page=2'));
		await expect(input).toHaveValue('Restored');
		await expect(status).toHaveValue('inactive');
		await page.clock.fastForward(500);
		assert.equal((await calls()).length, count);

		// IME input sends nothing until composition finishes.
		await input.dispatchEvent('compositionstart');
		await input.fill('Composing');
		await page.clock.fastForward(500);
		assert.equal((await calls()).length, count);
		await input.dispatchEvent('compositionend');
		await page.clock.fastForward(400);
		assert.equal((await calls()).length, ++count);

		// Different schema types render different controls and combine in one request.
		const name = page.getByLabel('Name', { exact: true });
		if (!(await name.isVisible())) await page.getByRole('button', { name: /^Filters/ }).click();
		await expect(page.getByLabel('Description')).toHaveAttribute('type', 'text');
		await expect(page.getByLabel('Year level minimum')).toHaveAttribute('type', 'number');
		await expect(page.getByLabel('Year level minimum')).toHaveAttribute('min', '1');
		await expect(page.getByLabel('Date applied start date')).toHaveAttribute('type', 'date');
		await name.fill('Biology');
		await page.getByLabel('Is active').selectOption('false');
		await page.getByLabel('Year level minimum').fill('2');
		await page.getByLabel('Year level maximum').fill('3');
		await page.getByLabel('Date applied start date').fill('2026-10-08');
		await page.getByLabel('Date applied end date').fill('2026-10-09');
		await page.getByLabel('Category').selectOption('Elective');
		await page.clock.fastForward(399);
		assert.equal((await calls()).length, count);
		await page.clock.fastForward(1);
		assert.equal((await calls()).length, ++count);
		const parameters = new URL((await calls()).at(-1).href).searchParams;
		assert.equal(parameters.get('filter.name'), 'Biology');
		assert.equal(parameters.get('filter.isActive'), 'false');
		assert.equal(parameters.get('filter.yearLevel.min'), '2');
		assert.equal(parameters.get('filter.yearLevel.max'), '3');
		assert.equal(parameters.get('filter.dateApplied.min'), '2026-10-08');
		assert.equal(parameters.get('filter.dateApplied.max'), '2026-10-09');
		assert.equal(parameters.get('filter.category'), 'Elective');
		await expect(page.getByRole('button', { name: /^Filters/ })).toContainText('6');
		await name.fill('Biology');
		await page.clock.fastForward(500);
		assert.equal((await calls()).length, count);
		await page.getByLabel('Year level minimum').fill('7');
		await page.clock.fastForward(400);
		assert.equal((await calls()).length, count);
		await expect(page.getByRole('alert')).toContainText('Year Level');
		await page.getByRole('button', { name: 'Clear filters' }).click();
		await page.clock.fastForward(400);
		assert.equal((await calls()).length, ++count);
		assert.equal(
			[...new URL((await calls()).at(-1).href).searchParams.keys()].some((key) =>
				key.startsWith('filter.')
			),
			false
		);
		assert.equal(new URL((await calls()).at(-1).href).searchParams.has('status'), false);
		await expect(name).toHaveValue('');
		await expect(page.getByLabel('Is active')).toHaveValue('');
		await page.getByRole('button', { name: 'Close filters' }).click();

		await page.evaluate(() => (window.fail = true));
		await input.fill('Retry');
		await page.clock.fastForward(400);
		await expect(page.getByRole('alert')).toContainText('Could not update results');
		await page.evaluate(() => (window.fail = false));
		await input.press('Enter');
		await expect(page.getByRole('alert')).toHaveCount(0);

		count = (await calls()).length;
		await input.fill('Unmounted');
		await page.getByRole('button', { name: 'Toggle toolbar' }).click();
		await page.clock.fastForward(500);
		assert.equal((await calls()).length, count);
		assert.deepEqual(errors, []);
	} finally {
		await browser?.close();
		await server?.close();
		for (const name of Object.keys(files)) rmSync(path.join(root, name), { force: true });
		rmdirSync(root);
	}
});
