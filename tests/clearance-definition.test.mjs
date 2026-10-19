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
const { definitionSchema, checkAreaText, compareVisual, templateTermIssue, printedAreaBox } = load(
	'src/lib/clearance/definition.ts',
	{
		'./clearance': core
	}
);
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

test('template coverage compares the current enrollment semester and school year', () => {
	const enrollment = { semester: 2, schoolYearStart: 2025 };
	assert.equal(templateTermIssue(definition(), enrollment), null);
	for (const template of [
		{ ...definition(), semester: '1' },
		{ ...definition(), schoolYear: '2026-2027' },
		{ ...definition(), semester: '1', schoolYear: '2026-2027' }
	]) {
		const issue = templateTermIssue(template, enrollment);
		assert.match(issue, /requires Semester 2, SY 2025-2026/);
		assert(issue.includes(`template is Semester ${template.semester}, SY ${template.schoolYear}`));
	}
});

test('custom layout requires distinct text, visual and term evidence with bounded in-page areas', () => {
	assert(definitionSchema.safeParse(definition()).success);
	for (const change of [
		(d) => {
			d.areas.splice(2, 1);
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
});
