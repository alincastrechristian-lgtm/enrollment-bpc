import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync('src/lib/clearance/clearance.ts', 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
});
const core = {};
new Function('exports', outputText)(core);
const expected = {
	name: 'Juan Dela Cruz',
	studentNumber: 'MA-2025-0001',
	course: 'BSIS',
	year: '1',
	section: 'A',
	semester: '2',
	schoolYear: '2025-2026'
};
const reading = (text, confidence = 95) => ({ text, confidence });
const fixture = () => ({
	school: reading('BULACAN POLYTECHNIC COLLEGE'),
	formTitle: reading('Student Clearance Form'),
	semester: reading('2nd Semester,'),
	academicYear: reading('2025-2026'),
	departments: reading(core.DEPARTMENTS.join('\n')),
	name: reading('JUAN DELA CRUZ'),
	studentNumber: reading('MA-2025-0001'),
	classDetails: reading('BSIS 1-A'),
	rows: core.DEPARTMENTS.map((department) => ({
		department,
		cleared: 0.15,
		notCleared: 0,
		signature: 0.05
	}))
});

test('complete readings pass; student number leading zeros and enrollment term remain significant', () => {
	assert.equal(core.overall(core.evaluate(fixture(), expected)), 'pass');
	for (const changed of [
		{ studentNumber: 'MA-2025-001' },
		{ semester: '1' },
		{ schoolYear: '2026-2027' }
	])
		assert.equal(core.overall(core.evaluate(fixture(), { ...expected, ...changed })), 'fail');
});

test('unreadable text, missing expected fields and uncertain OCR never pass', () => {
	for (const field of [
		'name',
		'studentNumber',
		'classDetails',
		'school',
		'formTitle',
		'semester',
		'academicYear'
	]) {
		const scan = fixture();
		scan[field] = reading('', 0);
		assert.notEqual(core.overall(core.evaluate(scan, expected)), 'pass');
	}
	const low = fixture();
	low.name.confidence = 40;
	assert.equal(core.overall(core.evaluate(low, expected)), 'review');
	assert.equal(core.overall(core.evaluate(fixture(), { ...expected, course: '' })), 'review');
});

test('blank, both checked, not cleared and missing signature rows are flagged; faint marks need review', () => {
	for (const changed of [{ cleared: 0 }, { notCleared: 0.1 }, { signature: 0 }]) {
		const scan = fixture();
		Object.assign(scan.rows[0], changed);
		assert.equal(core.overall(core.evaluate(scan, expected)), 'fail');
	}
	const faint = fixture();
	faint.rows[0].signature = 0.005;
	assert.equal(core.overall(core.evaluate(faint, expected)), 'review');
});

test('wrong template cannot pass, even with otherwise matching student and mark readings', () => {
	const scan = fixture();
	scan.school = reading('OTHER SCHOOL');
	assert.equal(core.overall(core.evaluate(scan, expected)), 'fail');
	assert.equal(
		core.evaluate(scan, expected).find((check) => check.label === 'SG Adviser').verdict,
		'review'
	);
});

test('template requires each department once in order and consecutive academic years', () => {
	for (const labels of [
		'SG Adviser\nPTCA\nResearch\nProgram Head',
		'PTCA\nSG Adviser\nAdviser\nResearch\nProgram Head'
	]) {
		const scan = fixture();
		scan.departments = reading(labels);
		assert.equal(core.overall(core.evaluate(scan, expected)), 'review');
	}
	const scan = fixture();
	scan.academicYear.text = '2025-2027';
	assert.equal(core.overall(core.evaluate(scan, { ...expected, schoolYear: '2025-2027' })), 'fail');
});

test('each printed field uses its own confidence without borrowing confidence from another heading', () => {
	const scan = fixture();
	scan.academicYear.confidence = 35;
	const checks = core.evaluate(scan, expected);
	assert.equal(checks.find((check) => check.label === 'Academic year').verdict, 'review');
	for (const label of ['School name', 'Form title', 'Semester'])
		assert.equal(checks.find((check) => check.label === label).verdict, 'pass');
	assert.equal(core.overall(checks), 'review');
	const badSchool = fixture();
	badSchool.school.text = 'NOT BULACAN POLYTECHNIC COLLEGE';
	assert.equal(
		core.evaluate(badSchool, expected).find((check) => check.label === 'School name').verdict,
		'fail'
	);
});

test('unreadable or invalid semester is never inferred from expected value', () => {
	for (const text of ['', '3rd Semester', 'Semester']) {
		const scan = fixture();
		scan.semester = reading(text);
		assert.equal(
			core.evaluate(scan, expected).find((check) => check.label === 'Semester').verdict,
			'review'
		);
	}
});

test('corner validation rejects crossed, tiny and out-of-bounds quadrilaterals; homography maps all corners', () => {
	assert.equal(core.validCorners(core.REFERENCE_CORNERS), true);
	assert.equal(
		core.validCorners([
			core.UNIT_CORNERS[0],
			core.UNIT_CORNERS[2],
			core.UNIT_CORNERS[1],
			core.UNIT_CORNERS[3]
		]),
		false
	);
	assert.equal(
		core.validCorners(core.UNIT_CORNERS.map(({ x, y }) => ({ x: x * 0.01, y: y * 0.01 }))),
		false
	);
	assert.equal(core.validCorners([{ x: -1, y: 0 }, ...core.UNIT_CORNERS.slice(1)]), false);
	const matrix = core.homography(core.UNIT_CORNERS, core.REFERENCE_CORNERS);
	for (let i = 0; i < 4; i++) {
		const result = core.project(matrix, core.UNIT_CORNERS[i]);
		assert.ok(Math.abs(result.x - core.REFERENCE_CORNERS[i].x) < 1e-8);
		assert.ok(Math.abs(result.y - core.REFERENCE_CORNERS[i].y) < 1e-8);
	}
});

test('blank template ink is excluded; only additional ink counts', () => {
	const blank = new Uint8Array(400),
		actual = new Uint8Array(400);
	blank[5 * 20 + 5] = 1;
	actual[5 * 20 + 5] = 1;
	const box = { x: 0, y: 0, width: 20, height: 20 };
	assert.equal(core.addedInk(actual, blank, 20, 20, box), 0);
	actual[15 * 20 + 15] = 1;
	assert.ok(core.addedInk(actual, blank, 20, 20, box) > 0);
});
