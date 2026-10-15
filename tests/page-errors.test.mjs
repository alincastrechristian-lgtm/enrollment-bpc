import { chromium, expect } from '@playwright/test';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

test('page-load errors keep statuses, use shared boundaries, and offer working recovery', async () => {
	const root = mkdtempSync(path.resolve('.tmp-page-errors-'));
	const boundary = (file) => readFileSync(file, 'utf8');
	const files = {
		'package.json': JSON.stringify({ type: 'module', imports: { '#lib/*': './src/lib/*' } }),
		'src/lib/components/ErrorPage.svelte': boundary('src/lib/components/ErrorPage.svelte'),
		'src/lib/errors.ts': boundary('src/lib/errors.ts'),
		'src/hooks.server.js': "export {getPublicError as handleError} from '#lib/errors.js';",
		'src/hooks.client.ts': boundary('src/hooks.client.ts'),
		'src/app.html':
			'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">%sveltekit.head%</head><body><div>%sveltekit.body%</div></body></html>',
		'src/error.html': boundary('src/error.html'),
		'src/style.css': "@import '../../src/routes/layout.css'; @source '../../src';",
		'src/routes/+error.svelte': boundary('src/routes/+error.svelte'),
		'src/routes/user/+error.svelte': boundary('src/routes/user/+error.svelte'),
		'src/routes/+layout.svelte':
			'<script>import "../style.css";let {children,data}=$props();</script><div data-theme={data.theme}>{@render children()}</div>',
		'src/routes/+layout.server.js': `import {error} from '@sveltejs/kit';export const load=({url})=>{if(url.searchParams.has('root-error'))error(503,'SECRET provider credentials');return {theme:url.searchParams.get('theme')||'light'};};`,
		'src/routes/+page.svelte':
			'<script>import {onMount} from "svelte";onMount(()=>{window.pageReady=true;});</script><h1>Sign in</h1><a href="/portal/user/failure/404">Open unavailable enrollment</a>',
		'src/routes/user/+layout.svelte':
			'<script>let {children}=$props();</script><aside aria-label="Portal sidebar">Portal navigation</aside><main>{@render children()}</main>',
		'src/routes/user/+layout.server.js': `import {error} from '@sveltejs/kit';export const load=({url})=>{if(url.searchParams.has('layout-error'))error(403,'Forbidden');};`,
		'src/routes/user/dashboard/+page.svelte': '<h1>Dashboard</h1>',
		'src/routes/user/failure/[status]/+page.svelte': '<h1>Should never render</h1>',
		'src/routes/user/failure/[status]/+page.server.js': `import {error} from '@sveltejs/kit';export const load=({params})=>{const status=Number(params.status);if(status===500)throw new Error('SECRET database credentials');error(status,({401:'Unauthorized',403:'Forbidden',404:'Select an active curriculum for this program before enrolling students.',409:'Enrollment has changed. Review the record.',429:'Too Many Requests'})[status]||'Invalid request');};`
	};
	let server, browser;
	try {
		for (const [file, contents] of Object.entries(files)) {
			const target = path.join(root, file);
			mkdirSync(path.dirname(target), { recursive: true });
			writeFileSync(target, contents);
		}
		server = await createServer({
			root,
			configFile: false,
			plugins: [tailwindcss(), sveltekit({ paths: { base: '/portal' } })],
			ssr: { noExternal: ['@lucide/svelte'] },
			optimizeDeps: { include: ['@lucide/svelte'] },
			server: { host: '127.0.0.1', port: 0 }
		});
		await server.listen();
		const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
		const url = (route) => `${origin}/portal${route}`;
		browser = await chromium.launch({ headless: true, channel: 'msedge' });
		const page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
		// Cold SSR compilation of the icon package can exceed Playwright's 30s default.
		page.setDefaultNavigationTimeout(60_000);
		const clientErrors = [];
		page.on('pageerror', (error) => clientErrors.push(error.message));
		for (const [status, title] of [
			[401, 'Sign in to continue'],
			[403, 'Access denied'],
			[404, 'Page unavailable'],
			[409, 'Unable to continue'],
			[429, 'Please try again shortly'],
			[500, 'Something went wrong']
		]) {
			const response = await page.goto(url(`/user/failure/${status}`));
			assert.equal(response.status(), status);
			await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
			await expect(page.getByRole('complementary', { name: 'Portal sidebar' })).toBeVisible();
			await expect(
				page.getByRole('link', {
					name: status === 401 ? 'Sign in' : 'Back to dashboard',
					exact: true
				})
			).toHaveJSProperty('href', url(status === 401 ? '/' : '/user/dashboard'));
			assert.ok(!(await page.content()).includes('SECRET database credentials'));
			if (status === 404)
				await expect(
					page.getByText(
						files['src/routes/user/failure/[status]/+page.server.js'].match(/404:'([^']+)'/)[1],
						{ exact: true }
					)
				).toBeVisible();
			if (status === 500 || status === 429) {
				const retry = page.getByRole('link', { name: 'Try again', exact: true });
				await expect(retry).toBeVisible();
				assert.equal(await retry.getAttribute('href'), `/portal/user/failure/${status}`);
			}
		}

		// Verify hydration and client navigation update the same boundary.
		await page.goto(url('/'));
		await expect.poll(() => page.evaluate(() => window.pageReady)).toBe(true);
		await page.evaluate(() => (window.clientNavigationMarker = true));
		await page.getByRole('link', { name: 'Open unavailable enrollment' }).click();
		await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
		assert.equal(await page.evaluate(() => window.clientNavigationMarker), true);
		await page.getByRole('button', { name: 'Go back', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
		await page.goto(url('/user/failure/403'));
		await page.getByRole('link', { name: 'Back to dashboard' }).click();
		await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();

		// Unknown routes and a failing user layout must use the root boundary.
		assert.equal((await page.goto(url('/does-not-exist'))).status(), 404);
		await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
		await expect(page.getByRole('complementary')).toHaveCount(0);
		assert.equal((await page.goto(url('/user/failure/404?layout-error=1'))).status(), 403);
		await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Back to home' })).toHaveJSProperty(
			'href',
			url('/')
		);

		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(url('/user/failure/404?theme=dark'));
		await expect(page.locator('[data-theme="dark"]')).toBeVisible();
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
		mkdirSync(path.resolve('.tmp'), { recursive: true });
		await page.screenshot({ path: path.resolve('.tmp/error-page-mobile.png'), fullPage: true });

		// Root-layout failures still render without the app, stylesheet or JavaScript.
		const fallback = await browser.newPage({
			javaScriptEnabled: false,
			viewport: { width: 390, height: 844 }
		});
		assert.equal((await fallback.goto(url('/?root-error=1'))).status(), 503);
		await expect(fallback.getByRole('heading', { name: 'Unable to load this page' })).toBeVisible();
		await expect(
			fallback.getByText('Something went wrong. Please try again.', { exact: true })
		).toBeVisible();
		assert.ok(!(await fallback.content()).includes('SECRET'));
		await expect(fallback.getByRole('link', { name: 'Try again' })).toBeVisible();
		assert.ok(await fallback.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
		assert.deepEqual(clientErrors, []);
	} finally {
		await browser?.close();
		await server?.close();
		// Only remove this test's uniquely allocated workspace directory.
		assert.equal(path.dirname(root), process.cwd());
		rmSync(root, { recursive: true, force: true });
	}
});
