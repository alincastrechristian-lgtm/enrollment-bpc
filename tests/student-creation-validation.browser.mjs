import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

test(
	'student creation enforces birthday cutoff and 11 phone digits without restricting legacy edits',
	{ timeout: 90000 },
	async () => {
		const root = mkdtempSync(path.resolve('.tmp-student-validation-'));
		let server, browser;
		try {
			const source = path
				.resolve('src/routes/user/students/StudentDialog.svelte')
				.replaceAll('\\', '/');
			const files = {
				'index.html':
					'<html><main id="app"></main><script type="module" src="/main.js"></script></html>',
				'main.js':
					"import{mount}from'svelte';import App from './App.svelte';mount(App,{target:document.getElementById('app')});",
				'App.svelte': `<script>import Dialog from '${source}';let dialog;window.openCreate=()=>dialog.open();window.openEdit=()=>dialog.open({userId:'legacy',name:'Legacy Student',firstName:'Legacy',middleName:'',lastName:'Student',email:'legacy@example.com',birthDate:new Date().toISOString().slice(0,10),sex:'female',address:'Bulacan',contactNumber:'123'});</script><Dialog bind:this={dialog}/>`,
				'actions.js':
					'export const createStudent=async()=>{};export const updateStudent=async()=>{};',
				'navigation.js': 'export const goto=async()=>{};export const refreshAll=async()=>{};',
				'paths.js': 'export const resolve=route=>route;',
				'popup.js':
					'export const showError=()=>{};export const showSuccess=()=>{};export const showYesNo=async()=>true;'
			};
			for (const [file, text] of Object.entries(files)) writeFileSync(path.join(root, file), text);
			server = await createServer({
				root,
				configFile: false,
				plugins: [svelte({ configFile: false, preprocess: vitePreprocess() })],
				resolve: {
					alias: [
						{ find: '#lib/actions/user.remote.js', replacement: path.join(root, 'actions.js') },
						{
							find: '#lib/components/Popup/Popup.svelte.js',
							replacement: path.join(root, 'popup.js')
						},
						{ find: '$app/navigation', replacement: path.join(root, 'navigation.js') },
						{ find: '$app/paths', replacement: path.join(root, 'paths.js') },
						{ find: '#lib', replacement: path.resolve('src/lib') }
					]
				},
				server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd()] } }
			});
			await server.listen();
			browser = await chromium.launch({ channel: 'chrome', headless: true });
			const page = await browser.newPage();
			const errors = [];
			page.on('pageerror', (error) => errors.push(error.message));
			await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`, {
				waitUntil: 'networkidle'
			});
			await page.evaluate(() => window.openCreate());
			const birth = page.getByLabel('Birth date', { exact: true });
			const phone = page.getByLabel('Contact number', { exact: true });
			await expect(
				page.getByText('Student must be at least 17 years old.', { exact: true })
			).toBeVisible();
			const cutoff = await birth.getAttribute('max');
			await birth.fill(cutoff);
			assert.equal(await birth.evaluate((input) => input.checkValidity()), true);
			const younger = new Date(`${cutoff}T00:00:00Z`);
			younger.setUTCDate(younger.getUTCDate() + 1);
			await birth.fill(younger.toISOString().slice(0, 10));
			assert.equal(await birth.evaluate((input) => input.validity.rangeOverflow), true);
			for (const value of ['09123456789', '0912 345 6789', '0912-345-6789']) {
				await phone.fill(value);
				assert.equal(await phone.evaluate((input) => input.checkValidity()), true, value);
			}
			for (const value of ['0917', '091234567890', '0912abc6789']) {
				await phone.fill(value);
				assert.equal(await phone.evaluate((input) => input.checkValidity()), false, value);
			}
			await page.evaluate(() => {
				document.querySelector('dialog').close();
				window.openEdit();
			});
			await expect(phone).toHaveValue('123');
			assert.equal(await phone.evaluate((input) => input.checkValidity()), true);
			assert.equal(await birth.evaluate((input) => input.checkValidity()), true);
			assert.deepEqual(errors, []);
		} finally {
			await browser?.close();
			await server?.close();
			assert.equal(path.dirname(root), process.cwd());
			rmSync(root, { recursive: true, force: true });
		}
	}
);
