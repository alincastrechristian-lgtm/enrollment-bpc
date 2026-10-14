import { chromium, expect } from '@playwright/test';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

const sourcePath = (file) => path.resolve(file).replaceAll('\\', '/');
test('enrollment page edits subjects, protects drafts, submits once, and opens complete student record', async () => {
	const root = mkdtempSync(path.resolve('.tmp-applicant-account-'));
	const files = {
		'index.html':
			'<html data-theme="light"><main id="app" class="bg-base-200 p-6"></main><script type="module" src="/main.js"></script></html>',
		'style.css': "@import '../src/routes/layout.css'; @source '../src';",
		'main.js':
			"import './style.css';import {mount} from 'svelte';import Harness from './Harness.svelte';mount(Harness,{target:document.getElementById('app')});",
		'state.svelte.js': 'export const page=$state({url:new URL(window.location.href)});',
		'auth-client.js':
			"import {readable} from 'svelte/store';export const authClient={useSession:()=>readable({data:{user:{name:'Test Registrar',role:'registrar'}}})};",
		'paths.js':
			"export const resolve=(route,params={})=>'/portal'+route.replace(/\\[([^\\]]+)\\]/g,(_,key)=>encodeURIComponent(params[key]));",
		'navigation.js': `import {onDestroy} from 'svelte';const hooks=new Set();window.navigation=[];
			export function beforeNavigate(hook){hooks.add(hook);onDestroy(()=>hooks.delete(hook));}
			window.attemptNavigation=(url)=>{let cancelled=false;for(const hook of hooks)hook({to:{url:new URL(url,window.location.href)},willUnload:false,cancel:()=>cancelled=true});return !cancelled;};
			export async function goto(url){const target=String(url);if(window.failNavigation)throw new Error('Navigation failed');if(window.attemptNavigation(target)){window.navigation.push(target);if(target.endsWith('/students/u'))window.show('student');}}
			export async function refreshAll(){}`,
		'actions.js': `window.accountCalls=[];window.mailCalls=[];window.questions=[];window.messages=[];window.confirm=true;
			export async function enrollStudent(data){window.accountCalls.push(data);if(window.failAccount)throw new Error('Enrollment changed');if(window.deferAccount)await new Promise(resolve=>window.finishAccount=resolve);return {success:true,userId:'u',studentId:'MA-202610-000001',enrollmentId:'current',invitationSent:window.invitationSent!==false};}
			export async function resendMagicLink(data){window.mailCalls.push(data);if(window.failMail)throw new Error('Mail failed');}
			export async function deleteApplicant(){};export async function createApplicant(){};export async function updateApplicant(){}`,
		'popup.js': `export async function showYesNo(props){window.questions.push(props);return window.confirm;}
			export function showLoading(){};export function showError(message){window.messages.push({type:'error',message});}export function showSuccess(message){window.messages.push({type:'success',message});}`,
		'Harness.svelte': `<script>
			import Topbar from '${sourcePath('src/lib/components/Topbar/Topbar.svelte')}';
			import {load as loadMetadata} from '${sourcePath('src/routes/user/+layout.ts')}';
			import {page} from './state.svelte.js';
			import Editor from '${sourcePath('src/routes/user/applicants/EnrollmentEditor.svelte')}';
			import Student from '${sourcePath('src/routes/user/students/[userId]/+page.svelte')}';
			import Students from '${sourcePath('src/routes/user/students/+page.svelte')}';
			import Applicant from '${sourcePath('src/routes/user/applicants/[applicantId]/+page.svelte')}';
			import Applicants from '${sourcePath('src/routes/user/applicants/+page.svelte')}';
			let mode=$state('enroll');let revision=$state(0);window.show=(value)=>mode=value;
			const routeId=$derived(mode==='enroll'?'/user/applicants/[applicantId]/enroll':mode==='student'||mode==='empty-student'?'/user/students/[userId]':mode==='list'?'/user/students':mode==='applicant'||mode==='linked-applicant'||mode==='incomplete'?'/user/applicants/[applicantId]':'/user/applicants');
			const routeUrl=$derived(new URL('/portal'+routeId.replace('[applicantId]','a').replace('[userId]','u'),window.location.href));
			const metadata=$derived(loadMetadata({url:routeUrl,route:{id:routeId}}));
			$effect(()=>{page.url=routeUrl;});
			window.reset=()=>{window.accountCalls=[];window.questions=[];window.navigation=[];window.messages=[];window.confirm=true;window.failAccount=false;window.deferAccount=false;window.invitationSent=true;window.failNavigation=false;mode='enroll';revision++;};
			const program={id:'p',code:'BSIS',name:'Information Systems',isActive:true};
			const applicant={id:'a',applicationId:'MA-202610-000001',name:'Test Student',userId:null,programCode:'BSIS',program,yearLevel:1,dateApplied:new Date(),email:'stored@example.com',contactNumber:'09123456789',address:'Bulacan',hasBirthCertificate:true,hasForm138:true,hasGoodMoral:true,hasPicture:true,createdAt:new Date(),updatedAt:new Date()};
			const curriculum={id:'c',name:'2026 Curriculum',programCode:'BSIS',program,yearLevels:2,semesters:2,publishedAt:new Date(),archivedAt:null,isActive:true};
			const entries=[{id:'cs1',subjectId:'s1',subjectCode:'SNAP101',subjectName:'Published Introduction',yearLevel:1,semester:1,units:3},{id:'cs2',subjectId:'s2',subjectCode:'SNAP102',subjectName:'Published Programming',yearLevel:1,semester:2,units:4},{id:'cs3',subjectId:'s3',subjectCode:'SNAP201',subjectName:'Published Databases',yearLevel:2,semester:1,units:2}];
			const subjects=[{id:'s1',code:'LIVE101',name:'Changed Introduction',isActive:true},{id:'s2',code:'LIVE102',name:'Other term',isActive:true},{id:'s3',code:'LIVE201',name:'Databases',isActive:true},{id:'s4',code:'EXTRA',name:'Extra subject',isActive:true}];
			const current={id:'current',studentId:'MA-202610-000001',curriculumId:'c',curriculum,section:'B',schoolYearStart:2025,semester:1,yearLevel:2,status:'pending',enrolledAt:new Date(),subjects:[{id:'es1',subjectCode:'SNAP201',subjectName:'Published Databases',source:'curriculum',units:0.5,remarks:null},{id:'es2',subjectCode:'LIVE101',subjectName:'Changed Introduction',source:'extra',units:1.25,remarks:'Additional subject'}]};
			const historical={...current,id:'old',schoolYearStart:2024,semester:2,yearLevel:1,section:'A',status:'withdrawn',subjects:[{id:'old-subject',subjectCode:'OLD101',subjectName:'Historical subject',source:'curriculum',units:1.5,remarks:null}]};
			const student={id:'u',name:applicant.name,email:applicant.email,image:null,emailVerified:false,setupComplete:false,banned:false,banReason:null,createdAt:new Date(),updatedAt:new Date(),applicant,studentData:{studentId:'MA-202610-000001',applicant,applicantId:'a',currentEnrollmentId:'current',currentEnrollment:current,enrollments:[current,historical]}};
		</script>
		<Topbar pageTitle={metadata.pageTitle} pageDescription={metadata.pageDescription} />
		{#key mode+revision}
			{#if mode==='enroll'}<Editor data={{applicant,program,curriculum,entries,subjects,schoolYearStart:2026}} />
			{:else if mode==='student'}<Student data={{student}} />
			{:else if mode==='empty-student'}<Student data={{student:{...student,applicant:null,studentData:null}}} />
			{:else if mode==='list'}<Students data={{users:[student],total:1,search:'',status:'all',filters:{}}} />
			{:else if mode==='applicant'}<Applicant data={{applicant,programs:[program]}} />
			{:else if mode==='linked-applicant'}<Applicant data={{applicant:{...applicant,userId:'u'},programs:[program]}} />
			{:else if mode==='incomplete'}<Applicant data={{applicant:{...applicant,hasPicture:false},programs:[program]}} />
			{:else}<Applicants data={{applicants:[applicant],programs:[program],total:1,search:'',status:'all',filters:{}}} />{/if}
		{/key}`
	};
	let server, browser;
	try {
		for (const [name, contents] of Object.entries(files))
			writeFileSync(path.join(root, name), contents);
		server = await createServer({
			root,
			configFile: false,
			plugins: [tailwindcss(), svelte({ configFile: false, preprocess: vitePreprocess() })],
			resolve: {
				alias: [
					{ find: '$app/state', replacement: path.join(root, 'state.svelte.js') },
					{ find: '$app/navigation', replacement: path.join(root, 'navigation.js') },
					{ find: '$app/paths', replacement: path.join(root, 'paths.js') },
					{ find: '#lib/auth-client.js', replacement: path.join(root, 'auth-client.js') },
					{ find: '#lib/actions/user.remote.js', replacement: path.join(root, 'actions.js') },
					{ find: '#lib/actions/applicant.remote.js', replacement: path.join(root, 'actions.js') },
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
		const page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
		await expect(page.getByRole('heading', { name: 'ENROLL STUDENT', exact: true })).toBeVisible();
		await expect(
			page.getByText(
				'Review applicant details, set enrollment information, and customize subjects and units.',
				{ exact: true }
			)
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(1);
		await expect(page.getByRole('link', { name: 'Cancel', exact: true })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Subject 1', exact: true })).toContainText(
			'SNAP101'
		);
		await page.getByLabel('Section', { exact: true }).fill('B');
		await page.getByLabel('School year start', { exact: true }).fill('2025');
		await page.getByLabel('Units for subject 1', { exact: true }).fill('1.5');
		await page.getByRole('button', { name: 'Add subject', exact: true }).click();
		async function chooseSubject(index, code) {
			await page.getByRole('button', { name: `Subject ${index}`, exact: true }).click();
			await page.getByRole('button', { name: new RegExp(`^${code} `) }).click();
		}
		await chooseSubject(2, 'LIVE102');
		await page.getByLabel('Units for subject 2', { exact: true }).fill('2.25');
		await expect(page.getByText('Extra', { exact: true })).toBeVisible();
		await expect(page.getByText('3.75', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Subject 2', exact: true }).click();
		await expect(page.getByRole('button', { name: /^SNAP101 / })).toBeDisabled();
		await page.keyboard.press('Escape');
		await page.setViewportSize({ width: 390, height: 844 });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
		mkdirSync(path.resolve('.tmp'), { recursive: true });
		await page.screenshot({
			path: path.resolve('.tmp/enrollment-page-mobile.png'),
			fullPage: true
		});
		await page.getByLabel('Semester', { exact: true }).selectOption('2');
		await page.evaluate(() => (window.confirm = false));
		await page.getByRole('button', { name: 'Use term subjects', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Subject 2', exact: true })).toBeVisible();
		await page.evaluate(() => (window.confirm = true));
		await page.getByRole('button', { name: 'Use term subjects', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Subject 2', exact: true })).toHaveCount(0);
		await expect(page.getByLabel('Units for subject 1', { exact: true })).toHaveValue('4');
		await page.getByLabel('Year level', { exact: true }).selectOption('2');
		await page.getByRole('button', { name: 'Use term subjects', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Enroll Student', exact: true })).toBeDisabled();
		await expect(page.getByText('No subjects selected.', { exact: false })).toBeVisible();
		await page.getByLabel('Semester', { exact: true }).selectOption('1');
		await page.getByRole('button', { name: 'Use term subjects', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Subject 1', exact: true })).toContainText(
			'SNAP201'
		);
		await page.getByLabel('Units for subject 1', { exact: true }).fill('0.5');
		await page.getByRole('button', { name: 'Add subject', exact: true }).click();
		await chooseSubject(2, 'LIVE101');
		await page.getByLabel('Units for subject 2', { exact: true }).fill('1.25');
		await page.evaluate(() => (window.confirm = false));
		assert.equal(
			await page.evaluate(() => window.attemptNavigation('/portal/user/applicants/a')),
			false
		);
		await page.waitForTimeout(50);
		assert.deepEqual(await page.evaluate(() => window.navigation), []);
		await page.getByRole('button', { name: 'Enroll Student', exact: true }).click();
		assert.equal(await page.evaluate(() => window.accountCalls.length), 0);
		await page.evaluate(() => {
			window.confirm = true;
			window.failAccount = true;
		});
		await page.getByRole('button', { name: 'Enroll Student', exact: true }).click();
		await expect(page.getByRole('alert')).toContainText('Enrollment changed');
		await page.evaluate(() => {
			window.failAccount = false;
			window.deferAccount = true;
			window.invitationSent = false;
			window.accountCalls = [];
		});
		await page.getByRole('button', { name: 'Enroll Student', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Enrolling...', exact: true })).toBeDisabled();
		await expect.poll(() => page.evaluate(() => window.accountCalls.length)).toBe(1);
		assert.deepEqual(await page.evaluate(() => window.accountCalls[0]), {
			applicantId: 'a',
			section: 'B',
			schoolYearStart: 2025,
			yearLevel: 2,
			semester: 1,
			subjects: [
				{ id: 's3', units: 0.5 },
				{ id: 's1', units: 1.25 }
			]
		});
		await page.evaluate(() => window.finishAccount());
		await expect(page.getByRole('heading', { level: 1, name: 'Test Student' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'STUDENT DETAILS', exact: true })).toBeVisible();
		await expect(
			page.getByText('Review student information, account status, and enrollment history.', {
				exact: true
			})
		).toBeVisible();
		await expect(page.getByRole('link', { name: 'Back to students', exact: true })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'View applicant', exact: true })).toHaveAttribute(
			'href',
			'/portal/user/applicants/a'
		);
		assert.deepEqual(await page.evaluate(() => window.navigation), ['/portal/user/students/u']);
		assert.equal(
			await page.evaluate(() => window.messages.at(-1).message.includes('Student enrolled')),
			true
		);
		await expect(
			page.getByRole('heading', { name: 'Current enrollment', exact: true })
		).toBeVisible();
		await expect(page.getByText('Historical subject', { exact: true })).toBeVisible();
		await expect(page.getByText('Additional subject', { exact: true })).toBeVisible();
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
		await page.setViewportSize({ width: 1360, height: 960 });
		await page.screenshot({ path: path.resolve('.tmp/student-page-desktop.png'), fullPage: true });
		await page.getByRole('button', { name: 'Resend setup link', exact: true }).click();
		assert.deepEqual(await page.evaluate(() => window.mailCalls), [
			{ email: 'stored@example.com' }
		]);
		await page.evaluate(() => window.show('empty-student'));
		await expect(page.getByText('No enrollment records yet.', { exact: true })).toBeVisible();
		await page.evaluate(() => window.show('list'));
		await expect(page.getByRole('cell', { name: 'B', exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Actions for Test Student', exact: true }).click();
		await expect(page.getByRole('link', { name: 'View', exact: true })).toHaveAttribute(
			'href',
			'/portal/user/students/u'
		);
		await page.evaluate(() => window.show('applicant'));
		await expect(page.getByRole('link', { name: 'View student', exact: true })).toHaveCount(0);
		await page.getByRole('button', { name: 'Actions for Test Student', exact: true }).click();
		await expect(page.getByRole('link', { name: 'Enroll Student', exact: true })).toHaveAttribute(
			'href',
			'/portal/user/applicants/a/enroll'
		);
		await page.evaluate(() => window.show('linked-applicant'));
		await expect(page.getByRole('link', { name: 'View student', exact: true })).toHaveAttribute(
			'href',
			'/portal/user/students/u'
		);
		await page.getByRole('button', { name: 'Actions for Test Student', exact: true }).click();
		await expect(page.getByRole('link', { name: 'Enroll Student', exact: true })).toHaveCount(0);
		await page.evaluate(() => window.show('incomplete'));
		await page.getByRole('button', { name: 'Actions for Test Student', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Enroll Student', exact: true })).toBeDisabled();
		assert.deepEqual(errors, []);
	} finally {
		await browser?.close();
		await server?.close();
		for (const name of Object.keys(files)) rmSync(path.join(root, name), { force: true });
		rmdirSync(root);
	}
});
