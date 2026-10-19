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
const def = load('src/lib/clearance/definition.ts', { './clearance': core });
const { suggestPersonalFields } = load('src/lib/clearance/personal-suggestions.ts', {
	'./definition': def
});
const width = 800,
	height = 600;
const word = (text, x0, y0, x1, y1) => ({ text, bbox: { x0, y0, x1, y1 } });
const line = (text, words) => ({
	text,
	words,
	confidence: 95,
	bbox: {
		x0: Math.min(...words.map((w) => w.bbox.x0)),
		y0: Math.min(...words.map((w) => w.bbox.y0)),
		x1: Math.max(...words.map((w) => w.bbox.x1)),
		y1: Math.max(...words.map((w) => w.bbox.y1))
	}
});
const rule = (ink, x0, x1, y) => {
	for (let x = x0; x <= x1; x++) ink[y * width + x] = 1;
};

test('personal schema accepts legacy absence, validates boxes and disallows conflicting field ownership or student values', () => {
	const area = (field) => ({
		id: crypto.randomUUID(),
		field,
		box: { x: 0.1, y: 0.2, width: 0.4, height: 0.05 }
	});
	assert(def.personalFieldsSchema.safeParse([]).success);
	assert(
		def.personalFieldsSchema.safeParse(
			['studentName', 'studentNumber', 'course', 'year', 'section'].map(area)
		).success
	);
	assert(
		def.personalFieldsSchema.safeParse(
			['studentName', 'studentNumber', 'courseYearSection'].map(area)
		).success
	);
	assert(!def.personalFieldsSchema.safeParse(['courseYearSection', 'course'].map(area)).success);
	assert(!def.personalFieldsSchema.safeParse(['studentName', 'studentName'].map(area)).success);
	assert(
		!def.personalFieldsSchema.safeParse([{ ...area('studentName'), value: 'Actual student name' }])
			.success
	);
	assert(
		!def.personalFieldsSchema.safeParse([
			{ ...area('studentNumber'), box: { x: 0.99, y: 0.1, width: 0.3, height: 0.2 } }
		]).success
	);
});

test('detects writing space above name caption, after number label, and separate course/year/section inputs', () => {
	const ink = new Uint8Array(width * height);
	rule(ink, 20, 350, 230);
	rule(ink, 240, 490, 315);
	rule(ink, 190, 320, 415);
	rule(ink, 430, 510, 415);
	rule(ink, 640, 760, 415);
	const lines = [
		line("Student's Name and Signature", [
			word("Student's", 80, 250, 140, 268),
			word('Name', 145, 250, 190, 268),
			word('and', 195, 250, 220, 268),
			word('Signature', 225, 250, 320, 268)
		]),
		line('Student Number: MA-', [
			word('Student', 100, 300, 150, 320),
			word('Number:', 155, 300, 200, 320),
			word('MA-', 210, 300, 245, 320)
		]),
		line('Course: Year: Section:', [
			word('Course:', 80, 400, 160, 420),
			word('Year:', 350, 400, 400, 420),
			word('Section:', 550, 400, 620, 420)
		]),
		line('Academic Year 2025-2026', [
			word('Academic', 100, 100, 200, 120),
			word('Year', 205, 100, 250, 120),
			word('2025-2026', 255, 100, 400, 120)
		]),
		line('Program Head', [word('Program', 100, 150, 200, 170), word('Head', 205, 150, 260, 170)])
	];
	const result = suggestPersonalFields(lines, width, height, ink);
	assert.equal(result.fields.length, 5);
	assert(def.personalFieldsSchema.safeParse(result.fields).success);
	const name = result.fields.find((f) => f.field === 'studentName').box;
	assert(name.y + name.height < 250 / height);
	assert(name.x <= 20 / width);
	const number = result.fields.find((f) => f.field === 'studentNumber').box;
	assert(number.x > 200 / width && number.x < 210 / width);
	assert(number.x + number.width < 0.65);
	const course = result.fields.find((f) => f.field === 'course').box;
	assert(course.x + course.width < 350 / width);
	const year = result.fields.find((f) => f.field === 'year').box;
	assert(year.x > 400 / width && year.x + year.width < 550 / width);
});

test('one shared course/year/section label yields a combined region instead of invented splits', () => {
	const ink = new Uint8Array(width * height);
	rule(ink, 300, 600, 415);
	const result = suggestPersonalFields(
		[
			line('Course, Yr., & Sec.:', [
				word('Course,', 80, 400, 150, 420),
				word('Yr.,', 160, 400, 185, 420),
				word('&', 195, 400, 210, 420),
				word('Sec.:', 220, 400, 250, 420)
			])
		],
		width,
		height,
		ink
	);
	assert.equal(result.fields.length, 1);
	assert.equal(result.fields[0].field, 'courseYearSection');
	assert(result.hints.some((h) => h.includes('combined')));
	assert(!result.hints.some((h) => /Year level was not located/.test(h)));
	assert.equal(suggestPersonalFields([], width, height, ink).fields.length, 0);
});
