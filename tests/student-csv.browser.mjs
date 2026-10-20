import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

test(
	'CSV dialog previews required fields, prevents invalid imports, reports results and blocks uncertain retries',
	{ timeout: 90000 },
	async () => {
		const root = mkdtempSync(path.resolve('.tmp-student-csv-'));
		let server, browser;
		try {
			const source = path
				.resolve('src/routes/user/students/StudentCsvDialog.svelte')
				.replaceAll('\\', '/');
			const files = {
				'index.html':
					'<html data-theme="light"><main id="app"></main><script type="module" src="/main.js"></script></html>',
				'main.js':
					"import './style.css';import{mount}from'svelte';import App from './App.svelte';mount(App,{target:document.getElementById('app')});",
				'style.css': "@import '../src/routes/layout.css'; @source '../src';",
				'App.svelte': `<script>import Dialog from '${source}';let dialog;</script><button onclick={()=>dialog.open()}>Open import</button><Dialog bind:this={dialog}/>`,
				'actions.js': `import{validateStudentCsv}from'#lib/student-csv.js';window.imports=[];export async function previewStudentCsv({csv}){return validateStudentCsv(csv);}export async function importStudentCsv({csv}){window.imports.push(csv);if(window.failImport)throw Error('Lost response');if(window.holdImport)await new Promise(resolve=>window.finishImport=resolve);return{issues:[],results:validateStudentCsv(csv).rows.map(row=>({row:row.row,email:row.student.email,status:'created',studentId:'MA-001',invitationSent:false,message:'Student created; setup invitation could not be sent. Use Resend setup link.'}))};}`,
				'navigation.js':
					'export const refreshAll=async()=>{window.refreshes=(window.refreshes??0)+1;};'
			};
			for (const [file, text] of Object.entries(files)) writeFileSync(path.join(root, file), text);
			server = await createServer({
				root,
				configFile: false,
				plugins: [tailwindcss(), svelte({ configFile: false, preprocess: vitePreprocess() })],
				resolve: {
					alias: [
						{ find: '#lib/actions/user.remote.js', replacement: path.join(root, 'actions.js') },
						{ find: '$app/navigation', replacement: path.join(root, 'navigation.js') },
						{ find: '#lib', replacement: path.resolve('src/lib') }
					]
				},
				server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd()] } }
			});
			await server.listen();
			browser = await chromium.launch({ channel: 'chrome', headless: true });
			const page = await browser.newPage();
			const errors = [];
			page.on('pageerror', (cause) => errors.push(cause.message));
			await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`, {
				waitUntil: 'networkidle'
			});
			await page.getByRole('button', { name: 'Open import', exact: true }).click();
			const upload = page.getByLabel('Student CSV file', { exact: true });
			const submit = page.getByRole('button', { name: 'Import students', exact: true });
			await expect(submit).toBeDisabled();
			assert(
				decodeURIComponent(
					await page.getByRole('link', { name: 'Download CSV template' }).getAttribute('href')
				).includes('birth_date,sex,contact_number,address')
			);
			await upload.setInputFiles({
				name: 'invalid.csv',
				mimeType: 'text/csv',
				buffer: Buffer.from('first_name\nAna')
			});
			await expect(page.getByRole('alert')).toContainText('Missing required column');
			await expect(submit).toBeDisabled();
			const csv =
				'first_name,last_name,email,birth_date,sex,contact_number,address\nAna,Santos,ana@example.com,2000-01-01,female,09171234567,"Malolos, Bulacan"';
			const file = { name: 'students.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) };
			await upload.setInputFiles(file);
			await expect(page.getByText('1 students ready to import')).toBeVisible();
			await expect(page.getByRole('table', { name: 'Student CSV preview' })).toContainText(
				'09171234567'
			);
			await page.evaluate(() => (window.holdImport = true));
			await submit.click();
			await expect(submit).toBeDisabled();
			await expect(upload).toBeDisabled();
			await expect(page.getByLabel('Close CSV import')).toBeDisabled();
			await page.evaluate(() => window.finishImport());
			await expect(page.getByRole('table', { name: 'Student import results' })).toContainText(
				'Resend setup link'
			);
			await expect(submit).toBeDisabled();
			assert.equal(await page.evaluate(() => window.imports.length), 1);
			await page.getByRole('button', { name: 'Close', exact: true }).click();
			await page.getByRole('button', { name: 'Open import', exact: true }).click();
			await upload.setInputFiles(file);
			await page.evaluate(() => {
				window.holdImport = false;
				window.failImport = true;
			});
			await submit.click();
			await expect(page.getByRole('alert')).toContainText(
				'some students may already have been created'
			);
			await expect(submit).toBeDisabled();
			await page.setViewportSize({ width: 390, height: 844 });
			assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
			assert.deepEqual(errors, []);
		} finally {
			await browser?.close();
			await server?.close();
			assert.equal(path.dirname(root), process.cwd());
			rmSync(root, { recursive: true, force: true });
		}
	}
);
