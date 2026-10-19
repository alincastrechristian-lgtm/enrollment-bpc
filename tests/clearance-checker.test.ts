import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import sharp from 'sharp';
import { isHttpError } from '@sveltejs/kit';
import { checkClearance, decodeClearance } from '../src/lib/server/clearance-checker';
import { homography, project, UNIT_CORNERS, overall } from '../src/lib/clearance/clearance';
import { clearancePassed } from '../src/lib/clearance/report';
import type { TemplateDefinition } from '../src/lib/clearance/definition';

const definition: TemplateDefinition = {
	corners: [
		{ x: 0.063829787234, y: 0.030944625407 },
		{ x: 0.915370555918, y: 0.011786225446 },
		{ x: 0.971214017522, y: 0.864820846906 },
		{ x: 0.073842302879, y: 0.964169381107 }
	],
	semester: '2',
	schoolYear: '2025-2026',
	areas: [
		{
			id: crypto.randomUUID(),
			label: 'School',
			kind: 'text',
			expected: 'BULACAN POLYTECHNIC COLLEGE',
			box: { x: 0.28858, y: 0, width: 0.40742, height: 0.04215 }
		},
		{
			id: crypto.randomUUID(),
			label: 'Form',
			kind: 'text',
			expected: 'Student Clearance Form',
			box: { x: 0.32125, y: 0.11943, width: 0.34042, height: 0.04459 }
		},
		{
			id: crypto.randomUUID(),
			label: 'Semester',
			kind: 'semester',
			expected: '',
			box: { x: 0.33117, y: 0.16391, width: 0.31934, height: 0.0379 }
		},
		{
			id: crypto.randomUUID(),
			label: 'Year',
			kind: 'academicYear',
			expected: '',
			box: { x: 0.53375, y: 0.16454, width: 0.11625, height: 0.03344 }
		},
		{
			id: crypto.randomUUID(),
			label: 'Seal',
			kind: 'image',
			expected: '',
			box: { x: 0.07117, y: 0.00255, width: 0.18184, height: 0.21996 }
		}
	],
	officeRows: [
		{
			id: crypto.randomUUID(),
			label: 'SG Adviser',
			office: { x: 0.075, y: 0.301, width: 0.123, height: 0.027 },
			cleared: { x: 0.26, y: 0.289, width: 0.045, height: 0.052 },
			signature: { x: 0.6, y: 0.27, width: 0.2, height: 0.06 }
		}
	]
};
test('offline server OCR validates real template before checking marks; blank, missing and wrong evidence cannot pass', async () => {
	const bytes = readFileSync('static/clearance-reference.jpg');
	const blank = await decodeClearance(bytes, 'image/jpeg');
	const report = await checkClearance(bytes, blank, definition.corners, definition);
	assert.equal(overall(report.template), 'pass');
	assert.equal(overall(report.offices), 'fail');
	assert(!clearancePassed(report));
	assert.equal(report.identity, 'deferred');
	const matrix = homography(UNIT_CORNERS, definition.corners);
	const point = (x: number, y: number) => {
		const p = project(matrix, { x, y });
		return `${p.x * blank.width},${p.y * blank.height}`;
	};
	const mark = Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${blank.width}" height="${blank.height}"><g stroke="black" stroke-width="3" fill="none"><polyline points="${point(0.27, 0.3)} ${point(0.29, 0.33)} ${point(0.3, 0.3)}"/><polyline points="${point(0.63, 0.3)} ${point(0.65, 0.31)} ${point(0.68, 0.29)} ${point(0.69, 0.32)} ${point(0.73, 0.3)} ${point(0.77, 0.32)}"/></g></svg>`
	);
	const markedBytes = await sharp(bytes)
		.composite([{ input: mark }])
		.png()
		.toBuffer();
	const accepted = await checkClearance(
		bytes,
		await decodeClearance(markedBytes, 'image/png'),
		definition.corners,
		definition
	);
	assert(clearancePassed(accepted));
	const wrong = await checkClearance(bytes, blank, definition.corners, {
		...definition,
		schoolYear: '2026-2027'
	});
	assert.equal(overall(wrong.template), 'fail');
	assert.deepEqual(wrong.offices, [], 'Office checks run only after template validation passes.');
});
test('server decoder rejects spoofed MIME types, unsupported formats and tiny images', async () => {
	const bytes = readFileSync('static/clearance-reference.jpg');
	await assert.rejects(
		decodeClearance(bytes, 'image/png'),
		(e) => isHttpError(e) && e.status === 400
	);
	const tiny = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } })
		.png()
		.toBuffer();
	await assert.rejects(
		decodeClearance(tiny, 'image/png'),
		(e) => isHttpError(e) && e.status === 400
	);
	await assert.rejects(decodeClearance(Buffer.from('not an image')));
});

test('real written photo rejects four empty checkboxes while accepting the Adviser tick', async () => {
	const offices = [
		['SG Adviser', 0.26, 0.289278, 0.052548, 0.267914],
		['PTCA', 0.26125, 0.348195, 0.052017, 0.344878],
		['Adviser', 0.262083, 0.408705, 0.051486, 0.404326],
		['Research', 0.26375, 0.474522, 0.050955, 0.467224],
		['Program Head', 0.265, 0.535563, 0.050955, 0.53052]
	] as const;
	const configured = {
		...definition,
		officeRows: offices.map(([label, x, y, height, signatureY]) => ({
			id: crypto.randomUUID(),
			label,
			cleared: { x, y, width: 0.045, height },
			signature: { x: 0.602, y: signatureY, width: 0.22, height: 0.05 }
		}))
	};
	const report = await checkClearance(
		readFileSync('static/clearance-reference.jpg'),
		await decodeClearance(readFileSync('static/clearance-written-example.jpg')),
		[
			{ x: 0.161451814768, y: 0.033684210526 },
			{ x: 0.860611122192, y: 0.012631885295 },
			{ x: 0.90112640801, y: 0.911578947368 },
			{ x: 0.170212765957, y: 1 }
		],
		configured
	);
	assert.equal(overall(report.template), 'pass');
	assert.deepEqual(
		report.offices
			.filter((check) => check.label.endsWith('cleared checkbox'))
			.map((check) => check.verdict),
		['fail', 'fail', 'pass', 'fail', 'fail']
	);
	assert.equal(clearancePassed(report), false);
});

test('photocopied printed areas and italic year match without accepting empty offices, wrong years or a replaced logo', async () => {
	const folder = 'tests/fixtures/clearance-photocopy/';
	const { definition: configured, uploadCorners } = JSON.parse(
		readFileSync(folder + 'definition.json', 'utf8')
	) as { definition: TemplateDefinition; uploadCorners: typeof UNIT_CORNERS };
	const reference = readFileSync(folder + 'reference.jpg'),
		bytes = readFileSync(folder + 'upload.jpg');
	const image = await decodeClearance(bytes);
	const report = await checkClearance(reference, image, uploadCorners, configured);
	assert.equal(overall(report.template), 'pass', JSON.stringify(report.template));
	assert.equal(
		clearancePassed(report),
		false,
		'Template match must not approve empty office checkboxes.'
	);
	assert(
		report.offices
			.filter((check) => check.label.endsWith('cleared checkbox'))
			.every((check) => check.verdict === 'fail')
	);
	const wrongYear = await checkClearance(reference, image, uploadCorners, {
		...configured,
		schoolYear: '2027-2028'
	});
	assert.equal(overall(wrongYear.template), 'fail');
	assert.deepEqual(wrongYear.offices, []);
	const area = configured.areas.find((area) => area.kind === 'image')!.box;
	const matrix = homography(UNIT_CORNERS, uploadCorners);
	const point = (x: number, y: number) => {
		const p = project(matrix, { x, y });
		return `${p.x * image.width},${p.y * image.height}`;
	};
	const erase = Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${image.width}" height="${image.height}"><polygon fill="white" points="${point(area.x, area.y)} ${point(area.x + area.width, area.y)} ${point(area.x + area.width, area.y + area.height)} ${point(area.x, area.y + area.height)}"/><rect x="125" y="45" width="100" height="110" fill="black"/><path d="M125 45L225 155M225 45L125 155" stroke="white" stroke-width="15"/></svg>`
	);
	const replaced = await sharp(bytes)
		.composite([{ input: erase }])
		.png()
		.toBuffer();
	const wrongLogo = await checkClearance(
		reference,
		await decodeClearance(replaced),
		uploadCorners,
		configured
	);
	assert.notEqual(
		wrongLogo.template.find(
			(check) => check.label === configured.areas.find((area) => area.kind === 'image')!.label
		)!.verdict,
		'pass'
	);
	assert.equal(clearancePassed(wrongLogo), false);
});
