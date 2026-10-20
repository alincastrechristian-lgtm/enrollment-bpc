import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file, deps = {}) {
	const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => deps[id] ?? require(id), exports);
	return exports;
}
const csv = load('src/lib/student-csv.ts', {
	'./students': load('src/lib/students.ts', {
		'./person-name': load('src/lib/person-name.ts'),
		'./student-demographics': load('src/lib/student-demographics.ts')
	})
});
const header = 'first_name,last_name,email,birth_date,sex,contact_number,address\n';
const row = 'Ana,Santos,ANA@example.com,2000-01-01,female,09171234567,"Malolos, Bulacan"';
test('template includes all required columns and quoted fields preserve commas, newlines and escaped quotes', () => {
	assert.deepEqual(csv.validateStudentCsv(csv.STUDENT_CSV_TEMPLATE).issues, []);
	const result = csv.validateStudentCsv(
		'\uFEFF' +
			header +
			row.replace('"Malolos, Bulacan"', '"House ""A"",\nMalolos, Bulacan"') +
			'\r\n'
	);
	assert.deepEqual(result.issues, []);
	assert.equal(result.rows[0].student.address, 'House "A",\nMalolos, Bulacan');
	assert.equal(result.rows[0].student.email, 'ana@example.com');
	assert.equal(result.rows[0].student.middleName, '');
	assert.equal(result.rows[0].student.contactNumber, '09171234567');
});
test('missing required columns or values, unknown columns, duplicates and invalid student fields fail validation', () => {
	for (const field of [
		'first_name',
		'last_name',
		'email',
		'birth_date',
		'sex',
		'contact_number',
		'address'
	]) {
		const columns = header.trim().split(','),
			index = columns.indexOf(field);
		const missingHeader = columns.filter((_, i) => i !== index).join(',') + '\n';
		assert(
			csv.validateStudentCsv(missingHeader).issues.some((issue) => issue.message.includes(field)),
			field
		);
	}
	for (const text of [
		header + row + '\n' + row.toLowerCase(),
		header.replace('first_name', 'email') + row,
		header.trim() + ',password\n' + row + ',hidden',
		header + row.replace('2000-01-01', '2025-01-01'),
		header + row.replace('09171234567', '9171234567'),
		header + row.replace('female', 'unknown'),
		header + row.replace('Ana,Santos', ',Santos'),
		header + row.replace('ANA@example.com', 'not-email')
	])
		assert(csv.validateStudentCsv(text).issues.length, text);
});
test('malformed quoting, inconsistent columns, empty files, oversized UTF-8 and excessive rows are rejected', () => {
	for (const text of [
		'',
		header,
		header + row + ',extra',
		header + row.slice(0, -1),
		header + row + 'x',
		header + row.replace('Ana', 'An"a'),
		'é'.repeat(150000),
		header + Array.from({ length: 101 }, () => row).join('\n')
	])
		assert(csv.validateStudentCsv(text).issues.length);
	const hundred =
		header +
		Array.from({ length: 100 }, (_, i) =>
			row.replace('ANA@example.com', `student${i}@example.com`)
		).join('\n');
	assert.equal(csv.validateStudentCsv(hundred + '\n\n').rows.length, 100);
	assert.deepEqual(csv.validateStudentCsv(hundred).issues, []);
});
