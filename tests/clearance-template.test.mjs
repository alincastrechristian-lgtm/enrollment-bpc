import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(file, dependencies = {}) {
	const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => dependencies[id], exports);
	return exports;
}
const core = load('src/lib/clearance/clearance.ts');
const template = load('src/lib/clearance/template.ts', { './clearance': core });
const term = { semester: '2', schoolYear: '2025-2026' };
const reading = (text, confidence = 95) => ({ text, confidence });
const printed = () => ({
	school: reading('BULACAN POLYTECHNIC COLLEGE'),
	formTitle: reading('Student Clearance Form'),
	departments: reading(core.DEPARTMENTS.join('\n')),
	semester: reading('2nd Semester,'),
	academicYear: reading('2025-2026')
});
const passingLayout = () =>
	template.LAYOUT_AREAS.map(({ label }) => ({ label, verdict: 'pass', detail: 'Fixture' }));
const result = (
	reference = printed(),
	uploaded = printed(),
	layout = passingLayout(),
	required = term
) => template.evaluateTemplate(reference, uploaded, layout, required);

test('matching printed form and required term unlock gate independently of handwriting', () => {
	assert.equal(result().verdict, 'pass');
	assert.equal(result().checks.length, 14);
});

test('wrong school/title or semester/year in either image blocks handwriting', () => {
	for (const field of ['school', 'formTitle', 'semester', 'academicYear']) {
		for (const side of ['reference', 'upload']) {
			const reference = printed(),
				upload = printed();
			(side === 'reference' ? reference : upload)[field] = reading(
				{
					school: 'OTHER SCHOOL',
					formTitle: 'Application Form',
					semester: '1st Semester',
					academicYear: '2026-2027'
				}[field]
			);
			assert.equal(result(reference, upload).verdict, 'fail', `${side}: ${field}`);
		}
	}
	const invalid = printed();
	invalid.academicYear = reading('2025-2027');
	assert.equal(
		result(printed(), invalid, passingLayout(), { ...term, schoolYear: '2025-2027' }).verdict,
		'fail'
	);
});

test('uncertain OCR, missing labels and absent visual evidence cannot pass gate', () => {
	for (const field of Object.keys(printed())) {
		const unreadable = printed();
		unreadable[field] = reading('', 0);
		assert.notEqual(result(printed(), unreadable).verdict, 'pass');
		const uncertain = printed();
		uncertain[field].confidence = 40;
		assert.equal(result(uncertain).verdict, 'review');
	}
	const reordered = printed();
	reordered.departments.text = [...core.DEPARTMENTS].reverse().join('\n');
	assert.equal(result(printed(), reordered).verdict, 'review');
	assert.equal(result(printed(), printed(), []).verdict, 'review');
	assert.notEqual(
		result(printed(), printed(), passingLayout(), { semester: '', schoolYear: '' }).verdict,
		'pass'
	);
});

function inkFixture() {
	const mask = new Uint8Array(core.WIDTH * core.HEIGHT);
	for (const { boxes } of template.LAYOUT_AREAS) {
		for (const { outer } of boxes) {
			// Sparse strokes at fixed printed positions; checkbox interiors remain empty.
			for (let y = outer.y + 1; y < outer.y + 4; y++)
				for (let x = outer.x + 1; x < outer.x + outer.width - 1; x++) mask[y * core.WIDTH + x] = 1;
		}
	}
	return mask;
}

test('layout excludes student details, signatures and checkbox interiors', () => {
	const reference = inkFixture();
	const actual = reference.slice();
	for (let y = 550; y < 810; y++) for (let x = 25; x < 750; x++) actual[y * core.WIDTH + x] = 1;
	for (const row of core.ROW_REGIONS) {
		for (const box of [row.signature, row.cleared, row.notCleared])
			for (let y = box.y; y < box.y + box.height; y++)
				for (let x = box.x; x < box.x + box.width; x++) actual[y * core.WIDTH + x] = 1;
	}
	assert(
		template.comparePrintedLayout(actual, reference).every((check) => check.verdict === 'pass')
	);
});

test('blank images, missing frames and displaced headers do not match visual structure', () => {
	const reference = inkFixture();
	const blank = new Uint8Array(reference.length);
	assert(template.comparePrintedLayout(blank, blank).every((check) => check.verdict === 'review'));
	const displaced = reference.slice();
	const box = core.PRINTED_REGIONS.school;
	for (let y = box.y; y < box.y + box.height; y++)
		for (let x = box.x; x < box.x + box.width; x++) displaced[y * core.WIDTH + x] = 0;
	for (let y = box.y + 22; y < box.y + 25; y++)
		for (let x = box.x + 1; x < box.x + box.width - 1; x++) displaced[y * core.WIDTH + x] = 1;
	const shifted = template.comparePrintedLayout(displaced, reference);
	assert.equal(shifted[0].verdict, 'fail');
	assert.equal(result(printed(), printed(), shifted).verdict, 'fail');
	const missing = reference.slice();
	const frame = template.LAYOUT_AREAS[3].boxes.at(-1).outer;
	for (let y = frame.y; y < frame.y + frame.height; y++)
		for (let x = frame.x; x < frame.x + frame.width; x++) missing[y * core.WIDTH + x] = 0;
	assert.equal(template.comparePrintedLayout(missing, reference)[3].verdict, 'review');
	assert.throws(
		() => template.comparePrintedLayout(new Uint8Array(10), reference),
		/Align both images/
	);
});
