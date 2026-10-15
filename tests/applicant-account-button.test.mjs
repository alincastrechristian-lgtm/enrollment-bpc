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
		'actions.js': `import {HandledHttpError} from '@sveltejs/kit/internal';window.accountCalls=[];window.mailCalls=[];window.questions=[];window.messages=[];window.confirm=true;
			export async function enrollStudent(data){window.accountCalls.push(data);if(window.duplicateEmail)throw new HandledHttpError({status:409,message:'A student account already exists with this email.'});if(window.failAccount)throw new HandledHttpError({status:409,message:'Enrollment changed'});if(window.deferAccount)await new Promise(resolve=>window.finishAccount=resolve);return {success:true,userId:'u',studentId:'MA-202610-000001',enrollmentId:'current',invitationSent:window.invitationSent!==false};}
			export async function resendMagicLink(data){window.mailCalls.push(data);if(window.failMail)throw new Error('Mail failed');}
			export async function createStudent(data){(window.createdStudents??=[]).push(data);return {userId:'u',invitationSent:true};}export async function createRegistrar(){throw new HandledHttpError({status:409,message:window.existingRole==='registrar'?'A registrar account already exists with this email.':'A student account already exists with this email.'});}export async function deleteApplicant(){};export async function createApplicant(){};export async function updateApplicant(){}`,
		'popup.js': `export async function showYesNo(props){window.questions.push(props);return window.confirm;}
			export function showLoading(){};export function showError(props){window.messages.push({type:'error',...(typeof props==='string'?{message:props}:props)});}export function showSuccess(message){window.messages.push({type:'success',message});}`,
		'grades.js': `import {HandledHttpError} from '@sveltejs/kit/internal';window.gradeCalls=[];window.finalizeCalls=[];
			export async function finalizeEnrollmentGrades(data){window.finalizeCalls.push(data);if(window.failFinalize)throw new HandledHttpError({status:409,message:'Grades or subjects have changed. Reload before finalizing.'});if(window.deferFinalize)await new Promise(resolve=>window.finishFinalize=resolve);return {success:true,finalizedGrades:true};}
			export async function updateEnrollmentGrades(data){window.gradeCalls.push(data);if(window.failGrades)throw new HandledHttpError({status:409,message:'Grades have changed since this page was loaded. Refresh before saving again.'});if(window.deferGrades)await new Promise(resolve=>window.finishGrades=resolve);return {success:true,grades:data.grades.map(({id,grade})=>({id,grade}))};}`,
		'Harness.svelte': `<script>
			import Topbar from '${sourcePath('src/lib/components/Topbar/Topbar.svelte')}';
			import {load as loadMetadata} from '${sourcePath('src/routes/user/+layout.ts')}';
			import {page} from './state.svelte.js';
			import Editor from '${sourcePath('src/routes/user/students/EnrollmentEditor.svelte')}';
			import Student from '${sourcePath('src/routes/user/students/[userId]/+page.svelte')}';
			import MyEnrollment from '${sourcePath('src/routes/user/enrollment/+page.svelte')}';
			import EnrollmentDetails from '${sourcePath('src/routes/user/students/EnrollmentDetails.svelte')}';
			import Registrars from '${sourcePath('src/routes/user/registrars/+page.svelte')}';
			import Students from '${sourcePath('src/routes/user/students/+page.svelte')}';
			let mode=$state('enroll');let revision=$state(0);window.show=(value)=>mode=value;
			const routeId=$derived(mode.startsWith('my-enrollment')?'/user/enrollment':mode.startsWith('grade-')?'/user/students/[userId]/enrollments/[enrollmentId]':mode==='enroll'?'/user/students/[userId]/enroll':mode==='student'||mode==='empty-student'?'/user/students/[userId]':mode==='list'?'/user/students':mode==='applicant'||mode==='linked-applicant'||mode==='incomplete'?'/user/applicants/[applicantId]':'/user/applicants');
			const routeUrl=$derived(new URL('/portal'+routeId.replace('[applicantId]','a').replace('[userId]','u').replace('[enrollmentId]',mode.startsWith('grade-past')?'old':'current'),window.location.href));
			const metadata=$derived(loadMetadata({url:routeUrl,route:{id:routeId},params:{userId:'u'}}));
			$effect(()=>{page.url=routeUrl;});
			window.reset=()=>{window.accountCalls=[];window.questions=[];window.navigation=[];window.messages=[];window.confirm=true;window.failAccount=false;window.deferAccount=false;window.invitationSent=true;window.failNavigation=false;mode='enroll';revision++;};
			const program={id:'p',code:'BSIS',name:'Information Systems',isActive:true};
			const applicant={id:'a',applicationId:'MA-202610-000001',name:'Test Student',userId:null,programCode:'BSIS',program,yearLevel:1,dateApplied:new Date(),email:'stored@example.com',contactNumber:'09123456789',address:'Bulacan',hasBirthCertificate:true,hasForm138:true,hasGoodMoral:true,hasPicture:true,createdAt:new Date(),updatedAt:new Date()};
			const curriculum={id:'c',name:'2026 Curriculum',programCode:'BSIS',program,yearLevels:2,semesters:2,publishedAt:new Date(),archivedAt:null,isActive:true};
			const entries=[{id:'cs1',subjectId:'s1',subjectCode:'SNAP101',subjectName:'Published Introduction',yearLevel:1,semester:1,units:3},{id:'cs2',subjectId:'s2',subjectCode:'SNAP102',subjectName:'Published Programming',yearLevel:1,semester:2,units:4},{id:'cs3',subjectId:'s3',subjectCode:'SNAP201',subjectName:'Published Databases',yearLevel:2,semester:1,units:2}];
			const subjects=[{id:'s1',code:'LIVE101',name:'Changed Introduction',isActive:true},{id:'s2',code:'LIVE102',name:'Other term',isActive:true},{id:'s3',code:'LIVE201',name:'Databases',isActive:true},{id:'s4',code:'EXTRA',name:'Extra subject',isActive:true}];
			const current={id:'current',studentId:'MA-202610-000001',curriculumId:'c',curriculum,section:'B',schoolYearStart:2025,semester:1,yearLevel:2,status:'enrolled',finalizedGrades:false,enrolledAt:new Date(),subjects:[{id:'es1',subjectCode:'SNAP201',subjectName:'Published Databases',source:'curriculum',units:0.5,grade:null},{id:'es2',subjectCode:'LIVE101',subjectName:'Changed Introduction',source:'extra',units:1.25,grade:1.25}]};
			const historical={...current,curriculumId:'old-curriculum',curriculum:{...curriculum,id:'old-curriculum',programCode:'BSIT',program:{...program,id:'it',code:'BSIT',name:'Information Technology'}},id:'old',schoolYearStart:2024,semester:2,yearLevel:1,section:'A',status:'withdrawn',subjects:[{id:'old-subject',subjectCode:'OLD101',subjectName:'Historical subject',source:'curriculum',units:1.5,grade:null}]};
			const student={id:'u',name:applicant.name,email:applicant.email,image:null,emailVerified:false,setupComplete:false,banned:false,banReason:null,createdAt:new Date(),updatedAt:new Date(),applicant,studentData:{studentId:'MA-202610-000001',contactNumber:applicant.contactNumber,address:applicant.address,currentEnrollmentId:'current',currentEnrollment:current,enrollments:[current,historical]}};
		</script>
		<Topbar pageTitle={metadata.pageTitle} pageDescription={metadata.pageDescription} backHref={metadata.backHref} />
		{#key mode+revision}
			{#if mode==='enroll'}<Editor data={{student:{...applicant,studentId:applicant.applicationId,userId:'u',currentEnrollmentId:null,semester:1},program,curriculum,entries,subjects,schoolYearStart:2026}} />
			{:else if mode==='student'}<Student data={{student}} />
			{:else if mode==='my-enrollment'}<MyEnrollment data={{record:{studentId:student.studentData.studentId,currentEnrollmentId:'current',enrollments:[{...current,finalizedGrades:true},historical]}}} />
			{:else if mode==='my-enrollment-empty'}<MyEnrollment data={{record:null}} />
			{:else if mode==='student-inc'}<Student data={{student:{...student,studentData:{...student.studentData,enrollments:[{...current,finalizedGrades:true},historical]}}}} />
			{:else if mode==='grade-pending-account'}<EnrollmentDetails data={{student:{id:'u',name:student.name,email:student.email,studentId:student.studentData.studentId,setupComplete:false},enrollment:current,isCurrent:true,gradeLockReason:'The student must complete account setup before grades can be edited or finalized.',canEdit:false,canEditFinalized:false,canFinalize:false}} />
			{:else if mode==='grade-finalized'}<EnrollmentDetails data={{student:{id:'u',name:student.name,email:student.email,studentId:student.studentData.studentId,setupComplete:true},enrollment:{...current,finalizedGrades:true,subjects:current.subjects},isCurrent:true,gradeLockReason:'Grades are finalized. Only administrators can edit them.',canEdit:false,canEditFinalized:false,canFinalize:false}} />
			{:else if mode==='grade-empty'}<EnrollmentDetails data={{student:{id:'u',name:student.name,email:student.email,studentId:student.studentData.studentId,setupComplete:true},enrollment:{...current,subjects:[]},isCurrent:true,gradeLockReason:null,canEdit:true,canEditFinalized:true,canFinalize:true}} />
			{:else if mode==='grade-current'}<EnrollmentDetails data={{student:{id:'u',name:student.name,email:student.email,studentId:student.studentData.studentId,setupComplete:true},enrollment:current,isCurrent:true,gradeLockReason:null,canEdit:true,canEditFinalized:false,canFinalize:true}} />
			{:else if mode==='grade-past-admin'}<EnrollmentDetails data={{student:{id:'u',name:student.name,email:student.email,studentId:student.studentData.studentId,setupComplete:true},enrollment:historical,isCurrent:false,gradeLockReason:null,canEdit:true,canEditFinalized:true,canFinalize:true}} />
			{:else if mode==='grade-past'}<EnrollmentDetails data={{student:{id:'u',name:student.name,email:student.email,studentId:student.studentData.studentId,setupComplete:true},enrollment:historical,isCurrent:false,gradeLockReason:null,canEdit:false,canEditFinalized:false,canFinalize:false}} />
			{:else if mode==='empty-student'}<Student data={{student:{...student,applicant:null,studentData:null}}} />
			{:else if mode==='registrars'}<Registrars data={{users:[],total:0,search:'',status:'all',filters:{}}} />
			{:else if mode==='list'}<Students data={{users:[student],total:1,search:'',status:'all',filters:{}}} />
			{:else}<p>Unused view</p>{/if}
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
					{ find: '#lib/actions/grades.remote.js', replacement: path.join(root, 'grades.js') },
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
				'Choose a program, review enrollment information, and customize subjects and units.',
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
			await page.evaluate(() => window.attemptNavigation('/portal/user/students/u')),
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
			window.duplicateEmail = true;
		});
		await page.getByRole('button', { name: 'Enroll Student', exact: true }).click();
		await expect(page.getByRole('alert')).toContainText(
			'A student account already exists with this email.'
		);
		await page.evaluate(() => {
			window.failAccount = false;
			window.duplicateEmail = false;
			window.deferAccount = true;
			window.invitationSent = false;
			window.accountCalls = [];
		});
		await page.getByRole('button', { name: 'Enroll Student', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Enrolling...', exact: true })).toBeDisabled();
		await expect.poll(() => page.evaluate(() => window.accountCalls.length)).toBe(1);
		assert.deepEqual(await page.evaluate(() => window.accountCalls[0]), {
			userId: 'u',
			programCode: 'BSIS',
			curriculumId: 'c',
			currentEnrollmentId: null,
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
		await expect(page.getByRole('link', { name: 'Enroll student', exact: true })).toHaveAttribute(
			'href',
			'/portal/user/students/u/enroll'
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
		await expect(page.getByRole('columnheader', { name: 'Grade', exact: true })).toHaveCount(2);
		await expect(page.getByRole('cell', { name: '-', exact: true })).toHaveCount(2);
		await expect(page.getByRole('cell', { name: '1.25', exact: true })).toHaveCount(2);
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
		await page.setViewportSize({ width: 1360, height: 960 });
		await page.screenshot({ path: path.resolve('.tmp/student-page-desktop.png'), fullPage: true });
		const history = page.getByRole('region', { name: 'Enrollment history', exact: true });
		const currentSummary = page.getByRole('region', { name: 'Current enrollment', exact: true });
		await expect(history.getByRole('article')).toHaveCount(2);
		await expect(history.getByText('enrolled', { exact: true })).toHaveCount(0);
		await expect(history.getByText('withdrawn', { exact: true })).toBeVisible();
		await expect(history.getByLabel('Program', { exact: true }).getByRole('option')).toHaveCount(3);
		await history.getByLabel('Program', { exact: true }).selectOption('BSIT');
		await expect(history.getByRole('article')).toHaveCount(1);
		await expect(history.getByText('Historical subject', { exact: true })).toBeVisible();
		await history.getByLabel('School year', { exact: true }).selectOption('2025');
		await expect(history.getByRole('article')).toHaveCount(0);
		await expect(currentSummary).toContainText('enrolled');
		await history.getByRole('button', { name: 'Clear filters', exact: true }).click();
		await expect(history.getByLabel('Program', { exact: true })).toHaveValue('');
		await expect(history.getByRole('article')).toHaveCount(2);
		await expect(
			history.getByRole('button', { name: 'Clear filters', exact: true })
		).toBeDisabled();
		await history.getByLabel('School year', { exact: true }).selectOption('2024');
		await expect(history.getByRole('article')).toHaveCount(1);
		await expect(history.getByText('Historical subject', { exact: true })).toBeVisible();
		await expect(history.getByRole('status')).toHaveText('Showing 1 of 2 enrollments');
		await expect(currentSummary).toContainText('enrolled');
		await history.getByLabel('Semester', { exact: true }).selectOption('1');
		await expect(history.getByRole('article')).toHaveCount(0);
		await expect(
			history.getByText('No enrollments match these filters.', { exact: false })
		).toBeVisible();
		await history.getByRole('button', { name: 'Clear filters', exact: true }).click();
		await expect(history.getByRole('article')).toHaveCount(2);
		await history.getByLabel('Semester', { exact: true }).selectOption('2');
		await expect(history.getByRole('article')).toHaveCount(1);
		await expect(history.getByText('Historical subject', { exact: true })).toBeVisible();
		await history.getByLabel('Enrollment status', { exact: true }).selectOption('enrolled');
		await expect(history.getByRole('article')).toHaveCount(0);
		await history.getByLabel('Semester', { exact: true }).selectOption('');
		await expect(history.getByRole('article')).toHaveCount(1);
		await expect(history.getByText('Published Databases', { exact: true })).toBeVisible();
		await page.setViewportSize({ width: 390, height: 844 });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
		await history.getByRole('button', { name: 'Clear filters', exact: true }).click();
		await expect(history.getByRole('article')).toHaveCount(2);
		await expect(
			history
				.getByRole('article', { name: '2025–2026 · 1st Semester', exact: true })
				.getByRole('link', { name: 'View', exact: true })
		).toHaveAttribute('href', '/portal/user/students/u/enrollments/current');
		await expect(currentSummary.getByRole('link', { name: 'View', exact: true })).toHaveAttribute(
			'href',
			'/portal/user/students/u/enrollments/current'
		);
		await expect(
			history
				.getByRole('article', { name: '2024–2025 · 2nd Semester', exact: true })
				.getByRole('link', { name: 'View', exact: true })
		).toHaveAttribute('href', '/portal/user/students/u/enrollments/old');
		await page.evaluate(() => window.show('grade-pending-account'));
		await expect(
			page.getByText('The student must complete account setup', { exact: false })
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'Edit grades', exact: true })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Finalize grades', exact: true })).toHaveCount(0);
		await page.evaluate(() => window.show('grade-empty'));
		await expect(page.getByRole('button', { name: 'Finalize grades', exact: true })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Edit grades', exact: true })).toBeDisabled();
		await page.evaluate(() => window.show('grade-finalized'));
		await expect(
			page.getByText('Grades are finalized. Only administrators can edit them.', { exact: false })
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'Edit grades', exact: true })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Finalize grades', exact: true })).toHaveCount(0);
		await expect(page.getByRole('cell', { name: 'INC (Incomplete)', exact: true })).toBeVisible();
		await page.evaluate(() => window.show('grade-current'));
		await expect(page.getByRole('button', { name: 'Finalize grades', exact: true })).toBeEnabled();
		await expect(page.getByRole('link', { name: 'ENROLLMENTS', exact: true })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'U', exact: true })).toHaveAttribute(
			'href',
			'/portal/user/students/u'
		);
		await expect(
			page.getByRole('heading', { name: 'ENROLLMENT DETAILS', exact: true })
		).toBeVisible();
		await expect(page.getByRole('spinbutton')).toHaveCount(0);
		await page.getByRole('button', { name: 'Edit grades', exact: true }).click();
		const firstGrade = page.getByLabel('Grade for SNAP201', { exact: true });
		const secondGrade = page.getByLabel('Grade for LIVE101', { exact: true });
		await expect(page.getByRole('button', { name: 'Save grades', exact: true })).toBeDisabled();
		await firstGrade.fill('5.5');
		await page.getByRole('button', { name: 'Save grades', exact: true }).click();
		assert.equal(await firstGrade.evaluate((input) => input.validity.valid), false);
		assert.deepEqual(await page.evaluate(() => window.gradeCalls), []);
		await firstGrade.fill('2.25');
		await page.evaluate(() => (window.confirm = false));
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(firstGrade).toHaveValue('2.25');
		await page.getByRole('button', { name: 'Back', exact: true }).click();
		await expect(firstGrade).toBeVisible();
		await page.evaluate(() => (window.confirm = true));
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(page.getByRole('spinbutton')).toHaveCount(0);
		await page.getByRole('button', { name: 'Edit grades', exact: true }).click();
		await expect(firstGrade).toHaveValue('');
		await firstGrade.fill('2.25');
		await secondGrade.fill('');
		await page.evaluate(() => (window.failGrades = true));
		await page.getByRole('button', { name: 'Save grades', exact: true }).click();
		await expect(page.getByRole('alert')).toContainText('Grades have changed');
		await expect(firstGrade).toHaveValue('2.25');
		await page.evaluate(() => {
			window.failGrades = false;
			window.deferGrades = true;
		});
		await page.getByRole('button', { name: 'Save grades', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Saving...', exact: true })).toBeDisabled();
		await expect(firstGrade).toBeDisabled();
		await page
			.locator('form')
			.evaluate((form) =>
				form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
			);
		assert.equal(await page.evaluate(() => window.gradeCalls.length), 2);
		assert.deepEqual(await page.evaluate(() => window.gradeCalls[1]), {
			userId: 'u',
			enrollmentId: 'current',
			grades: [
				{ id: 'es1', grade: 2.25, originalGrade: null },
				{ id: 'es2', grade: null, originalGrade: 1.25 }
			]
		});
		await page.evaluate(() => window.finishGrades());
		await expect(page.getByRole('status')).toHaveText('Grades saved successfully.');
		await expect(page.getByRole('cell', { name: '2.25', exact: true })).toBeVisible();
		await expect(page.getByRole('cell', { name: 'No grade', exact: true })).toBeVisible();
		await page.setViewportSize({ width: 1360, height: 960 });
		await page.screenshot({
			path: path.resolve('.tmp/enrollment-grades-desktop.png'),
			fullPage: true
		});
		await page.setViewportSize({ width: 390, height: 844 });
		await page.getByRole('button', { name: 'Edit grades', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Save grades', exact: true })).toBeDisabled();
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
		await page.screenshot({
			path: path.resolve('.tmp/enrollment-grades-mobile.png'),
			fullPage: true
		});
		await page.evaluate(() => (window.deferGrades = false));
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();
		await page.evaluate(() => (window.confirm = false));
		await page.getByRole('button', { name: 'Finalize grades', exact: true }).click();
		await expect(page.getByText('Grades finalized', { exact: true })).toHaveCount(0);
		assert.equal(await page.evaluate(() => window.finalizeCalls.length), 0);
		assert.match(
			await page.evaluate(() => window.questions.at(-1).message),
			/1 subject has no grade and will be marked as INC \(Incomplete\)/
		);
		assert.equal(await page.evaluate(() => window.questions.at(-1).warning), true);
		await page.evaluate(() => (window.confirm = true));
		await page.getByRole('button', { name: 'Finalize grades', exact: true }).click();
		await expect(page.getByRole('cell', { name: 'INC (Incomplete)', exact: true })).toBeVisible();
		assert.deepEqual(await page.evaluate(() => window.finalizeCalls.at(-1).grades), [
			{ id: 'es1', grade: 2.25 },
			{ id: 'es2', grade: null }
		]);
		await expect(page.getByText('Grades finalized', { exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Edit grades', exact: true })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Finalize grades', exact: true })).toHaveCount(0);
		assert.equal(await page.evaluate(() => window.finalizeCalls.at(-1).enrollmentId), 'current');
		await page.getByRole('button', { name: 'Back', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'STUDENT DETAILS', exact: true })).toBeVisible();
		assert.equal(await page.evaluate(() => window.navigation.at(-1)), '/portal/user/students/u');
		await page.evaluate(() => window.show('grade-past'));
		await expect(page.getByText('This enrollment is read-only.', { exact: false })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Edit grades', exact: true })).toHaveCount(0);
		await expect(page.getByRole('spinbutton')).toHaveCount(0);
		await page.evaluate(() => {
			window.show('grade-past-admin');
			window.finalizeCalls = [];
			window.deferGrades = false;
		});
		await expect(page.getByText('Historical enrollment', { exact: true })).toBeVisible();
		await expect(page.getByText('Current enrollment', { exact: true })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Finalize grades', exact: true })).toBeEnabled();
		await page.getByRole('button', { name: 'Edit grades', exact: true }).click();
		await page.getByLabel('Grade for OLD101', { exact: true }).fill('1.75');
		await page.getByRole('button', { name: 'Save grades', exact: true }).click();
		await expect(page.getByRole('status')).toHaveText('Grades saved successfully.');
		await expect(page.getByRole('cell', { name: '1.75', exact: true })).toBeVisible();
		await expect(page.getByText('Historical enrollment', { exact: true })).toBeVisible();
		assert.equal(await page.evaluate(() => window.gradeCalls.at(-1).enrollmentId), 'old');
		await page.evaluate(() => (window.confirm = false));
		await page.getByRole('button', { name: 'Finalize grades', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Edit grades', exact: true })).toBeEnabled();
		assert.equal(await page.evaluate(() => window.finalizeCalls.length), 0);
		assert.equal(await page.evaluate(() => window.questions.at(-1).warning), true);
		assert.match(
			await page.evaluate(() => window.questions.at(-1).message),
			/Administrators can still make corrections/
		);
		await page.evaluate(() => {
			window.confirm = true;
			window.failFinalize = true;
		});
		await page.getByRole('button', { name: 'Finalize grades', exact: true }).click();
		await expect(page.getByRole('alert')).toContainText('Grades or subjects have changed');
		await page.evaluate(() => {
			window.failFinalize = false;
			window.deferFinalize = true;
		});
		await page.getByRole('button', { name: 'Finalize grades', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Finalizing...', exact: true })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Edit grades', exact: true })).toBeDisabled();
		await page
			.getByRole('button', { name: 'Finalizing...', exact: true })
			.evaluate((button) => button.dispatchEvent(new Event('click', { bubbles: true })));
		assert.equal(await page.evaluate(() => window.finalizeCalls.length), 2);
		assert.deepEqual(await page.evaluate(() => window.finalizeCalls[1]), {
			userId: 'u',
			enrollmentId: 'old',
			grades: [{ id: 'old-subject', grade: 1.75 }]
		});
		await page.evaluate(() => window.finishFinalize());
		await expect(page.getByRole('status')).toHaveText('Grades finalized successfully.');
		await expect(page.getByText('Grades finalized', { exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Edit grades', exact: true })).toBeEnabled();
		await expect(page.getByRole('button', { name: 'Finalize grades', exact: true })).toHaveCount(0);
		await page.getByRole('button', { name: 'Edit grades', exact: true }).click();
		const finalizedGrade = page.getByLabel('Grade for OLD101', { exact: true });
		await finalizedGrade.fill('');
		await page.getByRole('button', { name: 'Save grades', exact: true }).click();
		await expect(page.getByRole('cell', { name: 'INC (Incomplete)', exact: true })).toBeVisible();
		await expect(page.getByText('Grades finalized', { exact: true })).toBeVisible();
		assert.deepEqual(await page.evaluate(() => window.gradeCalls.at(-1).grades), [
			{ id: 'old-subject', grade: null, originalGrade: 1.75 }
		]);
		await page.getByRole('button', { name: 'Edit grades', exact: true }).click();
		await expect(finalizedGrade).toHaveValue('');
		await expect(finalizedGrade).toHaveAttribute('placeholder', 'INC');
		await finalizedGrade.fill('2.25');
		await page.getByRole('button', { name: 'Save grades', exact: true }).click();
		await expect(page.getByRole('status')).toHaveText('Grades saved successfully.');
		await expect(page.getByRole('cell', { name: '2.25', exact: true })).toBeVisible();
		await expect(page.getByText('Grades finalized', { exact: true })).toBeVisible();
		assert.deepEqual(await page.evaluate(() => window.gradeCalls.at(-1).grades), [
			{ id: 'old-subject', grade: 2.25, originalGrade: null }
		]);
		await page.getByRole('button', { name: 'Back', exact: true }).click();
		await page.getByRole('button', { name: 'Resend setup link', exact: true }).click();
		assert.deepEqual(await page.evaluate(() => window.mailCalls), [
			{ email: 'stored@example.com' }
		]);
		await page.evaluate(() => window.show('student-inc'));
		await expect(page.getByRole('cell', { name: 'INC (Incomplete)', exact: true })).toBeVisible();
		await page.evaluate(() => window.show('my-enrollment'));
		await expect(page.getByRole('heading', { name: 'My enrollment', exact: true })).toBeVisible();
		await expect(
			page.getByText('Review your enrollment history, subjects, and grades.', { exact: true })
		).toBeVisible();
		await expect(page.getByText('Showing 2 of 2 enrollments', { exact: true })).toBeVisible();
		await expect(page.getByRole('cell', { name: 'INC (Incomplete)', exact: true })).toBeVisible();
		await expect(
			page
				.getByRole('row')
				.filter({ has: page.getByRole('cell', { name: 'LIVE101', exact: true }) })
				.getByRole('cell')
				.last()
		).toHaveText('1.25');
		await expect(page.getByRole('link', { name: 'View', exact: true })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Edit grades', exact: true })).toHaveCount(0);
		await page.getByLabel('School year', { exact: true }).selectOption('2024');
		await expect(page.getByText('Showing 1 of 2 enrollments', { exact: true })).toBeVisible();
		await expect(page.getByRole('cell', { name: 'OLD101', exact: true })).toBeVisible();
		await expect(page.getByRole('cell', { name: 'SNAP201', exact: true })).toHaveCount(0);
		await page.getByLabel('Program', { exact: true }).selectOption('BSIS');
		await expect(
			page.getByText('No enrollments match these filters.', { exact: false })
		).toBeVisible();
		await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
		await expect(page.getByText('Showing 2 of 2 enrollments', { exact: true })).toBeVisible();
		await page.setViewportSize({ width: 1360, height: 960 });
		await page.screenshot({ path: path.resolve('.tmp/my-enrollment-desktop.png'), fullPage: true });
		await page.setViewportSize({ width: 390, height: 844 });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
		await page.screenshot({ path: path.resolve('.tmp/my-enrollment-mobile.png'), fullPage: true });
		await page.evaluate(() => window.show('my-enrollment-empty'));
		await expect(page.getByText('No enrollment records yet.', { exact: true })).toBeVisible();
		await expect(
			page.getByRole('group', { name: 'Filter enrollment history', exact: true })
		).toHaveCount(0);
		await page.evaluate(() => window.show('empty-student'));
		await expect(page.getByText('No enrollment records yet.', { exact: true })).toBeVisible();
		await expect(
			page.getByRole('group', { name: 'Filter enrollment history', exact: true })
		).toHaveCount(0);
		await page.evaluate(() => window.show('list'));
		await expect(page.getByRole('cell', { name: 'B', exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Actions for Test Student', exact: true }).click();
		await expect(page.getByRole('link', { name: 'View', exact: true })).toHaveAttribute(
			'href',
			'/portal/user/students/u'
		);
		await page.evaluate(() => window.show('registrars'));
		await page.getByRole('button', { name: 'New Registrar', exact: true }).click();
		const newRegistrarDialog = page.getByRole('dialog');
		await newRegistrarDialog.getByLabel('Name', { exact: true }).fill('New Registrar');
		await newRegistrarDialog.getByLabel('Email', { exact: true }).fill('taken@example.com');
		for (const role of ['student', 'registrar']) {
			await page.evaluate((role) => (window.existingRole = role), role);
			await page.getByRole('button', { name: 'Create Registrar', exact: true }).click();
			await expect
				.poll(() => page.evaluate(() => window.messages.at(-1)?.message))
				.toBe(`A ${role} account already exists with this email.`);
			assert.equal(
				await page.evaluate(() => window.messages.at(-1).title),
				'Unable to create registrar'
			);
			await expect(newRegistrarDialog).toHaveJSProperty('open', true);
		}
		// Personal details are saved before optional enrollment.
		await page.evaluate(() => window.show('list'));
		await page.getByRole('button', { name: 'Create student', exact: true }).click();
		let createForm = page.getByRole('dialog', { name: 'Create student', exact: true });
		await createForm.getByLabel('Full name', { exact: true }).fill('New Student');
		await createForm.getByLabel('Email', { exact: true }).fill('new@example.com');
		await createForm.getByLabel('Contact number', { exact: true }).fill('09171234567');
		await createForm.getByLabel('Address', { exact: true }).fill('Bulacan');
		await expect(createForm.getByRole('combobox')).toHaveCount(0);
		await expect(createForm.getByText('Birth certificate', { exact: true })).toHaveCount(0);
		await createForm.getByRole('button', { name: 'Create & enroll', exact: true }).click();
		await expect
			.poll(() => page.evaluate(() => window.navigation.at(-1)))
			.toBe('/portal/user/students/u/enroll');
		await page.getByRole('button', { name: 'Create student', exact: true }).click();
		createForm = page.getByRole('dialog', { name: 'Create student', exact: true });
		await createForm.getByLabel('Full name', { exact: true }).fill('Later Student');
		await createForm.getByLabel('Email', { exact: true }).fill('later@example.com');
		await createForm.getByLabel('Contact number', { exact: true }).fill('09171234567');
		await createForm.getByLabel('Address', { exact: true }).fill('Bulacan');
		await createForm.getByRole('radio', { name: /^Enroll later/ }).check();
		await createForm.getByRole('button', { name: 'Create student', exact: true }).click();
		await expect
			.poll(() => page.evaluate(() => window.navigation.at(-1)))
			.toBe('/portal/user/students/u');
		assert.equal(await page.evaluate(() => window.createdStudents.length), 2);
		assert.deepEqual(errors, []);
	} finally {
		await browser?.close();
		await server?.close();
		for (const name of Object.keys(files)) rmSync(path.join(root, name), { force: true });
		rmdirSync(root);
	}
});
