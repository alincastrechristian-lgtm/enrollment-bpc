import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { createServer } from 'vite';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test(
	'security forms validate passwords, render a local QR, verify setup and disable 2FA',
	{ timeout: 90000 },
	async () => {
		const root = mkdtempSync(path.resolve('.tmp-security-ui-'));
		let server, browser;
		try {
			const source = path
				.resolve('src/routes/user/settings/security/+page.svelte')
				.replaceAll('\\', '/');
			const files = {
				'index.html':
					'<html data-theme="light"><main id="app" style="padding:24px"></main><script type="module" src="/main.js"></script></html>',
				'main.js':
					"import './style.css';import {mount} from 'svelte';import App from './App.svelte';mount(App,{target:document.getElementById('app')});",
				'style.css': "@import '../src/routes/layout.css'; @source '../src';",
				'App.svelte': `<script>import Page from '${source}';let data=$state({twoFactorEnabled:false});window.refreshSecurity=()=>data.twoFactorEnabled=window.enabled;</script><Page {data}/>`,
				'auth.js': `window.calls=[];window.enabled=false;const record=(name,input)=>window.calls.push({name,input});export const authClient={changePassword:async input=>{record('password',input);return{};},twoFactor:{enable:async input=>{record('enable',input);return{data:{method:'totp',totpURI:'otpauth://totp/BPC:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=BPC',backupCodes:['abcde-12345','fghij-67890']}};},verifyTotp:async input=>{record('verify',input);if(input.code!=='123456')return{error:{code:'INVALID_CODE'}};window.enabled=true;return{};},disable:async input=>{record('disable',input);window.enabled=false;return{};}}};`,
				'navigation.js': 'export const invalidateAll=async()=>window.refreshSecurity();',
				'errors.js':
					"export const getAuthErrorMessage=()=> 'Invalid authentication code. Try again.';"
			};
			for (const [name, contents] of Object.entries(files))
				writeFileSync(path.join(root, name), contents);
			server = await createServer({
				root,
				configFile: false,
				plugins: [tailwindcss(), svelte({ configFile: false, preprocess: vitePreprocess() })],
				resolve: {
					alias: [
						{ find: '#lib/auth-client.js', replacement: path.join(root, 'auth.js') },
						{ find: '#lib/errors.js', replacement: path.join(root, 'errors.js') },
						{ find: '$app/navigation', replacement: path.join(root, 'navigation.js') }
					]
				},
				server: { host: '127.0.0.1', port: 0 }
			});
			await server.listen();
			browser = await chromium.launch({ channel: 'chrome', headless: true });
			const page = await browser.newPage();
			const errors = [];
			page.on('pageerror', (error) => errors.push(error.message));
			await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
			await page.getByLabel('Current password', { exact: true }).first().fill('old-password');
			await page.getByLabel('New password', { exact: true }).fill('new-password-123');
			await page.getByLabel('Confirm new password').fill('different-password');
			await page.getByRole('button', { name: 'Change password', exact: true }).click();
			await expect(page.getByRole('alert')).toHaveText('New passwords do not match.');
			assert.equal(await page.evaluate(() => window.calls.length), 0);
			await page.getByLabel('Confirm new password').fill('new-password-123');
			await page.getByRole('button', { name: 'Change password', exact: true }).click();
			await expect(page.getByRole('status')).toContainText('Password changed');
			assert.equal(await page.evaluate(() => window.calls[0].input.revokeOtherSessions), true);
			await page.getByLabel('Current password', { exact: true }).last().fill('new-password-123');
			await page.getByRole('button', { name: 'Set up authenticator app' }).click();
			const qr = page.getByRole('img', { name: 'QR code for authenticator setup' });
			await expect(qr).toBeVisible();
			await page.setViewportSize({ width: 375, height: 812 });
			assert.equal(
				await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
				true
			);
			await page.setViewportSize({ width: 1280, height: 900 });
			assert.match(await qr.getAttribute('src'), /^data:image\/png;base64,/);
			assert.ok(await qr.evaluate((img) => img.naturalWidth > 0));
			await expect(page.getByText('abcde-12345')).toBeVisible();
			await expect(page.getByRole('button', { name: 'Verify and enable' })).toBeDisabled();
			await page.getByRole('checkbox').check();
			await page.getByLabel('3. Enter the 6-digit code from your app').fill('654321');
			await page.getByRole('button', { name: 'Verify and enable' }).click();
			await expect(page.getByRole('alert')).toContainText('Invalid authentication code');
			await expect(qr).toBeVisible();
			await page.getByLabel('3. Enter the 6-digit code from your app').fill('123456');
			await page.getByRole('button', { name: 'Verify and enable' }).click();
			await expect(page.getByRole('status')).toContainText('Two-factor authentication enabled');
			await expect(qr).toHaveCount(0);
			await page.getByLabel('Current password', { exact: true }).last().fill('new-password-123');
			await page.getByRole('button', { name: 'Disable two-factor authentication' }).click();
			await expect(page.getByRole('status')).toContainText('Two-factor authentication disabled');
			await page.getByLabel('Current password', { exact: true }).last().fill('new-password-123');
			await page.getByRole('button', { name: 'Set up authenticator app' }).click();
			await expect(qr).toBeVisible();
			await page.getByRole('button', { name: 'Cancel setup' }).click();
			await expect(qr).toHaveCount(0);
			await expect(page.getByRole('button', { name: 'Set up authenticator app' })).toBeVisible();
			assert.deepEqual(errors, []);
		} finally {
			await browser?.close();
			await server?.close();
			if (
				path.dirname(root) === process.cwd() &&
				path.basename(root).startsWith('.tmp-security-ui-')
			)
				rmSync(root, { recursive: true, force: true });
		}
	}
);
