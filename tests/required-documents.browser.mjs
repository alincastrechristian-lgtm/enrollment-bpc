import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

test(
	'staff requests documents; student popup and reminders persist through uploads, rejection and verification',
	{ timeout: 120000 },
	async () => {
		const root = mkdtempSync(path.resolve('.tmp-required-documents-'));
		const source = (name) =>
			path.resolve(`src/lib/components/documents/${name}.svelte`).replaceAll('\\', '/');
		let server, browser;
		try {
			const files = {
				'index.html':
					'<html data-theme="light"><main id="app" style="padding:24px"></main><script type="module" src="/main.js"></script></html>',
				'main.js':
					"import './style.css';import {mount} from 'svelte';import Harness from './Harness.svelte';document.addEventListener('click',event=>{if(event.target.closest('a'))event.preventDefault();});mount(Harness,{target:document.getElementById('app')});",
				'style.css': "@import '../src/routes/layout.css'; @source '../src';",
				'paths.js':
					'export const resolve=(route,params={})=>route.replace(/\\[([^\\]]+)\\]/g,(_,key)=>encodeURIComponent(params[key]));',
				'popup.js': 'export async function showYesNo(){return true;}',
				'actions.svelte.js': `const state=$state({userId:'s',items:[],canRequest:true,enrollmentId:'e',uploadBlock:null});
			const query={get current(){return state;},async refresh(){}};
			export const getStudentDocuments=()=>query;export const getStudentDocumentReview=()=>query;
			window.requests=[];window.uploads=[];window.reviews=[];window.failUpload=false;
			export async function requestDocuments(input){window.requests.push(input);for(const kind of input.kinds)state.items.push({id:kind,kind,status:'requested',revision:0,dueYearLevel:4,dueSemester:2,hasFile:false});}
			export async function reviewDocument(input){window.reviews.push(input);const item=state.items.find(item=>item.id===input.id);item.status=input.decision;item.rejectionReason=input.reason??null;item.reviewerName='Registrar';item.revision++;}
			const instances=new Map();export const uploadDocument={for(id){if(!instances.has(id))instances.set(id,{fields:new Proxy({}, {get:(_,name)=>({as:(type,value)=>({name,type,...(value===undefined?{}:{value})})})}),enhance:callback=>({onsubmit:async event=>{event.preventDefault();const element=event.currentTarget;await callback({element,submit:async()=>{if(window.failUpload)throw Error('Upload failed');const data=new FormData(element);window.uploads.push({id:data.get('id'),revision:data.get('revision'),name:data.get('file').name});const item=state.items.find(item=>item.id===id);item.status='uploaded';item.hasFile=true;item.filename=data.get('file').name;item.revision++;item.rejectionReason=null;return true;}});}})});return instances.get(id);}};`,
				'Harness.svelte': `<script>import Review from '${source('DocumentReview')}';import Student from '${source('StudentDocuments')}';import Notice from '${source('DocumentNotice')}';let staff=$state(true);let generation=$state(0);window.student=()=>{staff=false;generation++;};window.staff=()=>staff=true;window.remount=()=>generation++;</script>{#if staff}<Review userId="s" />{:else}{#key generation}<Notice popup /><Notice /><Student />{/key}{/if}`
			};
			for (const [name, content] of Object.entries(files))
				writeFileSync(path.join(root, name), content);
			server = await createServer({
				root,
				configFile: false,
				cacheDir: path.join(root, 'node_modules/.vite'),
				plugins: [tailwindcss(), svelte({ configFile: false, preprocess: vitePreprocess() })],
				resolve: {
					alias: [
						{
							find: '#lib/actions/documents.remote.js',
							replacement: path.join(root, 'actions.svelte.js')
						},
						{
							find: '#lib/components/Popup/Popup.svelte.js',
							replacement: path.join(root, 'popup.js')
						},
						{ find: '$app/paths', replacement: path.join(root, 'paths.js') },
						{ find: '#lib', replacement: path.resolve('src/lib') }
					]
				},
				server: { host: '127.0.0.1', port: 0 }
			});
			await server.listen();
			browser = await chromium.launch({ channel: 'chrome', headless: true });
			const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
			const errors = [];
			page.on('pageerror', (cause) => errors.push(cause.message));
			await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`, {
				waitUntil: 'networkidle'
			});
			for (const label of ['Form 137', 'SF10', 'TOR'])
				await page.getByRole('checkbox', { name: label, exact: true }).check();
			await page.getByRole('button', { name: 'Request documents', exact: true }).click();
			await expect(
				page.getByRole('checkbox', { name: 'TOR (requested)', exact: true })
			).toBeDisabled();
			assert.equal(await page.evaluate(() => window.requests[0].kinds.length), 3);
			await page.evaluate(() => window.student());
			const popup = page.getByRole('dialog');
			await expect(popup).toBeVisible();
			await expect(popup.getByText(/Form 137, SF10, TOR/)).toBeVisible();
			await page.getByRole('button', { name: 'Remind me later' }).click();
			await expect(popup).not.toBeVisible();
			await page.evaluate(() => window.remount());
			await expect(popup).not.toBeVisible();
			await expect(
				page.getByRole('region', { name: 'Upload your required documents' })
			).toBeVisible();
			const file = {
				name: 'document.pdf',
				mimeType: 'application/pdf',
				buffer: Buffer.from('%PDF-1.7\n%%EOF')
			};
			for (const label of ['Form 137', 'SF10', 'TOR']) {
				await page.getByLabel(`Choose ${label}`, { exact: true }).setInputFiles(file);
				await page
					.getByRole('article')
					.filter({ has: page.getByRole('heading', { name: label, exact: true }) })
					.getByRole('button', { name: 'Upload document', exact: true })
					.click();
				await expect(popup).not.toBeVisible();
			}
			await expect(
				page.getByRole('region', { name: 'Documents awaiting verification' })
			).toBeVisible();
			assert.equal(await page.evaluate(() => window.uploads.length), 3);
			await page.evaluate(() => window.staff());
			const tor = page
				.getByRole('article')
				.filter({ has: page.getByRole('heading', { name: 'TOR', exact: true }) });
			await expect(tor.getByRole('button', { name: 'Request another copy' })).toBeDisabled();
			await tor
				.getByLabel('Reason for requesting another copy')
				.fill('Please include the missing page.');
			await tor.getByRole('button', { name: 'Request another copy' }).click();
			await page.evaluate(() => window.student());
			await expect(popup).toBeVisible();
			await expect(popup.getByRole('link', { name: 'View required documents' })).toHaveAttribute(
				'href',
				'/user/enrollment#required-documents'
			);
			await popup.getByRole('link', { name: 'View required documents' }).click();
			await expect(popup).not.toBeVisible();
			await expect(
				page.getByText('Registrar’s note: Please include the missing page.')
			).toBeVisible();
			await page.getByLabel('Choose TOR', { exact: true }).setInputFiles(file);
			await page.getByRole('button', { name: 'Upload replacement' }).click();
			await page.evaluate(() => window.staff());
			for (const label of ['Form 137', 'SF10', 'TOR'])
				await page
					.getByRole('article')
					.filter({ has: page.getByRole('heading', { name: label, exact: true }) })
					.getByRole('button', { name: 'Verify document' })
					.click();
			await page.evaluate(() => window.student());
			await expect(
				page.getByRole('region', { name: 'Documents awaiting verification' })
			).toHaveCount(0);
			await expect(
				page.getByText('Verified by the Registrar. No further action needed.')
			).toHaveCount(3);
			await page.setViewportSize({ width: 390, height: 844 });
			assert.equal(
				await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
				true
			);
			assert.deepEqual(errors, []);
		} finally {
			await browser?.close();
			await server?.close();
			const resolved = path.resolve(root);
			assert.equal(path.dirname(resolved), process.cwd());
			assert.ok(path.basename(resolved).startsWith('.tmp-required-documents-'));
			rmSync(resolved, { recursive: true, force: true });
		}
	}
);
