import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file, deps = {}) {
	const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((name) => deps[name] ?? require(name), exports);
	return exports;
}
const core = load('src/lib/clearance/clearance.ts');
const {
	definitionSchema,
	checkAreaText,
	compareVisual,
	clearanceTermFromEnrollment,
	printedAreaBox,
	printedSearchBox
} = load('src/lib/clearance/definition.ts', {
	'./clearance': core
});
const definition = () => ({
	corners: structuredClone(core.UNIT_CORNERS),
	semester: '2',
	schoolYear: '2025-2026',
	areas: ['text', 'text', 'image', 'semester', 'academicYear'].map((kind, i) => ({
		id: crypto.randomUUID(),
		label: `Area ${i}`,
		kind,
		expected: kind === 'text' ? 'School name' : '',
		box: { x: 0.1, y: 0.1 + i * 0.1, width: 0.4, height: 0.05 }
	}))
});

test('year OCR uses confidence in the year token, while unclear or incorrect years cannot pass', () => {
	const { academicYearReading } = load('src/lib/clearance/printed.ts');
	const area = { ...definition().areas[0], kind: 'academicYear' };
	const data = (yearConfidence, lineConfidence = 61) => ({
		text: '. 2026-2027',
		confidence: lineConfidence,
		blocks: [
			{
				paragraphs: [
					{
						lines: [
							{
								words: [
									{ text: '.', confidence: 28 },
									{ text: '2026-2027', confidence: yearConfidence }
								]
							}
						]
					}
				]
			}
		]
	});
	const good = academicYearReading(data(95));
	assert.equal(good.confidence, 95);
	assert.equal(
		checkAreaText(area, good, { semester: '1', schoolYear: '2026-2027' }).verdict,
		'pass'
	);
	assert.equal(checkAreaText(area, good, definition()).verdict, 'fail');
	assert.equal(
		checkAreaText(area, academicYearReading(data(30, 95)), {
			semester: '1',
			schoolYear: '2026-2027'
		}).verdict,
		'review'
	);
	assert.equal(
		academicYearReading({ text: '2026-2027', confidence: 33, blocks: null }).confidence,
		33
	);
	assert.equal(academicYearReading({ ...data(95), text: '2026-2027 or 2027-2028' }).confidence, 61);
});

test('year crops gain bounded margin without changing stored boxes or other printed regions', () => {
	const area = {
		...definition().areas[0],
		kind: 'academicYear',
		box: { x: 0.5, y: 0.15, width: 0.13, height: 0.032 }
	};
	const original = structuredClone(area.box),
		box = printedAreaBox(area);
	assert(box.x < original.x && box.y < original.y);
	assert(box.width > original.width && box.height > original.height);
	assert.deepEqual(area.box, original);
	assert.deepEqual(printedAreaBox({ ...area, kind: 'image' }), original);
	const edge = printedAreaBox({ ...area, box: { x: 0, y: 0, width: 1, height: 1 } });
	assert.deepEqual(edge, { x: 0, y: 0, width: 1, height: 1 });
});

test('enrollment owns the expected term; canonical templates keep locations and discard legacy values', () => {
	const term = clearanceTermFromEnrollment({ semester: 2, schoolYearStart: 2025 });
	assert.deepEqual(term, { semester: '2', schoolYear: '2025-2026' });
	assert.deepEqual(clearanceTermFromEnrollment({ semester: 3, schoolYearStart: 2026 }), {
		semester: '3',
		schoolYear: '2026-2027'
	});
	const legacy = definition();
	legacy.areas[3].expected = '1st Semester';
	legacy.areas[4].expected = '2024-2025';
	const layout = definitionSchema.parse(legacy);
	assert(!('semester' in layout));
	assert(!('schoolYear' in layout));
	assert.deepEqual(
		layout.areas.map((a) => a.box),
		legacy.areas.map((a) => a.box)
	);
	assert.equal(layout.areas[3].expected, '');
	assert.equal(layout.areas[4].expected, '');
	assert.deepEqual(definitionSchema.parse(layout), layout);
	assert.equal(
		checkAreaText(layout.areas[3], { text: '2nd Semester', confidence: 95 }, term).verdict,
		'pass'
	);
	assert.equal(
		checkAreaText(layout.areas[4], { text: '2026-2027', confidence: 95 }, term).verdict,
		'fail'
	);
});

test('custom layout requires distinct printed text and term evidence; logos are optional with bounded in-page areas', () => {
	assert(definitionSchema.safeParse(definition()).success);
	const withoutLogo = definition();
	withoutLogo.areas = withoutLogo.areas.filter((area) => area.kind !== 'image');
	assert(definitionSchema.safeParse(withoutLogo).success);
	for (const change of [
		(d) => {
			d.areas.splice(0, 1);
		},
		(d) => {
			d.areas[0].expected = '';
		},
		(d) => {
			d.areas[0].box.width = 0;
		},
		(d) => {
			d.areas[0].box.x = 0.9;
		},
		(d) => {
			d.areas[0].box.y = NaN;
		},
		(d) => {
			d.areas[0].label = d.areas[1].label;
		},
		(d) => {
			d.areas[0].id = d.areas[1].id;
		},
		(d) => {
			d.schoolYear = '2025-2027';
		},
		(d) => {
			d.corners[1] = d.corners[0];
		},
		(d) => {
			d.objectKey = 'untrusted';
		}
	]) {
		const input = definition();
		change(input);
		assert(!definitionSchema.safeParse(input).success);
	}
});

test('text follows administrator wording; unreadable text and wrong terms cannot pass', () => {
	const term = definition(),
		area = { ...term.areas[0], expected: 'Different Polytechnic College' };
	assert.equal(
		checkAreaText(area, { text: 'Different Polytechnic College', confidence: 95 }, term).verdict,
		'pass'
	);
	assert.equal(
		checkAreaText(area, { text: 'BULACAN POLYTECHNIC COLLEGE', confidence: 95 }, term).verdict,
		'fail'
	);
	assert.equal(
		checkAreaText(area, { text: area.expected, confidence: 60 }, term).verdict,
		'review'
	);
	for (const text of ['', '1st Semester', '2026-2027']) {
		const kind = text.includes('-') ? 'academicYear' : 'semester';
		assert.notEqual(
			checkAreaText({ ...area, kind }, { text, confidence: 95 }, term).verdict,
			'pass'
		);
	}
});

test('nearby search expands bounded boxes without changing the saved layout', () => {
	const area = { ...definition().areas[0], box: { x: 0.2, y: 0.3, width: 0.4, height: 0.05 } };
	const before = structuredClone(area.box),
		box = printedSearchBox(area);
	assert(Math.abs(box.x - 0.15) < 1e-9);
	assert(Math.abs(box.y - 0.265) < 1e-9);
	assert(Math.abs(box.width - 0.5) < 1e-9);
	assert(Math.abs(box.height - 0.12) < 1e-9);
	assert.deepEqual(area.box, before);
	assert.deepEqual(printedSearchBox({ ...area, kind: 'image' }), before);
	assert.deepEqual(printedSearchBox({ ...area, box: { x: 0, y: 0, width: 1, height: 1 } }), {
		x: 0,
		y: 0,
		width: 1,
		height: 1
	});
});

test('printed phrases may appear among nearby labels; wrong or ambiguous enrollment terms cannot pass', () => {
	const { printedAreaReading } = load('src/lib/clearance/printed.ts');
	const area = { ...definition().areas[0], expected: 'Example Polytechnic College' },
		term = definition();
	const data = {
		text: 'Header\nExample Polytechnic College\nStudent Clearance Form',
		confidence: 40,
		blocks: [
			{
				paragraphs: [
					{
						lines: [
							{
								words: [
									{ text: 'Header', confidence: 20 },
									{ text: 'Example', confidence: 96 },
									{ text: 'Polytechnic', confidence: 95 },
									{ text: 'College', confidence: 94 },
									{ text: 'Footer', confidence: 20 }
								]
							}
						]
					}
				]
			}
		]
	};
	const reading = printedAreaReading(area, data);
	assert.equal(reading.text, 'Example Polytechnic College');
	assert.equal(reading.confidence, 95);
	assert.equal(checkAreaText(area, reading, term).verdict, 'pass');
	assert.equal(checkAreaText(area, { text: data.text, confidence: 95 }, term).verdict, 'pass');
	assert.equal(
		checkAreaText(area, { text: 'Other Polytechnic College', confidence: 95 }, term).verdict,
		'fail'
	);
	assert.notEqual(checkAreaText({ ...area, expected: '---' }, reading, term).verdict, 'pass');
	assert.equal(
		checkAreaText(
			{ ...area, kind: 'semester' },
			{ text: 'Student Clearance Form\n2nd Semester, A.Y. 2025-2026', confidence: 95 },
			term
		).verdict,
		'pass'
	);
	for (const [kind, text] of [
		['semester', '1st Semester'],
		['semester', '1st Semester 2nd Semester'],
		['academicYear', '2026-2027'],
		['academicYear', '2025-2026 or 2026-2027']
	])
		assert.notEqual(
			checkAreaText({ ...area, kind }, { text, confidence: 95 }, term).verdict,
			'pass'
		);
});

test('visual comparison requires corresponding shapes; exposure changes pass, empty and unrelated patches do not', () => {
	const size = 64;
	const logo = Uint8Array.from({ length: size * size }, (_, i) => {
		const x = i % size,
			y = Math.floor(i / size);
		return Math.abs(Math.hypot(x - 32, y - 32) - 20) < 3 || (x > 27 && x < 37 && y > 17 && y < 47)
			? 30
			: 230;
	});
	assert.equal(compareVisual(logo, logo, size, size).verdict, 'pass');
	assert.equal(
		compareVisual(
			logo,
			Uint8Array.from(logo, (v) => v * 0.7 + 20),
			size,
			size
		).verdict,
		'pass'
	);
	assert.equal(
		compareVisual(
			new Uint8Array(size * size).fill(220),
			new Uint8Array(size * size).fill(220),
			size,
			size
		).verdict,
		'review'
	);
	const wrong = Uint8Array.from({ length: size * size }, (_, i) =>
		Math.floor(i / size) % 15 < 4 ? 30 : 230
	);
	assert.notEqual(compareVisual(logo, wrong, size, size).verdict, 'pass');
	assert.notEqual(
		compareVisual(logo, new Uint8Array(size * size).fill(220), size, size).verdict,
		'pass'
	);
	let seed = 12345;
	const noisy = Uint8Array.from(logo, (value) => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed % 100 < 12 ? 260 - value : value;
	});
	const tolerant = compareVisual(logo, noisy, size, size);
	assert(tolerant.score >= 0.65 && tolerant.score < 0.8);
	assert.equal(tolerant.verdict, 'pass', 'A readable shape near 70% must pass the 65% threshold.');
	const faintPaper = Uint8Array.from(logo, (value) => (value < 100 ? 220 : 230));
	assert.notEqual(compareVisual(logo, faintPaper, size, size).verdict, 'pass');
});
