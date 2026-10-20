import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

test(
	'staff review requires identity confirmation, supports another upload, and distinguishes staff approval from OCR',
	{ timeout: 120000 },
	async () => {
		const root = mkdtempSync(path.resolve('.tmp-clearance-review-'));
		let server, browser;
		try {
			const files = {
				'index.html':
					'<html data-theme="light"><main id="app" style="padding:24px"></main><script type="module" src="/main.js"></script></html>',
				'main.js':
					"import './style.css';import {mount} from 'svelte';import Page from '" +
					path.resolve('src/routes/user/students/EnrollmentDetails.svelte').replaceAll('\\', '/') +
					"';import {data} from './fixture.svelte.js';mount(Page,{target:document.getElementById('app'),props:{data}});",
				'style.css': "@import '../src/routes/layout.css'; @source '../src';",
				'Empty.svelte': '<span></span>',
				'paths.js':
					'export const resolve=(route,params={})=>route.replace(/\\[([^\\]]+)\\]/g,(_,key)=>encodeURIComponent(params[key]));',
				'navigation.js':
					'export const beforeNavigate=()=>{};export const refreshAll=async()=>{};export const goto=async()=>{};',
				'labels.js': 'export const semesterLabel=n=>`Semester ${n}`;',
				'popup.js':
					'window.verifyDialogs=[];window.confirmReview=true;export async function showYesNo(input){window.verifyDialogs.push(input);return window.confirmReview;}export const showSuccess=()=>{};',
				'fixture.svelte.js': `const field=(detected,expected,status)=>({detected,expected,status,similarity:70,detail:'Read original document'});
			 const report={officeCheckVersion:2,identityCheckVersion:1,identityPresence:{name:{label:'Name writing',verdict:'pass',detail:'Present'},studentNumber:{label:'Number writing',verdict:'pass',detail:'Present'}},template:[{label:'Upload: Template',verdict:'pass',detail:'Matches template'}],offices:[{label:'Library',verdict:'pass',detail:'Marked'}],identity:{verdict:'review',detail:'Name needs review',name:field('Studen','Student','close'),studentNumber:field('001','MA-001','exact')}};
			 export const data=$state({student:{id:'s',name:'Student',studentId:'MA-001',email:'s@example.invalid'},enrollment:{id:'e',revision:0,status:'enrolled',finalizedGrades:true,submittedClearance:false,schoolYearStart:2025,semester:2,yearLevel:1,section:'A',enrolledAt:null,meetingRequestSentAt:null,followUpCompletedAt:null,curriculum:{programCode:'BSIS',name:'BSIS',program:{name:'Information Systems'}},subjects:[{id:'es',grade:1.5,units:3,subjectCode:'IS101',subjectName:'Information Systems'}]},clearance:{id:'upload-1',status:'requested',filename:'clearance.jpg',report},isCurrent:true,canEdit:false,canFinalize:false,canDrop:false,gradeLockReason:null});
			 window.paperMode=()=>{data.automatedClearanceVerificationEnabled=false;data.clearance=null;data.enrollment.submittedClearance=false;data.enrollment.revision++;};window.newRequest=()=>{data.clearance={id:'upload-2',status:'requested',filename:'clearance.jpg',report};data.enrollment.revision++;};window.bumpRevision=()=>data.enrollment.revision++;
			 window.verifyCalls=[];window.rejectCalls=[];`,
				'grades.js': `import{data}from'./fixture.svelte.js';
			 export async function verifyEnrollmentClearance(input){window.verifyCalls.push(input);if(data.clearance)data.clearance.status='verified';data.enrollment.submittedClearance=true;}
			 export const finalizeEnrollmentGrades=async()=>{};export const completeEnrollmentFollowUp=async()=>{};export const dropEnrollment=async()=>{};export const sendEnrollmentMeetingRequest=async()=>{};export const updateEnrollmentGrades=async()=>{};`,
				'clearance.js': `import{data}from'./fixture.svelte.js';export async function rejectClearance(input){window.rejectCalls.push(input);data.clearance.status='rejected';data.clearance.rejectionReason=input.reason;data.enrollment.revision++;}`
			};
			for (const [name, content] of Object.entries(files))
				writeFileSync(path.join(root, name), content);
			server = await createServer({
				root,
				configFile: false,
				cacheDir: path.join(root, 'node_modules/.vite'),
				optimizeDeps: { include: ['@lucide/svelte', '@sveltejs/kit', 'zod'] },
				plugins: [tailwindcss(), svelte({ configFile: false, preprocess: vitePreprocess() })],
				resolve: {
					alias: [
						{
							find: './EnrollmentRecordActions.svelte',
							replacement: path.join(root, 'Empty.svelte')
						},
						{
							find: '#lib/components/CORDownload.svelte',
							replacement: path.join(root, 'Empty.svelte')
						},
						{
							find: '../curriculum/SubjectLayout.svelte',
							replacement: path.join(root, 'labels.js')
						},
						{ find: '#lib/actions/grades.remote.js', replacement: path.join(root, 'grades.js') },
						{
							find: '#lib/actions/clearance.remote.js',
							replacement: path.join(root, 'clearance.js')
						},
						{
							find: '#lib/components/Popup/Popup.svelte.js',
							replacement: path.join(root, 'popup.js')
						},
						{ find: '$app/paths', replacement: path.join(root, 'paths.js') },
						{ find: '$app/navigation', replacement: path.join(root, 'navigation.js') },
						{ find: '#lib', replacement: path.resolve('src/lib') }
					]
				},
				server: { host: '127.0.0.1', port: 0 }
			});
			await server.listen();
			browser = await chromium.launch({ channel: 'chrome', headless: true });
			const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } }),
				errors = [];
			page.on('pageerror', (e) => errors.push(e.message));
			await page.route('**/user/clearance-files/*', (route) =>
				route.fulfill({
					path: path.resolve('static/clearance-reference.jpg'),
					contentType: 'image/jpeg'
				})
			);
			await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`, {
				waitUntil: 'networkidle'
			});
			const verify = page.getByRole('button', { name: 'Verify clearance', exact: true });
			const acknowledge = page.getByRole('checkbox', {
				name: 'I checked the original clearance and confirm the student name and number match this record.',
				exact: true
			});
			const enroll = page.getByRole('link', { name: 'Enroll for next term', exact: true });
			await expect(
				page.getByText('Manual identity verification required', { exact: true })
			).toBeVisible();
			await expect(verify).toBeDisabled();
			await expect(enroll).toHaveCount(0);
			await acknowledge.check();
			await expect(verify).toBeEnabled();
			await acknowledge.uncheck();
			await expect(verify).toBeDisabled();
			const retry = page.getByRole('button', { name: 'Request another upload', exact: true });
			await expect(retry).toBeDisabled();
			await page
				.getByLabel('Reason for correction', { exact: true })
				.fill('Please upload a clearer name and student number.');
			await retry.click();
			await expect(acknowledge).toHaveCount(0);
			await expect(verify).toBeDisabled();
			assert.match(await page.evaluate(() => window.rejectCalls[0].reason), /clearer name/);
			await expect(enroll).toHaveCount(0);
			await page.evaluate(() => window.newRequest());
			await expect(acknowledge).not.toBeChecked();
			await acknowledge.check();
			await page.evaluate(() => window.bumpRevision());
			await expect(acknowledge).not.toBeChecked();
			await expect(verify).toBeDisabled();
			await acknowledge.check();
			await page.evaluate(() => (window.confirmReview = false));
			await verify.click();
			assert.equal(await page.evaluate(() => window.verifyCalls.length), 0);
			await page.evaluate(() => (window.confirmReview = true));
			await verify.click();
			await expect(enroll).toBeVisible();
			await page.getByText(/Uploaded clearance review.*verified/).click();
			await expect(page.getByText('Verified by staff', { exact: true })).toBeVisible();
			const input = await page.evaluate(() => window.verifyCalls[0]);
			assert.equal(input.identityConfirmed, true);
			assert.equal(input.submissionId, 'upload-2');
			assert.match(
				await page.evaluate(() => window.verifyDialogs.at(-1).message),
				/Automated identity reading needs review/
			);

			await page.reload({ waitUntil: 'networkidle' });
			await page.evaluate(() => window.paperMode());
			await expect(verify).toBeEnabled();
			await expect(enroll).toHaveCount(0);
			await expect(acknowledge).toHaveCount(0);
			await verify.click();
			await expect(enroll).toBeVisible();
			assert.equal(await page.evaluate(() => window.verifyCalls[0].manualClearanceConfirmed), true);
			assert.match(
				await page.evaluate(() => window.verifyDialogs.at(-1).message),
				/completed paper clearance/
			);
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
