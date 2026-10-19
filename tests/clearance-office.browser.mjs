import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from '@playwright/test';

// Requires Vite, Chrome and public OCR engine/language downloads. No uploads or database writes.
test(
	'office OCR locates five real rows with cleared checkboxes and signature spaces; supports cancellation',
	{ timeout: 180_000 },
	async () => {
		const browser = await chromium.launch({ channel: 'chrome', headless: true });
		try {
			const page = await browser.newPage();
			await page.goto(process.env.CLEARANCE_TEST_URL || 'http://localhost:5173/test');
			const evidence = await page.evaluate(async () => {
				const p = await import('/src/lib/clearance/scan.client.ts');
				const { officeRowsSchema } = await import('/src/lib/clearance/definition.ts');
				const reference = await p.loadImage('/clearance-reference.jpg');
				const corners = p.detectBorder(reference);
				if (!corners) throw new Error('Reference outline not found.');
				const result = await p.detectOfficeRows(
					reference,
					corners,
					() => {},
					new AbortController().signal
				);
				const controller = new AbortController();
				controller.abort();
				let cancelled = false;
				try {
					await p.detectOfficeRows(reference, corners, () => {}, controller.signal);
				} catch {
					cancelled = true;
				}
				return { result, valid: officeRowsSchema.safeParse(result.rows).success, cancelled };
			});
			assert(evidence.valid);
			assert(evidence.cancelled);
			assert.deepEqual(
				evidence.result.rows.map((r) => r.label),
				['SG Adviser', 'PTCA', 'Adviser', 'Research', 'Program Head']
			);
			for (const row of evidence.result.rows) {
				assert(row.cleared && row.signature, row.label);
				assert(row.office.x + row.office.width < row.cleared.x);
				assert(row.cleared.x > 0.25 && row.cleared.x < 0.32);
				assert.equal(row.notCleared, undefined);
				assert(row.signature.x > 0.58 && row.signature.x + row.signature.width < 0.86);
				assert(Math.abs(row.signature.y - row.cleared.y) < 0.08);
			}
		} finally {
			await browser.close();
		}
	}
);
