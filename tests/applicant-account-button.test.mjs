import { chromium, expect } from '@playwright/test';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

test('student enrollment reviews applicant data, confirms, prevents duplicates, and reports invitation failures', async () => {
	const root = mkdtempSync(path.resolve('.tmp-applicant-account-'));
	const files = {
		'index.html':
			'<html data-theme="light"><main id="app" class="bg-base-200 p-6"></main><script type="module" src="/main.js"></script></html>',
		'style.css': "@import '../src/routes/layout.css'; @source '../src';",
		'main.js':
			"import './style.css'; import {mount} from 'svelte'; import Harness from './Harness.svelte'; mount(Harness,{target:document.getElementById('app')});",
		'state.svelte.js': 'export const page=$state({url:new URL(window.location.href)});',
		'paths.js': 'export const resolve=(route)=>route;',
		'navigation.js': `window.refreshes=0;export function beforeNavigate(){};export async function goto(){};
			export async function refreshAll(){window.refreshes++;window.linkApplicant();}`,
		'actions.js': `window.accountCalls=[];window.confirm=true;window.questions=[];window.messages=[];
			export async function createStudent(data){window.accountCalls.push(data);if(window.deferAccount)await new Promise(resolve=>window.finishAccount=resolve);if(window.failAccount)throw new Error('Account creation failed');return {success:true,invitationSent:window.invitationSent!==false};}
			export async function deleteApplicant(){};export async function createApplicant(){};export async function updateApplicant(){}`,
		'popup.js': `import {showYesNo as confirm} from '${path.resolve('src/lib/components/Popup/Popup.svelte.ts').replaceAll('\\', '/')}';
			export async function showYesNo(props){window.questions.push(props);if(window.realConfirmation)return confirm(props);if(window.deferConfirmation)return new Promise(resolve=>window.finishConfirmation=resolve);return window.confirm;}
			export function showLoading(){};export function showError(message){window.messages.push({type:'error',message});};export function showSuccess(message){window.messages.push({type:'success',message});}`,
		'Harness.svelte': `<script>
			import PopupHost from '${path.resolve('src/lib/components/Popup/PopupHost.svelte').replaceAll('\\', '/')}';
			import View from '${path.resolve('src/routes/user/applicants/[applicantId]/+page.svelte').replaceAll('\\', '/')}';
			import List from '${path.resolve('src/routes/user/applicants/+page.svelte').replaceAll('\\', '/')}';
			let mode=$state('view');window.show=(value)=>mode=value;
			const initial={id:'a',applicationId:'2026-1',name:'Test Applicant',userId:null,program:'BSIS',yearLevel:1,dateApplied:new Date(),email:'stored@example.com',contactNumber:'09123456789',address:'Bulacan',hasBirthCertificate:true,hasForm138:true,hasGoodMoral:true,hasPicture:true,createdAt:new Date(),updatedAt:new Date()};
			let applicant=$state({...initial});
			window.reset=(changes={})=>{document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());document.querySelectorAll('[popover]:popover-open').forEach(panel=>panel.hidePopover());applicant={...initial,...changes};window.accountCalls=[];window.questions=[];window.messages=[];window.confirm=true;window.realConfirmation=false;window.deferConfirmation=false;window.deferAccount=false;window.failAccount=false;window.invitationSent=true;};
			window.linkApplicant=()=>applicant={...applicant,userId:'student'};
		</script>
		{#if mode==='view'}<View data={{applicant,programs:[]}} />{:else}<List data={{applicants:[applicant],programs:[],total:1,search:'',status:'all',filters:{}}} />{/if}<PopupHost />`
	};
	let server, browser;
	try {
		for (const [name, content] of Object.entries(files))
			writeFileSync(path.join(root, name), content);
		server = await createServer({
			root,
			configFile: false,
			plugins: [tailwindcss(), svelte({ configFile: false, preprocess: vitePreprocess() })],
			resolve: {
				alias: [
					{ find: '$app/state', replacement: path.join(root, 'state.svelte.js') },
					{ find: '$app/navigation', replacement: path.join(root, 'navigation.js') },
					{ find: '$app/paths', replacement: path.join(root, 'paths.js') },
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
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
		await expect(
			page.getByRole('button', { name: 'Actions for Test Applicant', exact: true })
		).toBeVisible();
		for (const mode of ['view', 'list']) {
			await page.evaluate((mode) => window.show(mode), mode);
			const enroll = page
				.locator('[popover]')
				.getByRole('button', { name: 'Enroll Student', exact: true });
			const dialog = page.getByRole('dialog', { name: 'Enroll Student', exact: true });
			const submit = dialog.locator('button[type="submit"]');
			async function reset(changes = {}) {
				await page.evaluate((changes) => window.reset(changes), changes);
				await page.getByRole('button', { name: 'Actions for Test Applicant', exact: true }).click();
			}
			await reset({ hasPicture: false });
			if (mode === 'view') await expect(enroll).toBeDisabled();
			else await expect(enroll).toHaveCount(0);
			await reset({ userId: 'existing' });
			await expect(enroll).toHaveCount(0);
			await reset();
			await enroll.click();
			await expect(dialog).toBeVisible();
			for (const [label, value] of Object.entries({
				'Full name': 'Test Applicant',
				'Application ID': '2026-1',
				'Email address': 'stored@example.com',
				'Contact number': '09123456789',
				Program: 'BSIS',
				'Year level': '1',
				Address: 'Bulacan'
			})) {
				await expect(dialog.getByLabel(label, { exact: true })).toHaveValue(value);
				await expect(dialog.getByLabel(label, { exact: true })).toHaveAttribute('readonly', '');
			}
			assert.deepEqual(
				await dialog
					.getByLabel('Section', { exact: true })
					.locator('option')
					.evaluateAll((options) => options.map((option) => option.value)),
				['', 'A', 'B', 'C', 'D']
			);
			await submit.click();
			assert.equal(await page.evaluate(() => window.questions.length), 0);
			await dialog.getByLabel('Section', { exact: true }).selectOption('B');
			await page.evaluate(() => (window.confirm = false));
			await submit.click();
			await expect(submit).toBeEnabled();
			await expect(dialog).toBeVisible();
			assert.equal(await page.evaluate(() => window.accountCalls.length), 0);
			assert.match(
				await page.evaluate(() => window.questions[0].message),
				/Test Applicant.*2026-1.*stored@example.com/
			);
			await reset();
			await enroll.click();
			await expect(dialog.getByLabel('Section', { exact: true })).toHaveValue('');
			await dialog.getByLabel('Section', { exact: true }).selectOption('D');
			await page.evaluate(() => {
				window.deferConfirmation = true;
				window.deferAccount = true;
			});
			await submit.click();
			await expect(submit).toBeDisabled();
			await submit.dispatchEvent('click');
			await page.keyboard.press('Escape');
			await expect(dialog).toBeVisible();
			assert.equal(await page.evaluate(() => window.questions.length), 1);
			assert.equal(await page.evaluate(() => window.accountCalls.length), 0);
			await page.evaluate(() => window.finishConfirmation(true));
			await expect.poll(() => page.evaluate(() => window.accountCalls.length)).toBe(1);
			await submit.dispatchEvent('click');
			assert.equal(await page.evaluate(() => window.accountCalls.length), 1);
			await page.evaluate(() => window.finishAccount());
			await expect
				.poll(() => page.evaluate(() => window.messages.at(-1)?.message))
				.toBe('Student enrolled successfully');
			await expect(dialog).not.toBeVisible();
			await expect(enroll).toHaveCount(0);
			await expect(
				page.getByRole('button', { name: 'Actions for Test Applicant', exact: true })
			).toBeEnabled();
			assert.deepEqual(await page.evaluate(() => window.accountCalls), [{ applicantId: 'a' }]);
			await reset();
			await enroll.click();
			await dialog.getByLabel('Section', { exact: true }).selectOption('A');
			await page.evaluate(() => (window.failAccount = true));
			await submit.click();
			await expect
				.poll(() => page.evaluate(() => window.messages.at(-1)?.message))
				.toBe('Account creation failed');
			await expect(submit).toBeEnabled();
			await expect(dialog).toBeVisible();
			await reset();
			await enroll.click();
			await dialog.getByLabel('Section', { exact: true }).selectOption('C');
			await page.evaluate(() => (window.invitationSent = false));
			await submit.click();
			await expect
				.poll(() => page.evaluate(() => window.messages.at(-1)?.message))
				.toBe('Student enrolled, but invitation failed. Resend it from the Students page.');
			await expect(dialog).not.toBeVisible();
			await expect(enroll).toHaveCount(0);
			await reset();
			await enroll.click();
			await dialog.getByLabel('Section', { exact: true }).selectOption('A');
			await page.evaluate(() => (window.realConfirmation = true));
			await submit.click();
			const confirmation = page.getByRole('dialog', { name: 'Enroll student?', exact: true });
			await expect(confirmation).toBeVisible();
			await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
			await expect(confirmation).not.toBeVisible();
			await expect(submit).toBeEnabled();
			assert.equal(await page.evaluate(() => window.accountCalls.length), 0);
			await submit.click();
			await confirmation.getByRole('button', { name: 'Enroll Student', exact: true }).click();
			await expect(dialog).not.toBeVisible();
			assert.deepEqual(await page.evaluate(() => window.accountCalls), [{ applicantId: 'a' }]);
		}
		assert.deepEqual(errors, []);
	} finally {
		await browser?.close();
		await server?.close();
		for (const name of Object.keys(files)) rmSync(path.join(root, name), { force: true });
		rmdirSync(root);
	}
});
