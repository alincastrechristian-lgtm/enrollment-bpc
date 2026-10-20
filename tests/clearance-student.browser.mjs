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
				'documents.js': `export function getStudentDocuments(){return {current:{items:[],uploadBlock:null}};}`,
				'index.html':
					'<html data-theme="light"><main id="app" style="padding:24px"></main><script type="module" src="/main.js"></script></html>',
				'main.js':
					"import './style.css';import {mount} from 'svelte';import Student from '" +
					path.resolve('src/routes/user/enrollment/StudentClearance.svelte').replaceAll('\\', '/') +
					"';import Findings from '" +
					path.resolve('src/lib/clearance/ClearanceFindings.svelte').replaceAll('\\', '/') +
					"';import Notice from '" +
					path
						.resolve('src/lib/pages/Dashboard/Student/ClearanceNotice.svelte')
						.replaceAll('\\', '/') +
					"';const reminder=document.createElement('aside');reminder.style.marginBottom='24px';document.getElementById('app').append(reminder);mount(Notice,{target:reminder});mount(Student,{target:document.getElementById('app')});window.showStaffFindings=()=>{const target=document.createElement('aside');target.id='staff-findings';document.body.append(target);mount(Findings,{target,props:{report:window.lastReport,showReference:true}});};",
				'style.css': "@import '../src/routes/layout.css'; @source '../src';",
				'paths.js':
					'export const resolve=(route,params={})=>route.replace(/\\[([^\\]]+)\\]/g,(_,key)=>encodeURIComponent(params[key]));',
				'scan.js': `export async function loadUpload(){const image=new Image();image.src='/reference.jpg';await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);return canvas;}export const detectBorder=()=>[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];`,
				'actions.svelte.js': `const state=$state({current:{id:'e',revision:0,status:'enrolled',finalizedGrades:false,submittedClearance:false,semester:2,schoolYearStart:2025},template:{revision:'template',definition:{semester:'2',schoolYear:'2025-2026',personalFields:[{field:'studentName'},{field:'studentNumber'}]}},submission:null});
			window.paperMode=()=>{state.automatedClearanceVerificationEnabled=false;state.current.finalizedGrades=true;state.current.submittedClearance=false;state.submission=null;};window.paperApproved=()=>{state.current.submittedClearance=true;};window.finalize=()=>{state.current.finalizedGrades=true;};window.checkPasses=false;window.identityReview=false;window.uploads=[];window.requests=[];window.failUpload=false;window.setTemplateTerm=(semester,schoolYear)=>{state.template.definition={semester,schoolYear,personalFields:[{field:"studentName"},{field:"studentNumber"}]};};
			window.reject=()=>{state.submission.status='rejected';state.submission.rejectionReason='Please complete the Library signature.';};window.drop=()=>{state.current.status='dropped';};window.restoreEnrollment=()=>{state.current.status='enrolled';};
			window.outdateIdentity=()=>{window.savedIdentity=state.submission.report.identity;state.submission.report.identity='deferred';};window.restoreIdentity=()=>{state.submission.report.identity=window.savedIdentity;};window.outdate=()=>{delete state.submission.report.officeCheckVersion;};window.restoreChecks=()=>{state.submission.report.officeCheckVersion=2;};window.verify=()=>{state.submission.status='verified';state.current.submittedClearance=true;};
			window.newTerm=()=>{state.current={...state.current,id:'next',finalizedGrades:false,submittedClearance:false};state.submission=null;};
			const check=(verdict)=>({label:'Upload: Printed form',verdict,detail:'Uploaded document evidence'});
			export function getStudentClearance(){return {get current(){return state;}};}
			export const uploadClearance={fields:new Proxy({}, {get:(_,name)=>({as:(type,value)=>({name,type,...(value===undefined?{}:{value})})})}),enhance:callback=>({onsubmit:async event=>{event.preventDefault();const element=event.currentTarget;let result;await callback({element,get result(){return result;},submit:async()=>{if(window.failUpload)throw Error('Simulated upload failure');const data=new FormData(element);window.uploads.push({name:data.get('file')?.name,corners:data.get('corners'),revision:data.get('revision'),enrollmentId:data.get('enrollmentId')});const report={template:[{label:'Reference: Printed form',verdict:'pass',detail:'Saved reference evidence'},check(window.checkPasses?'pass':'fail'),{label:'Logo',verdict:'pass',detail:'Uploaded logo evidence'}],offices:window.checkPasses?[check('pass')]:[],identity:window.checkPasses?{verdict:window.identityReview?'review':'match',detail:window.identityReview?'Name needs manual verification':'Student number matches',name:{status:'exact',detected:'Student',expected:'Student',detail:'Name matches'},studentNumber:{status:'exact',detected:'MA-001',expected:'MA-001',detail:'Number matches'}}:'deferred',officeCheckVersion:2,identityCheckVersion:1,identityPresence:{name:{label:'Name writing',verdict:'pass',detail:'Present'},studentNumber:{label:'Number writing',verdict:'pass',detail:'Present'}}};window.lastReport=report;result={success:window.checkPasses,report};if(window.checkPasses){state.submission={id:'submission',filename:'clearance-reference.jpg',status:'ready',report};result.report=state.submission.report;window.lastReport=state.submission.report;}return true;}});}})};
			export async function requestEnrollment(data){window.requests.push(data);state.submission.status='requested';state.submission.requestedAt=new Date();}`
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
							find: '#lib/actions/documents.remote.js',
							replacement: path.join(root, 'documents.js')
						},
						{ find: '#lib/clearance/scan.client.js', replacement: path.join(root, 'scan.js') },
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
			await page.route('**/reference.jpg', (route) =>
				route.fulfill({
					path: path.resolve('static/clearance-reference.jpg'),
					contentType: 'image/jpeg'
				})
			);
			await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`, {
				waitUntil: 'networkidle'
			});
			await expect(
				page.getByText('Wait for staff to finalize your grades before uploading clearance.')
			).toBeVisible();
			await expect(page.getByLabel('Upload clearance', { exact: true })).toHaveCount(0);
			const reminder = page.getByRole('region', { name: 'Clearance reminder', exact: true });
			await expect(reminder).toHaveCount(0);
			await page.evaluate(() => window.finalize());
			await page.evaluate(() => window.setTemplateTerm('1', '2026-2027'));
			await expect(page.getByLabel('Upload clearance', { exact: true })).toBeVisible();
			await expect(
				page.getByText('Use the clearance form for Semester 2, SY 2025-2026.', { exact: false })
			).toBeVisible();
			await expect(
				page.getByText('Clearance template needs updating', { exact: true })
			).toHaveCount(0);
			await page.evaluate(() => window.setTemplateTerm('2', '2025-2026'));
			await expect(
				reminder.getByRole('link', { name: 'Upload clearance', exact: true })
			).toHaveAttribute('href', '/user/enrollment#clearance');
			await page.evaluate(() => window.drop());
			await expect(reminder).toHaveCount(0);
			await expect(page.getByLabel('Upload clearance', { exact: true })).toHaveCount(0);
			await page.evaluate(() => window.restoreEnrollment());
			mkdirSync('.tmp', { recursive: true });
			await page.screenshot({ path: '.tmp/clearance-upload-student-desktop.png', fullPage: true });
			await page.setViewportSize({ width: 390, height: 844 });
			assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
			await page.screenshot({ path: '.tmp/clearance-upload-student-mobile.png', fullPage: true });
			await page.setViewportSize({ width: 1200, height: 1000 });
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
			await expect(
				reminder.getByRole('heading', { name: 'Your clearance is ready', exact: true })
			).toBeVisible();
			await expect(page.getByLabel('Upload clearance', { exact: true })).toHaveCount(0);
			await page.getByRole('button', { name: 'Replace saved clearance', exact: true }).click();
			await expect(page.getByLabel('Upload clearance', { exact: true })).toBeVisible();
			await page
				.getByLabel('Upload clearance', { exact: true })
				.setInputFiles('static/clearance-reference.jpg');
			await expect(request).toBeDisabled();
			await page.getByRole('button', { name: 'Cancel replacement', exact: true }).click();
			await expect(page.getByLabel('Upload clearance', { exact: true })).toHaveCount(0);
			await expect(request).toBeEnabled();
			await page.evaluate(() => window.outdate());
			await expect(request).toHaveCount(0);
			await expect(page.getByText('Office checks are outdated.', { exact: false })).toBeVisible();
			await page
				.getByLabel('Upload clearance', { exact: true })
				.setInputFiles('static/clearance-reference.jpg');
			await expect(page.getByText('Office checks are outdated.', { exact: false })).toHaveCount(0);
			await expect(save).toBeEnabled();
			await page.evaluate(() => (window.failUpload = true));
			await save.click();
			await expect(
				page.getByText('Could not check clearance. Try again.', { exact: true })
			).toBeVisible();
			await expect(page.getByText('Office checks are outdated.', { exact: false })).toHaveCount(0);
			await expect(page.getByText('Uploaded document evidence', { exact: true })).toHaveCount(0);
			await page.evaluate(() => (window.failUpload = false));
			await page.getByLabel('Upload clearance', { exact: true }).setInputFiles([]);
			await page.evaluate(() => window.restoreChecks());
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
			await expect(
				reminder.getByRole('heading', { name: 'Enrollment request sent', exact: true })
			).toBeVisible();
			await expect(
				reminder.getByRole('link', { name: 'Upload clearance', exact: true })
			).toHaveCount(0);
			await expect(page.getByText('Saved reference evidence', { exact: true })).toHaveCount(0);
			await page.evaluate(() => window.outdate());
			await expect(page.getByLabel('Upload clearance', { exact: true })).toBeVisible();
			await expect(page.getByText('Office checks are outdated.', { exact: false })).toBeVisible();
			await expect(
				reminder.getByRole('link', { name: 'Review clearance', exact: true })
			).toBeVisible();
			await page.evaluate(() => window.restoreChecks());
			await expect(page.getByLabel('Upload clearance', { exact: true })).toHaveCount(0);
			await expect(page.getByText('Student name and number', { exact: false })).toBeVisible();
			await page.evaluate(() => window.outdateIdentity());
			await expect(page.getByLabel('Upload clearance', { exact: true })).toBeVisible();
			await expect(
				reminder.getByRole('heading', { name: 'Upload your clearance again', exact: true })
			).toBeVisible();
			await page.evaluate(() => window.restoreIdentity());
			await expect(page.getByLabel('Upload clearance', { exact: true })).toHaveCount(0);

			mkdirSync('.tmp', { recursive: true });
			await page.screenshot({ path: '.tmp/clearance-request-student-desktop.png', fullPage: true });
			await page.setViewportSize({ width: 390, height: 844 });
			await page.waitForTimeout(300);
			assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
			await page.screenshot({ path: '.tmp/clearance-request-student-mobile.png', fullPage: true });
			await page.evaluate(() => window.reject());
			await expect(
				reminder.getByRole('heading', { name: 'Upload your clearance again', exact: true })
			).toBeVisible();
			await expect(
				page.getByText('Correction requested: Please complete the Library signature.', {
					exact: true
				})
			).toBeVisible();
			await expect(page.getByLabel('Upload clearance', { exact: true })).toBeVisible();
			await page.evaluate(() => window.verify());
			await expect(reminder).toHaveCount(0);
			await expect(
				page.getByText(
					'Clearance verified. The Registrar/admin can now complete your enrollment, subject to academic requirements.'
				)
			).toBeVisible();
			await page.evaluate(() => window.newTerm());
			await expect(reminder).toHaveCount(0);
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
			await page.evaluate(() => {
				window.finalize();
				window.identityReview = true;
			});
			const studentClearance = page.getByRole('region', {
				name: 'Clearance and enrollment request',
				exact: true
			});
			await studentClearance
				.getByLabel('Upload clearance', { exact: true })
				.setInputFiles('static/clearance-reference.jpg');
			await save.click();
			await expect(
				studentClearance.getByText('Manual identity review needed', { exact: true })
			).toBeVisible();
			await expect(
				studentClearance.getByText(
					'Clearance saved. Student name or number needs manual verification.',
					{ exact: false }
				)
			).toBeVisible();
			await expect(
				reminder.getByRole('heading', { name: 'Identity review needed', exact: true })
			).toBeVisible();
			await expect(request).toBeEnabled();
			await expect(studentClearance.getByLabel('Upload clearance', { exact: true })).toHaveCount(0);
			await request.click();
			await expect(
				studentClearance.getByText(
					'Your enrollment request is awaiting Registrar/admin clearance review.'
				)
			).toBeVisible();
			await page.evaluate(() => window.reject());
			await expect(studentClearance.getByLabel('Upload clearance', { exact: true })).toBeVisible();
			await expect(
				studentClearance.getByText('Correction requested:', { exact: false })
			).toBeVisible();
			await page.evaluate(() => window.verify());
			await expect(
				studentClearance.locator('summary').getByText('Verified by staff', { exact: true })
			).toBeVisible();
			await expect(
				studentClearance.getByText('Automated identity reading needed review.', { exact: false })
			).toBeVisible();

			await page.evaluate(() => window.paperMode());
			await expect(
				studentClearance.getByRole('heading', { name: 'Paper clearance', exact: true })
			).toBeVisible();
			await expect(studentClearance.getByLabel('Upload clearance', { exact: true })).toHaveCount(0);
			await expect(
				reminder.getByRole('heading', { name: 'Submit your paper clearance', exact: true })
			).toBeVisible();
			await page.evaluate(() => window.paperApproved());
			await expect(reminder).toHaveCount(0);
			await expect(studentClearance.getByText(/Your clearance has been verified/)).toBeVisible();
			assert.deepEqual(errors, []);
		} finally {
			await browser?.close();
			await server?.close();
			rmSync(root, { recursive: true, force: true });
		}
	}
);
