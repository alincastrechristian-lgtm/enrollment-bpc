import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const { outputText } = ts.transpileModule(
	readFileSync('src/lib/clearance/suggestions.ts', 'utf8'),
	{ compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
);
const exports = {};
new Function('exports', outputText)(exports);
const { suggestPrintedAreas, suggestGraphicAreas } = exports;
const line = (text, x = 500, y = 200, confidence = 95) => ({
	text,
	confidence,
	bbox: { x0: x, y0: y, x1: x + 400, y1: y + 25 },
	words: []
});

test('suggestions follow wording and actual positions, with editable text and separate term areas', () => {
	const term = line('2nd Semester, A.Y. 2025-2026', 500, 400);
	term.words = [
		{ text: '2nd', bbox: { x0: 500, y0: 400, x1: 540, y1: 425 } },
		{ text: '2025-2026', bbox: { x0: 720, y0: 400, x1: 900, y1: 425 } }
	];
	const result = suggestPrintedAreas(
		[
			line('Example Polytechnic College', 500, 200),
			line('Student Clearance Form', 500, 300),
			term,
			line('Department Offices', 100, 500)
		],
		1000,
		820
	);
	assert.equal(result.semester, '2');
	assert.equal(result.schoolYear, '2025-2026');
	assert.equal(result.areas.filter((a) => a.kind === 'text').length, 3);
	const school = result.areas.find((a) => a.label === 'School name');
	assert.equal(school.expected, 'Example Polytechnic College');
	assert(school.box.x > 0.48);
	const year = result.areas.find((a) => a.kind === 'academicYear');
	assert(year.box.x > 0.7, 'Year crop must not include semester digit.');
	assert.equal(new Set(result.areas.map((a) => a.id)).size, result.areas.length);
	for (const a of result.areas) {
		assert(
			a.box.x >= 0 &&
				a.box.y >= 0 &&
				a.box.x + a.box.width <= 1.000001 &&
				a.box.y + a.box.height <= 1.000001
		);
	}
});

test('uncertain terms stay uncertain; blank and variable-field labels do not become permanent anchors', () => {
	const result = suggestPrintedAreas(
		[
			line('2nd Semesler', 100, 200, 55),
			line('2025-2027', 100, 250),
			...[
				'Student Number: MA-',
				'Student Name and Signature',
				'Contact Number',
				'Course, Yr. & Sec.',
				'[cleared [Not Cleared',
				'Date'
			].map((text, i) => line(text, 100, 300 + i * 35))
		],
		1000,
		820
	);
	assert.equal(result.semester, undefined);
	assert.equal(result.schoolYear, undefined);
	assert.equal(result.areas.length, 2);
	assert(result.hints.some((h) => h.includes('uncertain')));
	assert.equal(suggestPrintedAreas([], 1000, 820).areas.length, 0);
	assert.equal(
		suggestPrintedAreas(
			[
				line('Low quality text', 100, 200, 10),
				{ ...line('Invalid position'), bbox: { x0: NaN, y0: 0, x1: 10, y1: 20 } }
			],
			1000,
			820
		).areas.length,
		0
	);
});

test('text suggestion count and duplicate labels stay within the saved definition bounds', () => {
	const result = suggestPrintedAreas(
		Array.from({ length: 30 }, (_, i) => line('Department Label', 100, 10 + i * 25)),
		1000,
		820
	);
	assert.equal(result.areas.length, 17);
	assert.equal(new Set(result.areas.map((a) => a.label)).size, 17);
});

test('graphic candidates locate compact ink anywhere and exclude text, page borders and blank scans', () => {
	const width = 400,
		height = 320,
		ink = new Uint8Array(width * height);
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			if (
				Math.abs(Math.hypot(x - 310, y - 210) - 28) < 2 ||
				(x > 100 && x < 150 && y > 80 && y < 110) ||
				y === 5 ||
				x === 5
			)
				ink[y * width + x] = 1;
		}
	const boxes = suggestGraphicAreas(ink, width, height, [
		{ x: 0.24, y: 0.23, width: 0.15, height: 0.14 }
	]);
	assert.equal(boxes.length, 1);
	assert(boxes[0].x > 0.65 && boxes[0].y > 0.5);
	assert.deepEqual(suggestGraphicAreas(new Uint8Array(width * height), width, height, []), []);
	assert.deepEqual(suggestGraphicAreas(new Uint8Array(1), width, height, []), []);
});

test('empty checkbox outlines are excluded while circular seals and detailed square graphics remain', () => {
	const width = 400,
		height = 320,
		ink = new Uint8Array(width * height);
	function frame(left, top, size) {
		for (let p = 0; p <= size; p++) {
			ink[top * width + left + p] = 1;
			ink[(top + size) * width + left + p] = 1;
			ink[(top + p) * width + left] = 1;
			ink[(top + p) * width + left + size] = 1;
		}
	}
	for (const [x, y, size] of [
		[40, 40, 18],
		[100, 80, 24],
		[160, 120, 32]
	])
		frame(x, y, size);
	frame(260, 60, 42);
	for (let p = 0; p <= 42; p++) ink[(60 + p) * width + 260 + p] = 1;
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++)
			if (Math.abs(Math.hypot(x - 80, y - 240) - 12) < 1.5) ink[y * width + x] = 1;
	const boxes = suggestGraphicAreas(ink, width, height, []);
	assert.equal(boxes.length, 2);
	const contains = (box, x, y) =>
		box.x * width <= x &&
		(box.x + box.width) * width >= x &&
		box.y * height <= y &&
		(box.y + box.height) * height >= y;
	assert(
		boxes.some((box) => contains(box, 281, 81)),
		'Detailed square logo retained.'
	);
	assert(
		boxes.some((box) => contains(box, 80, 240)),
		'Small circular seal retained.'
	);
	for (const [x, y] of [
		[49, 49],
		[112, 92],
		[176, 136]
	])
		assert(!boxes.some((box) => contains(box, x, y)), 'Checkbox excluded.');
});
