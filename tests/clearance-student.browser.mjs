import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { createServer } from 'vite';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
test(
	'student clearance workflow gates upload, shows failed checks, requests review, and waits for staff enrollment',
	{ timeout: 120000 },
	async () => {
		const root = mkdtempSync(path.resolve('.tmp-clearance-flow-'));
		let server, browser;
		try {
			const files = {
				'index.html':
					'<html data-theme="light"><main id="app" style="padding:24px"></main><script type="module" src="/main.js"></script></html>',
				'main.js':
					"import './style.css';import {mount} from 'svelte';import Student from '" +
					path.resolve('src/routes/user/enrollment/StudentClearance.svelte').replaceAll('\\', '/') +
					"';import Findings from '" +
					path.resolve('src/lib/clearance/ClearanceFindings.svelte').replaceAll('\\', '/') +
					"';mount(Student,{target:document.getElementById('app')});window.showStaffFindings=()=>{const target=document.createElement('aside');target.id='staff-findings';document.body.append(target);mount(Findings,{target,props:{report:window.lastReport,showReference:true}});};",
				'style.css': "@import '../src/routes/layout.css'; @source '../src';",
				'paths.js':
					'export const resolve=(route,params={})=>route.replace(/\\[([^\\]]+)\\]/g,(_,key)=>encodeURIComponent(params[key]));',
				'actions.svelte.js': `const state=$state({current:{id:'e',revision:0,status:'enrolled',finalizedGrades:false,submittedClearance:false,semester:2,schoolYearStart:2025},template:{revision:'template',definition:{}},submission:null});
			window.finalize=()=>{state.current.finalizedGrades=true;};window.checkPasses=false;window.uploads=[];window.requests=[];
			window.verify=()=>{state.submission.status='verified';state.current.submittedClearance=true;};
			window.newTerm=()=>{state.current={...state.current,id:'next',finalizedGrades:false,submittedClearance:false};state.submission=null;};
			const check=(verdict)=>({label:'Upload: Printed form',verdict,detail:'Uploaded document evidence'});
			export function getStudentClearance(){return {get current(){return state;}};}
			export const uploadClearance={fields:new Proxy({}, {get:(_,name)=>({as:(type,value)=>({name,type,...(value===undefined?{}:{value})})})}),enhance:callback=>({onsubmit:async event=>{event.preventDefault();const element=event.currentTarget;let result;await callback({element,get result(){return result;},submit:async()=>{const data=new FormData(element);window.uploads.push({name:data.get('file')?.name,corners:data.get('corners'),revision:data.get('revision'),enrollmentId:data.get('enrollmentId')});const report={template:[{label:'Reference: Printed form',verdict:'pass',detail:'Saved reference evidence'},check(window.checkPasses?'pass':'fail'),{label:'Logo',verdict:'pass',detail:'Uploaded logo evidence'}],offices:window.checkPasses?[check('pass')]:[],identity:'deferred'};window.lastReport=report;result={success:window.checkPasses,report};if(window.checkPasses)state.submission={id:'submission',filename:'clearance-reference.jpg',status:'ready',report};return true;}});}})};
			export async function requestEnrollment(data){window.requests.push(data);state.submission.status='requested';state.submission.requestedAt=new Date();}`
			};
			for (const [name, content] of Object.entries(files))
				writeFileSync(path.join(root, name), content);
			server = await createServer({
				root,
				configFile: false,
				plugins: [tailwindcss(), svelte({ configFile: false, preprocess: vitePreprocess() })],
				resolve: {
					alias: [
						{
							find: '#lib/actions/clearance.remote.js',
							replacement: path.join(root, 'actions.svelte.js')
						},
						{ find: '$app/paths', replacement: path.join(root, 'paths.js') },
						{ find: '#lib', replacement: path.resolve('src/lib') }
					]
				},
				server: { host: '127.0.0.1', port: 0 }
			});
			await server.listen();
			browser = await chromium.launch({ channel: 'chrome', headless: true });
			const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
			const errors = [];
			page.on('pageerror', (e) => errors.push(e.message));
			await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`, {
				waitUntil: 'networkidle'
			});
			await expect(
				page.getByText('Wait for staff to finalize your grades before uploading clearance.')
			).toBeVisible();
			await expect(page.getByLabel('Upload clearance', { exact: true })).toHaveCount(0);
			await page.evaluate(() => window.finalize());
			await page
				.getByLabel('Upload clearance', { exact: true })
				.setInputFiles('static/clearance-reference.jpg');
			const save = page.getByRole('button', { name: 'Check and save clearance', exact: true });
			await expect(save).toBeEnabled();
			await save.click();
			await expect(
				page.getByText('Clearance did not pass all checks.', { exact: false })
			).toBeVisible();
			await expect(page.getByText('Uploaded document evidence', { exact: true })).toBeVisible();
			await expect(page.getByText('Uploaded logo evidence', { exact: true })).toBeVisible();
			await expect(page.getByText('Saved reference evidence', { exact: true })).toHaveCount(0);
			await expect(page.getByText('Saved template reference checks')).toHaveCount(0);
			await expect(
				page.getByRole('button', { name: 'Request enrollment', exact: true })
			).toHaveCount(0);
			await page.evaluate(() => (window.checkPasses = true));
			await save.click();
			const request = page.getByRole('button', { name: 'Request enrollment', exact: true });
			await expect(request).toBeEnabled();
			const uploads = await page.evaluate(() => window.uploads);
			assert.equal(uploads.length, 2);
			assert.equal(uploads[1].name, 'clearance-reference.jpg');
			assert.equal(uploads[1].revision, '0');
			assert.equal(JSON.parse(uploads[1].corners).length, 4);
			await request.click();
			await expect(
				page.getByText('Your enrollment request is awaiting Registrar/admin clearance review.')
			).toBeVisible();
			assert.deepEqual(await page.evaluate(() => window.requests), [
				{ submissionId: 'submission' }
			]);
			await expect(page.getByLabel('Upload clearance', { exact: true })).toHaveCount(0);
			await expect(page.getByText('Saved reference evidence', { exact: true })).toHaveCount(0);
			await expect(
				page.getByText('Personal information verification:', { exact: false })
			).toBeVisible();
			mkdirSync('.tmp', { recursive: true });
			await page.screenshot({ path: '.tmp/clearance-request-student-desktop.png', fullPage: true });
			await page.setViewportSize({ width: 390, height: 844 });
			await page.waitForTimeout(300);
			assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
			await page.screenshot({ path: '.tmp/clearance-request-student-mobile.png', fullPage: true });
			await page.evaluate(() => window.verify());
			await expect(
				page.getByText(
					'Clearance verified. The Registrar/admin can now complete your enrollment, subject to academic requirements.'
				)
			).toBeVisible();
			await page.evaluate(() => window.newTerm());
			await expect(
				page.getByText('Wait for staff to finalize your grades before uploading clearance.')
			).toBeVisible();
			await page.evaluate(() => window.showStaffFindings());
			const staff = page.locator('#staff-findings');
			const reference = staff
				.locator('details')
				.filter({ hasText: 'Saved template reference checks' });
			const uploaded = staff.locator('details').filter({ hasText: 'Uploaded clearance checks' });
			await expect(reference).toHaveCount(1);
			await expect(reference.getByText('Saved reference evidence', { exact: true })).toHaveCount(1);
			await expect(reference.getByText('Uploaded document evidence', { exact: true })).toHaveCount(
				0
			);
			await expect(uploaded.getByText('Uploaded document evidence', { exact: true })).toHaveCount(
				1
			);
			await expect(uploaded.getByText('Uploaded logo evidence', { exact: true })).toHaveCount(1);
			await expect(uploaded.getByText('Saved reference evidence', { exact: true })).toHaveCount(0);
			assert.deepEqual(errors, []);
		} finally {
			await browser?.close();
			await server?.close();
			rmSync(root, { recursive: true, force: true });
		}
	}
);
