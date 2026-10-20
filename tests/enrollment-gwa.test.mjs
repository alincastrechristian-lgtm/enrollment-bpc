import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync('src/lib/enrollment-grades.ts', 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
});
const exports = {};
new Function('exports', outputText)(exports);
const { formatGrade, getSemesterGwa } = exports;

test('semester GWA weights grades by fractional units and includes failed subjects', () => {
	const subjects = [
		{ grade: 1.25, units: 0.5 },
		{ grade: 5, units: 1.25 }
	];
	assert.equal(getSemesterGwa(subjects), 6.875 / 1.75);
	assert.equal(formatGrade(getSemesterGwa(subjects)), '3.93');
});

test('semester GWA excludes blank and incomplete subjects from grades and units', () => {
	assert.equal(
		getSemesterGwa([
			{ grade: 2.25, units: 3 },
			{ grade: null, units: 6 }
		]),
		2.25
	);
});

test('semester GWA is unavailable without graded units', () => {
	assert.equal(getSemesterGwa([]), null);
	assert.equal(getSemesterGwa([{ grade: null, units: 3 }]), null);
	assert.equal(formatGrade(getSemesterGwa([]), 'Not available'), 'Not available');
});
