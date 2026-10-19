import { chromium, expect } from '@playwright/test';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

const sourcePath = (file) => path.resolve(file).replaceAll('\\', '/');

for (const [managedRole, label] of [
	['registrar', 'Registrar'],
	['admin', 'Administrator']
]) {
	const noun = label.toLowerCase();
	test(`${noun} errors stay safe, self actions are blocked, and deletion requires confirmation`, async () => {
		const root = mkdtempSync(path.resolve('.tmp-registrar-email-'));
		let server, browser;
		try {
			const files = {
				'index.html':
					'<!doctype html><html lang="en" data-theme="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="app" class="p-6"></main><script type="module" src="/main.js"></script></body></html>',
				'main.js':
					"import './style.css';import {mount} from 'svelte';import Harness from './Harness.svelte';mount(Harness,{target:document.getElementById('app')});",
				'style.css': "@import '../src/routes/layout.css'; @source '../src';",
				'navigation.js':
					'export function beforeNavigate(){};export async function goto(){};export async function refreshAll(){};',
				'state.svelte.js':
					"export const page=$state({url:new URL('/user/registrars',window.location.origin)});",
				'actions.js': `import {HandledHttpError} from '@sveltejs/kit/internal';export async function revokeAccountSessions(){throw Error('Unexpected session revocation');}export async function deleteStudent(){throw Error('Unexpected deletion');}export async function deleteRegistrar(data){window.deletedRegistrar=data.userId;}export async function setRegistrarDisabled(){throw Error('Unexpected access change');}
				window.existingRole='student';
				export async function createRegistrar(){if(window.failure==='native')throw new Error('SECRET smtp credentials');if(window.failure==='server')throw new HandledHttpError({status:500,message:'SECRET database credentials'});throw new HandledHttpError({status:409,message:'A '+window.existingRole+' account already exists with this email.'});}
				export async function resendMagicLink(){} export async function updateRegistrar(){} export const createAdmin=createRegistrar,updateAdmin=updateRegistrar,deleteAdmin=deleteRegistrar,setAdminDisabled=setRegistrarDisabled;`,
				'Harness.svelte': `<script>
				import Registrars from '${sourcePath(`src/routes/user/${managedRole === 'admin' ? 'admins' : 'registrars'}/+page.svelte`)}';
				import PopupHost from '${sourcePath('src/lib/components/Popup/PopupHost.svelte')}';
			</script><Registrars data={{managedRole:'${managedRole}',currentUserId:'self',users:[{id:'self',name:'Current ${label}',firstName:'Current',middleName:'',lastName:'${label}',email:'self@example.com',setupComplete:true,banned:false},{id:'r',name:'Test ${label}',firstName:'Test',middleName:'',lastName:'${label}',email:'r@example.com',setupComplete:true,banned:false}],total:2,search:'',status:'all',filters:{}}}/><PopupHost/>`
			};
			for (const [file, content] of Object.entries(files))
				writeFileSync(path.join(root, file), content);
			server = await createServer({
				root,
				configFile: false,
				plugins: [tailwindcss(), svelte({ configFile: false, preprocess: vitePreprocess() })],
				resolve: {
					alias: [
						{ find: '$app/navigation', replacement: path.join(root, 'navigation.js') },
						{ find: '$app/state', replacement: path.join(root, 'state.svelte.js') },
						{ find: '#lib/actions/user.remote.js', replacement: path.join(root, 'actions.js') },
						{ find: '#lib', replacement: path.resolve('src/lib') }
					]
				},
				server: { host: '127.0.0.1', port: 0 }
			});
			await server.listen();
			browser = await chromium.launch({ headless: true, channel: 'msedge' });
			const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });
			const errors = [];
			page.on('pageerror', (cause) => errors.push(cause.message));
			await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
			if (managedRole === 'admin') {
				await page
					.getByRole('button', { name: `Actions for Current ${label}`, exact: true })
					.click();
				await expect(
					page.getByRole('button', { name: 'Disable account', exact: true })
				).toBeDisabled();
				await expect(
					page.getByRole('button', { name: 'Delete account', exact: true })
				).toBeDisabled();
				await expect(page.getByRole('button', { name: `Edit ${noun}`, exact: true })).toBeEnabled();
				await expect(
					page.getByRole('button', { name: 'Revoke sessions', exact: true })
				).toBeEnabled();
				await page
					.getByRole('button', { name: `Actions for Current ${label}`, exact: true })
					.click();
			}
			await page.getByRole('button', { name: `New ${label}`, exact: true }).click();
			const form = page.getByRole('dialog', { name: `New ${noun}`, exact: true });
			await form.getByLabel('First name', { exact: true }).fill('New');
			await form.getByLabel('Last name', { exact: true }).fill(label);
			await form.getByLabel('Email', { exact: true }).fill('taken@example.com');
			for (const role of ['student', 'registrar']) {
				await page.evaluate((role) => (window.existingRole = role), role);
				await form.getByRole('button', { name: `Create ${noun}`, exact: true }).click();
				const popup = page.getByRole('dialog', { name: `Unable to create ${noun}`, exact: true });
				await expect(
					popup.getByText(`A ${role} account already exists with this email.`, { exact: true })
				).toBeVisible();
				await expect(
					popup.getByText(`Failed to create ${noun}. Please try again.`, { exact: true })
				).toHaveCount(0);
				if (role === 'student') {
					mkdirSync(path.resolve('.tmp'), { recursive: true });
					await page.screenshot({ path: path.resolve(`.tmp/${managedRole}-email-conflict.png`) });
				}
				await popup.getByRole('button', { name: 'Close', exact: true }).click();
				await expect(form).toHaveJSProperty('open', true);
			}
			for (const failure of ['native', 'server']) {
				await page.evaluate((failure) => (window.failure = failure), failure);
				await form.getByRole('button', { name: `Create ${noun}`, exact: true }).click();
				const popup = page.getByRole('dialog', { name: `Unable to create ${noun}`, exact: true });
				await expect(
					popup.getByText(`Failed to create ${noun}. Please try again.`, { exact: true })
				).toBeVisible();
				assert.ok(!(await popup.textContent()).includes('SECRET'));
				await popup.getByRole('button', { name: 'Close', exact: true }).click();
				await expect(form).toHaveJSProperty('open', true);
			}
			await form.getByRole('button', { name: 'Cancel', exact: true }).click();
			await expect(
				page.getByRole('button', { name: 'Delete account', exact: true })
			).not.toBeVisible();
			await page.getByRole('button', { name: `Actions for Test ${label}`, exact: true }).click();
			await page.getByRole('button', { name: 'Delete account', exact: true }).click();
			const confirmation = page.getByRole('dialog', {
				name: `Delete ${noun} account?`,
				exact: true
			});
			await expect(
				confirmation.getByText(
					/Student enrollments, subjects, grades, and notifications will be kept/
				)
			).toBeVisible();
			await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
			assert.equal(await page.evaluate(() => window.deletedRegistrar), undefined);
			await page.getByRole('button', { name: `Actions for Test ${label}`, exact: true }).click();
			await page.getByRole('button', { name: 'Delete account', exact: true }).click();
			await confirmation.getByRole('button', { name: 'Delete account', exact: true }).click();
			await expect(page.getByText(`${label} account deleted.`, { exact: true })).toBeVisible();
			assert.equal(await page.evaluate(() => window.deletedRegistrar), 'r');
			assert.deepEqual(errors, []);
		} finally {
			await browser?.close();
			await server?.close();
			assert.equal(path.dirname(root), process.cwd());
			rmSync(root, { recursive: true, force: true });
		}
	});
}
