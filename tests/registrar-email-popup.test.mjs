import { chromium, expect } from '@playwright/test';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

const sourcePath = (file) => path.resolve(file).replaceAll('\\', '/');

test('registrar conflict appears in the real error popup from a wrapped SvelteKit error', async () => {
	const root = mkdtempSync(path.resolve('.tmp-registrar-email-'));
	let server, browser;
	try {
		const files = {
			'index.html':
				'<!doctype html><html lang="en" data-theme="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="app" class="p-6"></main><script type="module" src="/main.js"></script></body></html>',
			'main.js':
				"import './style.css';import {mount} from 'svelte';import Harness from './Harness.svelte';mount(Harness,{target:document.getElementById('app')});",
			'style.css': "@import '../src/routes/layout.css'; @source '../src';",
			'navigation.js':
				'export function beforeNavigate(){};export async function goto(){};export async function refreshAll(){};',
			'state.svelte.js':
				"export const page=$state({url:new URL('/user/registrars',window.location.origin)});",
			'actions.js': `import {HandledHttpError} from '@sveltejs/kit/internal';
				window.existingRole='student';
				export async function createRegistrar(){if(window.failure==='native')throw new Error('SECRET smtp credentials');if(window.failure==='server')throw new HandledHttpError({status:500,message:'SECRET database credentials'});throw new HandledHttpError({status:409,message:'A '+window.existingRole+' account already exists with this email.'});}
				export async function resendMagicLink(){}`,
			'Harness.svelte': `<script>
				import Registrars from '${sourcePath('src/routes/user/registrars/+page.svelte')}';
				import PopupHost from '${sourcePath('src/lib/components/Popup/PopupHost.svelte')}';
			</script><Registrars data={{users:[],total:0,search:'',status:'all',filters:{}}}/><PopupHost/>`
		};
		for (const [file, content] of Object.entries(files))
			writeFileSync(path.join(root, file), content);
		server = await createServer({
			root,
			configFile: false,
			plugins: [tailwindcss(), svelte({ configFile: false, preprocess: vitePreprocess() })],
			resolve: {
				alias: [
					{ find: '$app/navigation', replacement: path.join(root, 'navigation.js') },
					{ find: '$app/state', replacement: path.join(root, 'state.svelte.js') },
					{ find: '#lib/actions/user.remote.js', replacement: path.join(root, 'actions.js') },
					{ find: '#lib', replacement: path.resolve('src/lib') }
				]
			},
			server: { host: '127.0.0.1', port: 0 }
		});
		await server.listen();
		browser = await chromium.launch({ headless: true, channel: 'msedge' });
		const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });
		const errors = [];
		page.on('pageerror', (cause) => errors.push(cause.message));
		await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
		await page.getByRole('button', { name: 'New Registrar', exact: true }).click();
		const form = page.getByRole('dialog', { name: 'New Registrar', exact: true });
		await form.getByLabel('Name', { exact: true }).fill('New Registrar');
		await form.getByLabel('Email', { exact: true }).fill('taken@example.com');
		for (const role of ['student', 'registrar']) {
			await page.evaluate((role) => (window.existingRole = role), role);
			await form.getByRole('button', { name: 'Create Registrar', exact: true }).click();
			const popup = page.getByRole('dialog', { name: 'Unable to create registrar', exact: true });
			await expect(
				popup.getByText(`A ${role} account already exists with this email.`, { exact: true })
			).toBeVisible();
			await expect(
				popup.getByText('Failed to create registrar. Please try again.', { exact: true })
			).toHaveCount(0);
			if (role === 'student') {
				mkdirSync(path.resolve('.tmp'), { recursive: true });
				await page.screenshot({ path: path.resolve('.tmp/registrar-email-conflict.png') });
			}
			await popup.getByRole('button', { name: 'Close', exact: true }).click();
			await expect(form).toHaveJSProperty('open', true);
		}
		for (const failure of ['native', 'server']) {
			await page.evaluate((failure) => (window.failure = failure), failure);
			await form.getByRole('button', { name: 'Create Registrar', exact: true }).click();
			const popup = page.getByRole('dialog', { name: 'Unable to create registrar', exact: true });
			await expect(
				popup.getByText('Failed to create registrar. Please try again.', { exact: true })
			).toBeVisible();
			assert.ok(!(await popup.textContent()).includes('SECRET'));
			await popup.getByRole('button', { name: 'Close', exact: true }).click();
			await expect(form).toHaveJSProperty('open', true);
		}
		assert.deepEqual(errors, []);
	} finally {
		await browser?.close();
		await server?.close();
		assert.equal(path.dirname(root), process.cwd());
		rmSync(root, { recursive: true, force: true });
	}
});
