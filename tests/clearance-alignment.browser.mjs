import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const absolute = (name) => path.resolve(name).replaceAll('\\', '/');
async function localOcr(page) {
	const require = createRequire(import.meta.url);
	const root = path.dirname(require.resolve('tesseract.js/package.json'));
	const core = path.dirname(require.resolve('tesseract.js-core/package.json', { paths: [root] }));
	const eng = path.join(
		path.dirname(require.resolve('@tesseract.js-data/eng/package.json')),
		'4.0.0_best_int',
		'eng.traineddata.gz'
	);
	await page.route('https://**/*', (route) => {
		const name = path.basename(new URL(route.request().url()).pathname);
		const file =
			name === 'worker.min.js'
				? path.join(root, 'dist', name)
				: name === 'eng.traineddata.gz'
					? eng
					: /^tesseract-core.*\.(js|wasm)$/.test(name)
						? path.join(core, name)
						: null;
		return file
			? route.fulfill({ path: file, headers: { 'Access-Control-Allow-Origin': '*' } })
			: route.abort();
	});
}

test(
	'real offline OCR aligns a complete reference with erased side/bottom borders',
	{ timeout: 120000 },
	async () => {
		const root = mkdtempSync(path.resolve('.tmp-clearance-anchor-'));
		let server, browser;
		try {
			writeFileSync(path.join(root, 'index.html'), '<html><body>Alignment test</body></html>');
			server = await createServer({
				root,
				configFile: false,
				optimizeDeps: { include: ['tesseract.js', 'zod'] },
				server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd()] } }
			});
			await server.listen();
			browser = await chromium.launch({ channel: 'chrome', headless: true });
			const page = await browser.newPage();
			await localOcr(page);
			await page.route('**/reference.jpg', (route) =>
				route.fulfill({
					path: absolute('tests/fixtures/clearance-photocopy/reference.jpg'),
					contentType: 'image/jpeg'
				})
			);
			await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
			const definition = JSON.parse(
				readFileSync('tests/fixtures/clearance-photocopy/definition.json', 'utf8')
			).definition;
			const result = await page.evaluate(
				async ({ definition, moduleUrl }) => {
					const p = await import(moduleUrl);
					const reference = await p.loadImage('/reference.jpg');
					const form = p.alignTemplate(reference, definition.corners);
					const ctx = form.getContext('2d');
					ctx.fillStyle = 'white';
					ctx.fillRect(0, 0, form.width * 0.025, form.height);
					ctx.fillRect(form.width * 0.975, 0, form.width * 0.025, form.height);
					ctx.fillRect(0, form.height * 0.98, form.width, form.height * 0.02);
					const photo = document.createElement('canvas');
					photo.width = form.width * 1.2;
					photo.height = form.height * 1.2;
					const pc = photo.getContext('2d');
					pc.fillStyle = 'white';
					pc.fillRect(0, 0, photo.width, photo.height);
					pc.drawImage(form, form.width * 0.1, form.height * 0.1);
					if (p.detectBorder(photo))
						throw Error('Fixture must reproduce missing border detection.');
					const result = await p.detectFormOutline(
						photo,
						{ definition, referenceUrl: '/reference.jpg' },
						() => {},
						new AbortController().signal
					);
					const noTemplate = await p.detectFormOutline(
						photo,
						undefined,
						() => {},
						new AbortController().signal
					);
					return { result, noTemplate };
				},
				{ definition, moduleUrl: '/@fs/' + absolute('src/lib/clearance/scan.client.ts') }
			);
			assert.equal(result.result.method, 'anchors', result.result.detail);
			const expected = [
				[1 / 12, 1 / 12],
				[11 / 12, 1 / 12],
				[11 / 12, 11 / 12],
				[1 / 12, 11 / 12]
			];
			result.result.corners.forEach((p, i) =>
				assert(Math.hypot(p.x - expected[i][0], p.y - expected[i][1]) < 0.012)
			);
			assert.equal(result.noTemplate.corners, null);
		} finally {
			await browser?.close();
			await server?.close();
			assert.equal(path.dirname(root), process.cwd());
			rmSync(root, { recursive: true, force: true });
		}
	}
);

test(
	'border editor retries after drawing, falls back automatically, cancels, and preserves manual corners on failure',
	{ timeout: 120000 },
	async () => {
		const root = mkdtempSync(path.resolve('.tmp-clearance-alignment-ui-'));
		let server, browser;
		try {
			const files = {
				'index.html':
					'<html><main id="app"></main><script type="module" src="/main.js"></script></html>',
				'main.js':
					"import {mount} from 'svelte';import App from './App.svelte';mount(App,{target:document.getElementById('app')});",
				'paths.js': 'export const resolve=route=>route;',
				'scan.js': `window.outlineCalls=[];export async function loadImage(){return document.createElement('canvas');}
			 export function detectFormOutline(image,alignment,onProgress,signal){window.outlineCalls.push(alignment);onProgress('Finding printed anchors');return new Promise((resolve,reject)=>{window.finishOutline=resolve;signal.addEventListener('abort',()=>reject(Error('Cancelled')),{once:true});});}`,
				'App.svelte': `<script>
			 import Editor from '${absolute('src/lib/clearance/BorderEditor.svelte')}';
			 let corners=$state([{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}]);let drawing=$state(false),busy=$state(false),detection=$state(null),src=$state('/reference.jpg');
			 const template={revision:'r1',filename:'reference.jpg',definition:{corners:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],areas:[]}};
			 window.autoFallback=()=>{src='/reference.jpg?second';detection='missing';};window.replacePhoto=()=>{src='/reference.jpg?third';detection=null;};
			 </script><Editor {src} {template} {detection} bind:corners bind:drawing bind:detecting={busy} disabled={busy} onchange={()=>{detection=null;}}/>
			 <button disabled={busy || drawing}>Check clearance</button><output>{JSON.stringify(corners)}</output>`
			};
			for (const [name, content] of Object.entries(files))
				writeFileSync(path.join(root, name), content);
			server = await createServer({
				root,
				configFile: false,
				plugins: [svelte({ configFile: false, preprocess: vitePreprocess() })],
				resolve: {
					alias: [
						{ find: '$app/paths', replacement: path.join(root, 'paths.js') },
						{ find: './scan.client', replacement: path.join(root, 'scan.js') }
					]
				},
				server: { host: '127.0.0.1', port: 0 }
			});
			await server.listen();
			browser = await chromium.launch({ channel: 'chrome', headless: true });
			const page = await browser.newPage();
			const errors = [];
			page.on('pageerror', (e) => errors.push(e.message));
			await page.route('**/reference.jpg*', (route) =>
				route.fulfill({
					path: absolute('static/clearance-reference.jpg'),
					contentType: 'image/jpeg'
				})
			);
			await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
			const detect = page.getByRole('button', { name: 'Detect borders', exact: true });
			const check = page.getByRole('button', { name: 'Check clearance', exact: true });
			await page.getByRole('button', { name: 'Draw new box', exact: true }).click();
			await expect(check).toBeDisabled();
			await expect(detect).toBeEnabled();
			await detect.click();
			await expect(page.getByText('Finding printed anchors', { exact: true })).toBeVisible();
			await expect(detect).toBeDisabled();
			await expect(check).toBeDisabled();
			await page.evaluate(() =>
				window.finishOutline({
					corners: [
						{ x: 0.05, y: 0.05 },
						{ x: 0.95, y: 0.05 },
						{ x: 0.95, y: 0.95 },
						{ x: 0.05, y: 0.95 }
					],
					method: 'border',
					detail: 'Detected outline'
				})
			);
			await expect(check).toBeEnabled();
			await expect(page.getByText('Detected outline', { exact: true })).toBeVisible();
			const before = await page.locator('output').textContent();
			await detect.click();
			await expect.poll(() => page.evaluate(() => window.outlineCalls.length)).toBe(2);
			await page.getByRole('button', { name: 'Cancel border detection' }).click();
			await expect(page.getByRole('alert')).toContainText('cancelled');
			assert.equal(await page.locator('output').textContent(), before);
			await expect(check).toBeEnabled();
			await detect.click();
			await expect.poll(() => page.evaluate(() => window.outlineCalls.length)).toBe(3);
			await page.evaluate(() =>
				window.finishOutline({ corners: null, method: null, detail: 'Not enough anchors.' })
			);
			await expect(page.getByRole('alert')).toContainText('current outline was kept');
			assert.equal(await page.locator('output').textContent(), before);
			await page.evaluate(() => window.autoFallback());
			await expect(page.getByText('Finding printed anchors', { exact: true })).toBeVisible();
			await page.evaluate(() =>
				window.finishOutline({
					corners: [
						{ x: 0.08, y: 0.08 },
						{ x: 0.92, y: 0.08 },
						{ x: 0.92, y: 0.92 },
						{ x: 0.08, y: 0.92 }
					],
					method: 'anchors',
					detail: 'Estimated from printed anchors. Confirm corners.'
				})
			);
			await expect(
				page.getByText('Estimated from printed anchors. Confirm corners.', { exact: true })
			).toBeVisible();
			await expect(check).toBeEnabled();
			assert.equal(await page.evaluate(() => window.outlineCalls.length), 4);
			assert.match(
				await page.evaluate(() => window.outlineCalls.at(-1).referenceUrl),
				/revision=r1/
			);
			const aligned = await page.locator('output').textContent();
			await detect.click();
			await expect.poll(() => page.evaluate(() => window.outlineCalls.length)).toBe(5);
			await page.evaluate(() => window.replacePhoto());
			await expect(detect).toBeEnabled();
			assert.equal(await page.locator('output').textContent(), aligned);
			await expect(page.getByRole('alert')).toHaveCount(0);
			assert.deepEqual(errors, []);
		} finally {
			await browser?.close();
			await server?.close();
			assert.equal(path.dirname(root), process.cwd());
			rmSync(root, { recursive: true, force: true });
		}
	}
);
