import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { chromium } from '@playwright/test';

// Requires the configured local admin and OCR downloads. Reference is a local fixture;
// every Save request is intercepted before reaching the server, preserving real setup.
test(
	'office editor saves displayed suggestions and shows three independently draggable boxes in one preview',
	{ timeout: 180_000 },
	async () => {
		const browser = await chromium.launch({ channel: 'chrome', headless: true });
		try {
			const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
			const errors = [];
			page.on('pageerror', (error) => errors.push(error.message));
			const base = process.env.CLEARANCE_ADMIN_TEST_URL || 'http://localhost:5173';
			let submitted;
			await page.route('**/*saveClearanceAreas*', async (route) => {
				const data = JSON.parse(
					Buffer.from(route.request().postDataJSON().payload, 'base64').toString()
				);
				const expand = (index) => {
					if (index < 0) return undefined;
					const value = data[index];
					if (Array.isArray(value)) return value.map(expand);
					if (value && typeof value === 'object')
						return Object.fromEntries(
							Object.entries(value).map(([key, index]) => [key, expand(index)])
						);
					return value;
				};
				submitted = expand(0).definition;
				await route.abort();
			});
			await page.route('**/user/clearance-template?*', (route) =>
				route.fulfill({
					contentType: 'image/jpeg',
					body: readFileSync('static/clearance-reference.jpg')
				})
			);
			await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 60000 });
			await page
				.getByLabel('Email', { exact: true })
				.fill(process.env.INITIAL_ADMIN_EMAIL || 'admin@admin.com');
			await page
				.getByLabel('Password', { exact: true })
				.fill(process.env.INITIAL_ADMIN_PASSWORD || 'admin123');
			await page.getByRole('button', { name: 'Sign in', exact: true }).click();
			await page.waitForURL('**/user/dashboard');
			await page.goto(`${base}/user/settings/clearance`, { waitUntil: 'networkidle' });
			const office = page.getByRole('region', {
				name: '5. Offices, checkboxes and signatures',
				exact: true
			});
			const rows = office
				.getByRole('list', { name: 'Office rows', exact: true })
				.getByRole('listitem');
			const originalLabels = await rows
				.getByRole('button')
				.filter({ hasNot: page.locator('svg') })
				.allTextContents();
			const save = page.getByRole('button', { name: 'Save template areas', exact: true });
			await office.getByRole('button', { name: 'Auto-detect office rows', exact: true }).click();
			await office.getByText('Found 5 office rows', { exact: true }).waitFor({ timeout: 150000 });
			assert.equal(
				await office.getByRole('button', { name: 'Use office suggestions', exact: true }).count(),
				0
			);
			const legend = office.getByRole('group', { name: 'Office area legend', exact: true });
			const editor = office.getByRole('group', { name: 'Marked area editor', exact: true });
			const coords = office.getByRole('group', { name: 'Area coordinates', exact: true });
			const labels = ['Office name', 'Cleared checkbox', 'Signature / stamp'];
			assert.equal(await editor.locator('svg rect').count(), 3);
			assert.equal(
				new Set(
					await editor
						.locator('svg rect')
						.evaluateAll((rects) => rects.map((rect) => rect.getAttribute('stroke')))
				).size,
				3
			);
			const readBox = async () =>
				Object.fromEntries(
					await Promise.all(
						['x', 'y', 'width', 'height'].map(async (axis) => [
							axis,
							Number(await coords.getByLabel(`${axis} %`, { exact: true }).inputValue())
						])
					)
				);
			const boxes = {};
			for (const label of labels) {
				await legend.getByRole('button', { name: label, exact: true }).click();
				boxes[label] = await readBox();
			}
			for (const label of [...labels, 'Cleared checkbox']) {
				await legend.getByRole('button', { name: label, exact: true }).click();
				await editor.scrollIntoViewIfNeeded();
				const bounds = await editor.boundingBox();
				const target = await editor
					.getByRole('button', { name: `Move ${label}`, exact: true })
					.boundingBox();
				const before = await readBox();
				await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
				await page.mouse.down();
				await page.mouse.move(target.x + target.width / 2 + 12, target.y + target.height / 2 + 8, {
					steps: 6
				});
				await page.mouse.up();
				const after = await readBox();
				assert(
					Math.abs(after.x - before.x - 1200 / bounds.width) < 0.2,
					`${label} should move horizontally`
				);
				assert(
					Math.abs(after.y - before.y - 800 / bounds.height) < 0.2,
					`${label} should move vertically`
				);
				assert.equal(after.width, before.width, `${label} must retain width while moving`);
				assert.equal(after.height, before.height, `${label} must retain height while moving`);
				boxes[label] = after;
			}
			for (const label of labels) {
				await legend.getByRole('button', { name: label, exact: true }).click();
				assert.deepEqual(
					await readBox(),
					boxes[label],
					'Moving a different area must not change this one.'
				);
			}
			// Drag an unselected checkbox directly: selection must not destroy its pointer capture.
			let target = await editor
				.getByRole('button', { name: 'Move Cleared checkbox', exact: true })
				.boundingBox();
			await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
			await page.mouse.down();
			await page.mouse.move(target.x + target.width / 2 + 8, target.y + target.height / 2, {
				steps: 6
			});
			await page.mouse.up();
			assert.equal(
				await legend
					.getByRole('button', { name: 'Cleared checkbox', exact: true })
					.getAttribute('aria-pressed'),
				'true'
			);
			assert((await readBox()).x > boxes['Cleared checkbox'].x);
			assert.equal((await readBox()).width, boxes['Cleared checkbox'].width);
			boxes['Cleared checkbox'] = await readBox();
			// Escape restores the same area; corner dragging still resizes it.
			await legend.getByRole('button', { name: 'Signature / stamp', exact: true }).click();
			target = await editor
				.getByRole('button', { name: 'Move Signature / stamp', exact: true })
				.boundingBox();
			await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
			await page.mouse.down();
			await page.mouse.move(target.x + target.width / 2 + 15, target.y + target.height / 2 + 8, {
				steps: 6
			});
			await page.keyboard.press('Escape');
			await page.mouse.up();
			assert.deepEqual(await readBox(), boxes['Signature / stamp']);
			const corner = await editor
				.getByRole('button', { name: 'Resize area bottom right', exact: true })
				.boundingBox();
			await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
			await page.mouse.down();
			await page.mouse.move(corner.x + corner.width / 2 + 12, corner.y + corner.height / 2 + 8, {
				steps: 6
			});
			await page.mouse.up();
			assert((await readBox()).width > boxes['Signature / stamp'].width);
			assert.equal((await readBox()).x, boxes['Signature / stamp'].x);
			boxes['Signature / stamp'] = await readBox();
			await page.setViewportSize({ width: 390, height: 844 });
			await page.waitForTimeout(500);
			assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
			await legend.getByRole('button', { name: 'Cleared checkbox', exact: true }).click();
			await editor.scrollIntoViewIfNeeded();
			target = await editor
				.getByRole('button', { name: 'Move Cleared checkbox', exact: true })
				.boundingBox();
			await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
			await page.mouse.down();
			await page.mouse.move(target.x + target.width / 2 + 8, target.y + target.height / 2, {
				steps: 6
			});
			await page.mouse.up();
			assert(
				(await readBox()).x > boxes['Cleared checkbox'].x,
				'Small mobile checkbox center stays draggable.'
			);
			assert.equal((await readBox()).width, boxes['Cleared checkbox'].width);
			boxes['Cleared checkbox'] = await readBox();
			await office.getByLabel('Office name', { exact: true }).fill('PTCA');
			assert(await save.isDisabled(), 'Invalid visible suggestions must block Save.');
			await office.getByLabel('Office name', { exact: true }).fill('SG Adviser');
			const request = page.waitForRequest(
				(r) => r.method() === 'POST' && r.url().includes('saveClearanceAreas')
			);
			await save.click();
			await request;
			await page.waitForTimeout(100);
			assert.equal(
				submitted.officeRows.length,
				5,
				'Save must include detected offices without another Apply step.'
			);
			for (const [kind, label] of Object.entries({
				office: 'Office name',
				cleared: 'Cleared checkbox',
				signature: 'Signature / stamp'
			})) {
				for (const axis of ['x', 'y', 'width', 'height'])
					assert(Math.abs(submitted.officeRows[0][kind][axis] * 100 - boxes[label][axis]) < 0.06);
			}
			await office.getByRole('button', { name: 'Discard office suggestions', exact: true }).click();
			assert.deepEqual(
				await rows
					.getByRole('button')
					.filter({ hasNot: page.locator('svg') })
					.allTextContents(),
				originalLabels
			);
			assert.deepEqual(errors, []);
		} finally {
			await browser.close();
		}
	}
);
