import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { createServer } from 'vite';

test(
	'subject dialog scrolls and saves catalog details without global prerequisite controls',
	{ timeout: 120_000 },
	async () => {
		mkdirSync('.tmp', { recursive: true });
		const root = mkdtempSync(path.resolve('.tmp/subject-dialog-'));
		const files = {
			'index.html':
				'<html data-theme="dark"><main id="app"></main><script type="module" src="/main.js"></script></html>',
			'style.css': "@import '../../src/routes/layout.css'; @source '../../src';",
			'main.js':
				"import './style.css'; import {mount} from 'svelte'; import Harness from './Harness.svelte'; mount(Harness,{target:document.getElementById('app')});",
			'navigation.js': 'export async function refreshAll(){}',
			'popup.js':
				'export function showError(error){window.errors.push(error);} export function showSuccess(){} export function showLoading(){}',
			'actions.js': `window.creations=[];window.updates=[];window.errors=[];
			export async function createSubject(data){window.creations.push(data);if(window.deferSave)await new Promise(resolve=>window.finishSave=resolve);return {...data,id:'created'};}
			export async function updateSubject(data){window.updates.push(data);}`,
			'Harness.svelte': `<script>
			import SubjectDialog from '${path.resolve('src/routes/user/subjects/SubjectDialog.svelte').replaceAll('\\', '/')}';
			let dialog;
			const subjects=Array.from({length:60},(_,i)=>({id:'s'+i,code:'IS'+String(i+101),name:i===1?'Fundamentals of Programming':i===2?'Database Systems':'Subject with a long name '+i,isActive:true,description:''}));
			window.openEdit=()=>dialog.open(subjects[0]);
		</script>
		<button onclick={()=>dialog.open()}>New subject</button>
		<SubjectDialog bind:this={dialog}/>`
		};
		let server, browser;
		try {
			for (const [name, contents] of Object.entries(files))
				writeFileSync(path.join(root, name), contents);
			server = await createServer({
				root,
				configFile: false,
				cacheDir: path.resolve('node_modules/.vite/subject-dialog-browser'),
				plugins: [tailwindcss(), svelte({ configFile: false, preprocess: vitePreprocess() })],
				resolve: {
					alias: [
						{ find: '$app/navigation', replacement: path.join(root, 'navigation.js') },
						{ find: '#lib/actions/subject.remote.js', replacement: path.join(root, 'actions.js') },
						{
							find: '#lib/components/Popup/Popup.svelte.js',
							replacement: path.join(root, 'popup.js')
						},
						{ find: '#lib', replacement: path.resolve('src/lib') }
					]
				},
				server: { host: '127.0.0.1', port: 0 }
			});
			await server.listen();
			browser = await chromium.launch({ headless: true, channel: 'msedge' });
			const page = await browser.newPage();
			const errors = [];
			page.on('pageerror', (cause) => errors.push(cause.message));
			await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
			for (const viewport of [
				{ width: 390, height: 640 },
				{ width: 630, height: 420 },
				{ width: 320, height: 568 }
			]) {
				await page.setViewportSize(viewport);
				await page.getByRole('button', { name: 'New subject', exact: true }).click();
				const form = page.locator('dialog form');
				await form.evaluate((form) => {
					for (const element of form.querySelectorAll('*'))
						if (getComputedStyle(element).overflowY === 'auto')
							element.scrollTop = element.scrollHeight;
				});
				const active = await page
					.getByRole('checkbox', { name: /^Active/ })
					.locator('..')
					.boundingBox();
				const footer = await form.locator(':scope > :last-child').boundingBox();
				assert.ok(
					active.y + active.height <= footer.y + 1,
					`Fields overlap footer at ${viewport.width}x${viewport.height}`
				);
				const bounds = await form.boundingBox();
				assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height);
				assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width);
				await page.getByRole('button', { name: 'Cancel', exact: true }).click();
			}
			await page.setViewportSize({ width: 390, height: 640 });
			await page.getByRole('button', { name: 'New subject', exact: true }).click();
			await page.getByLabel('Name', { exact: true }).fill('Advanced Computing');
			await page.getByLabel('Code', { exact: true }).fill('ADV101');
			await expect(
				page.getByRole('button', { name: 'Add prerequisite subject', exact: true })
			).toHaveCount(0);
			await page.evaluate(() => (window.deferSave = true));
			await page.getByRole('button', { name: 'Create Subject', exact: true }).click();
			await expect(page.getByLabel('Name', { exact: true })).toBeDisabled();
			assert.equal(
				await page.evaluate(() => Object.hasOwn(window.creations[0], 'prerequisiteIds')),
				false
			);
			await page.evaluate(() => {
				window.deferSave = false;
				window.finishSave();
			});
			await expect(page.locator('dialog')).not.toBeVisible();
			await page.evaluate(() => window.openEdit());
			await page.getByLabel('Name', { exact: true }).fill('Edited catalog subject');
			await page.getByRole('button', { name: 'Save changes', exact: true }).click();
			assert.equal(await page.evaluate(() => window.updates[0].name), 'Edited catalog subject');
			assert.equal(
				await page.evaluate(() => Object.hasOwn(window.updates[0], 'prerequisiteIds')),
				false
			);
			assert.deepEqual(errors, []);
			assert.deepEqual(await page.evaluate(() => window.errors), []);
		} finally {
			await browser?.close();
			await server?.close();
			for (const name of Object.keys(files)) rmSync(path.join(root, name), { force: true });
			rmdirSync(root);
		}
	}
);
