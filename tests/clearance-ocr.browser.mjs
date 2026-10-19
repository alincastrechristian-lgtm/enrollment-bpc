import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from '@playwright/test';

// Requires the Vite dev server, Chrome, and network access for OCR engine/language data.
// Uses public local fixtures only; does not log in or upload scans to the server.
test(
	'original-pixel OCR reads auto-aligned headers without accepting another school or term',
	{
		timeout: 180_000
	},
	async () => {
		const browser = await chromium.launch({ channel: 'chrome', headless: true });
		try {
			const page = await browser.newPage();
			await page.goto(process.env.CLEARANCE_TEST_URL || 'http://localhost:5173/test');
			const evidence = await page.evaluate(async () => {
				const processor = await import('/src/lib/clearance/scan.client.ts');
				const { UNIT_CORNERS, PRINTED_REGIONS } = await import('/src/lib/clearance/clearance.ts');
				const { evaluateTemplate } = await import('/src/lib/clearance/template.ts');
				const signal = new AbortController().signal;
				const reference = await processor.loadImage('/clearance-reference.jpg');
				const source = await processor.loadImage('/clearance-written-example.jpg');
				const referenceCorners = processor.detectBorder(reference);
				const sourceCorners = processor.detectBorder(source);
				if (!referenceCorners || !sourceCorners) throw new Error('Example border not found.');
				const blank = processor.straighten(reference, referenceCorners);
				const uploaded = processor.straighten(source, sourceCorners);
				const referenceText = await processor.recognizePrinted(
					reference,
					referenceCorners,
					() => {},
					signal
				);
				const sourceText = await processor.recognizePrinted(
					source,
					sourceCorners,
					() => {},
					signal
				);
				const layout = processor.inspectTemplateLayout(uploaded, blank);
				const term = { semester: '2', schoolYear: '2025-2026' };
				const matching = evaluateTemplate(referenceText, sourceText, layout, term);
				const wrongSemester = evaluateTemplate(referenceText, sourceText, layout, {
					...term,
					semester: '1'
				});
				const wrongYear = evaluateTemplate(referenceText, sourceText, layout, {
					...term,
					schoolYear: '2026-2027'
				});
				const wrong = processor.straighten(reference, referenceCorners);
				const context = wrong.getContext('2d');
				const school = PRINTED_REGIONS.school;
				context.fillStyle = '#fff';
				context.fillRect(school.x, school.y, school.width, school.height);
				context.fillStyle = '#000';
				context.font = '26px Arial';
				context.fillText('OTHER SCHOOL', school.x + 10, school.y + 28);
				const wrongText = await processor.recognizePrinted(wrong, UNIT_CORNERS, () => {}, signal);
				const wrongSchool = evaluateTemplate(
					referenceText,
					wrongText,
					processor.inspectTemplateLayout(wrong, blank),
					term
				);
				return { referenceText, sourceText, matching, wrongSemester, wrongYear, wrongSchool };
			});
			for (const readings of [evidence.referenceText, evidence.sourceText]) {
				assert.equal(readings.school.text, 'BULACAN POLYTECHNIC COLLEGE');
				assert.match(readings.semester.text, /^2nd Semester\b/);
				assert(readings.school.confidence >= 65);
				assert(readings.semester.confidence >= 65);
			}
			assert.equal(evidence.matching.verdict, 'pass', JSON.stringify(evidence.matching.checks));
			assert.equal(evidence.wrongSchool.verdict, 'fail');
			assert.equal(evidence.wrongSemester.verdict, 'fail');
			assert.equal(evidence.wrongYear.verdict, 'fail');
		} finally {
			await browser.close();
		}
	}
);

test(
	'personal input discovery finds blank writing areas and supports separate fields in a different layout',
	{ timeout: 180_000 },
	async () => {
		const browser = await chromium.launch({ channel: 'chrome', headless: true });
		try {
			const page = await browser.newPage();
			await page.goto(process.env.CLEARANCE_TEST_URL || 'http://localhost:5173/test');
			const evidence = await page.evaluate(async () => {
				const p = await import('/src/lib/clearance/scan.client.ts');
				const { UNIT_CORNERS } = await import('/src/lib/clearance/clearance.ts');
				const { personalFieldsSchema } = await import('/src/lib/clearance/definition.ts');
				const ref = await p.loadImage('/clearance-reference.jpg');
				const real = await p.detectPersonalFields(
					ref,
					p.detectBorder(ref),
					() => {},
					new AbortController().signal
				);
				const image = document.createElement('canvas');
				image.width = 900;
				image.height = 1200;
				const ctx = image.getContext('2d');
				ctx.fillStyle = '#fff';
				ctx.fillRect(0, 0, 900, 1200);
				ctx.fillStyle = '#111';
				ctx.font = '28px Arial';
				ctx.strokeStyle = '#111';
				ctx.lineWidth = 2;
				ctx.fillText('Student Name:', 70, 620);
				ctx.fillText('Student Number:', 70, 720);
				ctx.fillText('Course:', 70, 820);
				ctx.fillText('Year:', 450, 820);
				ctx.fillText('Section:', 650, 820);
				for (const [x, right, y] of [
					[300, 780, 625],
					[360, 780, 725],
					[220, 400, 825],
					[540, 620, 825],
					[790, 870, 825]
				]) {
					ctx.beginPath();
					ctx.moveTo(x, y);
					ctx.lineTo(right, y);
					ctx.stroke();
				}
				const separate = await p.detectPersonalFields(
					image,
					UNIT_CORNERS,
					() => {},
					new AbortController().signal
				);
				ctx.fillStyle = '#fff';
				ctx.fillRect(0, 0, 900, 1200);
				const empty = await p.detectPersonalFields(
					image,
					UNIT_CORNERS,
					() => {},
					new AbortController().signal
				);
				return {
					real,
					separate,
					empty,
					valid: personalFieldsSchema.safeParse(real.fields).success
				};
			});
			assert(evidence.valid);
			assert.deepEqual(evidence.real.fields.map((a) => a.field).sort(), [
				'courseYearSection',
				'studentName',
				'studentNumber'
			]);
			const name = evidence.real.fields.find((f) => f.field === 'studentName').box;
			assert(name.y > 0.6 && name.y + name.height < 0.8);
			const number = evidence.real.fields.find((f) => f.field === 'studentNumber').box;
			assert(number.x > 0.15 && number.x + number.width < 0.7);
			assert.deepEqual(
				evidence.separate.fields.map((a) => a.field).sort(),
				['course', 'section', 'studentName', 'studentNumber', 'year'],
				JSON.stringify(evidence.separate)
			);
			assert.equal(evidence.empty.fields.length, 0);
			assert(evidence.empty.hints.some((h) => h.includes('not located')));
		} finally {
			await browser.close();
		}
	}
);

test(
	'marked areas support side branding and reject wrong logos, wording, positions and terms',
	{ timeout: 180_000 },
	async () => {
		const browser = await chromium.launch({ channel: 'chrome', headless: true });
		try {
			const page = await browser.newPage();
			await page.goto(process.env.CLEARANCE_TEST_URL || 'http://localhost:5173/test');
			const evidence = await page.evaluate(async () => {
				const p = await import('/src/lib/clearance/scan.client.ts');
				const c = await import('/src/lib/clearance/clearance.ts');
				const { definitionSchema } = await import('/src/lib/clearance/definition.ts');
				const area = (label, kind, expected, x, y, width, height) => ({
					id: crypto.randomUUID(),
					label,
					kind,
					expected,
					box: { x, y, width, height }
				});
				const def = {
					corners: c.UNIT_CORNERS,
					semester: '2',
					schoolYear: '2025-2026',
					areas: [
						area('Side school', 'text', 'Example Polytechnic College', 0.04, 0.24, 0.68, 0.055),
						area('Side form title', 'text', 'Student Clearance Form', 0.04, 0.32, 0.68, 0.055),
						area('Side seal', 'image', '', 0.04, 0.03, 0.18, 0.17),
						area('Semester', 'semester', '', 0.04, 0.4, 0.4, 0.055),
						area('Year', 'academicYear', '', 0.04, 0.48, 0.4, 0.055)
					]
				};
				definitionSchema.parse(def);
				function form(variant = '') {
					const image = document.createElement('canvas');
					image.width = 1000;
					image.height = 820;
					const ctx = image.getContext('2d');
					ctx.fillStyle = '#fff';
					ctx.fillRect(0, 0, 1000, 820);
					ctx.strokeStyle = '#111';
					ctx.lineWidth = 5;
					if (variant === 'wrong-logo') {
						ctx.strokeRect(60, 60, 135, 85);
						ctx.beginPath();
						ctx.moveTo(60, 60);
						ctx.lineTo(195, 145);
						ctx.stroke();
					} else {
						ctx.beginPath();
						ctx.arc(130, 95, 55, 0, Math.PI * 2);
						ctx.stroke();
						ctx.beginPath();
						ctx.moveTo(95, 100);
						ctx.lineTo(130, 55);
						ctx.lineTo(165, 100);
						ctx.closePath();
						ctx.stroke();
					}
					ctx.fillStyle = '#111';
					ctx.font = '30px Arial';
					const x = variant === 'moved-school' ? 360 : 50;
					ctx.fillText(
						variant === 'wrong-school' ? 'Other School' : 'Example Polytechnic College',
						x,
						232
					);
					ctx.fillText('Student Clearance Form', 50, 298);
					ctx.fillText(variant === 'wrong-term' ? '1st Semester' : '2nd Semester', 50, 363);
					ctx.fillText('2025-2026', 50, 429);
					ctx.font = '22px Arial';
					ctx.fillText(
						variant ? 'Filled student details and signature' : 'Student details',
						50,
						650
					);
					return image;
				}
				const result = {};
				for (const variant of [
					'filled',
					'wrong-logo',
					'wrong-school',
					'moved-school',
					'wrong-term'
				]) {
					const checks = await p.compareDefinedTemplate(
						form(),
						form(variant),
						c.UNIT_CORNERS,
						def,
						() => {},
						new AbortController().signal
					);
					result[variant] = { verdict: c.overall(checks), checks };
				}
				const ref = await p.loadImage('/clearance-reference.jpg'),
					written = await p.loadImage('/clearance-written-example.jpg');
				const real = {
					corners: p.detectBorder(ref),
					semester: '2',
					schoolYear: '2025-2026',
					areas: [
						area('School', 'text', 'BULACAN POLYTECHNIC COLLEGE', 0.285, 8 / 820, 0.45, 36 / 820),
						area('Title', 'text', 'Student Clearance Form', 0.32, 102 / 820, 0.37, 40 / 820),
						area('Seal', 'image', '', 0.09, 0.025, 0.17, 0.19),
						area('Semester', 'semester', '', 0.33, 141 / 820, 0.355, 36 / 820),
						area('Year', 'academicYear', '', 0.535, 141 / 820, 0.135, 36 / 820)
					]
				};
				const checks = await p.compareDefinedTemplate(
					ref,
					written,
					p.detectBorder(written),
					real,
					() => {},
					new AbortController().signal
				);
				result.real = { verdict: c.overall(checks), checks };
				return result;
			});
			assert.equal(evidence.filled.verdict, 'pass', JSON.stringify(evidence.filled.checks));
			for (const variant of ['wrong-logo', 'wrong-school', 'moved-school', 'wrong-term'])
				assert.notEqual(
					evidence[variant].verdict,
					'pass',
					JSON.stringify(evidence[variant].checks)
				);
			assert.equal(evidence.real.verdict, 'pass', JSON.stringify(evidence.real.checks));
		} finally {
			await browser.close();
		}
	}
);

test(
	'automatic suggestions locate real printed details and portrait side branding without fixed regions',
	{ timeout: 180_000 },
	async () => {
		const browser = await chromium.launch({ channel: 'chrome', headless: true });
		try {
			const page = await browser.newPage();
			await page.goto(process.env.CLEARANCE_TEST_URL || 'http://localhost:5173/test');
			const evidence = await page.evaluate(async () => {
				const p = await import('/src/lib/clearance/scan.client.ts');
				const { UNIT_CORNERS } = await import('/src/lib/clearance/clearance.ts');
				const { definitionSchema } = await import('/src/lib/clearance/definition.ts');
				const reference = await p.loadImage('/clearance-reference.jpg'),
					corners = p.detectBorder(reference);
				const real = await p.detectTemplateAreas(
					reference,
					corners,
					() => {},
					new AbortController().signal
				);
				const valid = definitionSchema.safeParse({
					corners,
					semester: real.semester,
					schoolYear: real.schoolYear,
					areas: real.areas
				}).success;
				const portrait = document.createElement('canvas');
				portrait.width = 900;
				portrait.height = 1200;
				const ctx = portrait.getContext('2d');
				ctx.fillStyle = '#fff';
				ctx.fillRect(0, 0, 900, 1200);
				ctx.fillStyle = '#111';
				ctx.font = '32px Arial';
				ctx.fillText('EXAMPLE POLYTECHNIC COLLEGE', 60, 560);
				ctx.fillText('Student Clearance Form', 60, 650);
				ctx.fillText('1st Semester, A.Y. 2026-2027', 60, 740);
				ctx.strokeStyle = '#111';
				ctx.lineWidth = 5;
				ctx.beginPath();
				ctx.arc(110, 300, 60, 0, Math.PI * 2);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(80, 320);
				ctx.lineTo(110, 260);
				ctx.lineTo(140, 320);
				ctx.closePath();
				ctx.stroke();
				const side = await p.detectTemplateAreas(
					portrait,
					UNIT_CORNERS,
					() => {},
					new AbortController().signal
				);
				ctx.fillStyle = '#fff';
				ctx.fillRect(0, 0, 900, 1200);
				const blank = await p.detectTemplateAreas(
					portrait,
					UNIT_CORNERS,
					() => {},
					new AbortController().signal
				);
				const controller = new AbortController();
				controller.abort();
				let cancelled = false;
				try {
					await p.detectTemplateAreas(portrait, UNIT_CORNERS, () => {}, controller.signal);
				} catch {
					cancelled = true;
				}
				return { real, side, blank, valid, cancelled };
			});
			assert(evidence.valid, JSON.stringify(evidence.real));
			assert(
				evidence.real.areas.some(
					(a) => a.kind === 'text' && a.expected === 'BULACAN POLYTECHNIC COLLEGE'
				)
			);
			assert(
				evidence.real.areas.some(
					(a) => a.kind === 'text' && a.expected === 'Student Clearance Form'
				)
			);
			assert.equal(evidence.real.semester, '2');
			assert.equal(evidence.real.schoolYear, '2025-2026');
			assert(
				evidence.real.areas.some(
					(a) =>
						a.kind === 'image' &&
						a.box.x < 0.17 &&
						a.box.x + a.box.width > 0.17 &&
						a.box.y < 0.1 &&
						a.box.y + a.box.height > 0.1
				)
			);
			const sideSchool = evidence.side.areas.find(
				(a) => a.kind === 'text' && a.expected.includes('EXAMPLE POLYTECHNIC')
			);
			assert(
				sideSchool && sideSchool.box.y > 0.4 && sideSchool.box.x < 0.15,
				JSON.stringify(evidence.side)
			);
			assert.equal(evidence.side.semester, '1');
			assert.equal(evidence.side.schoolYear, '2026-2027');
			assert(evidence.side.areas.some((a) => a.kind === 'image'));
			assert.equal(evidence.blank.areas.length, 0);
			assert(evidence.blank.hints.length > 1);
			assert(evidence.cancelled);
		} finally {
			await browser.close();
		}
	}
);
