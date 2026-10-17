import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import ts from 'typescript';
import { migrationConfigThrough } from './migration-config.mjs';

const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
	const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => dependencies[id] ?? require(id), exports);
	return exports;
}
const demographics = load('src/lib/student-demographics.ts');
const { createStudentSchema } = load('src/lib/students.ts', {
	'./student-demographics': demographics
});
const personal = {
	name: 'Ana Muñoz',
	email: 'ana@example.com',
	address: 'Malolos',
	contactNumber: '09123456789'
};

test('student demographics accept optional, null, valid dates and sexes; reject impossible/future dates', () => {
	assert.deepEqual(createStudentSchema.parse(personal), {
		...personal,
		birthDate: null,
		sex: null
	});
	assert.equal(
		createStudentSchema.parse({ ...personal, birthDate: null, sex: null }).birthDate,
		null
	);
	for (const sex of ['female', 'male']) {
		const parsed = createStudentSchema.parse({ ...personal, birthDate: '2000-02-29', sex });
		assert.equal(parsed.birthDate, '2000-02-29');
		assert.equal(parsed.sex, sex);
	}
	for (const birthDate of [
		'2001-02-29',
		'2000-02-30',
		'2000-13-01',
		'2000-00-10',
		'2000-01-00',
		'02/29/2000',
		'',
		'2999-01-01'
	])
		assert.equal(
			createStudentSchema.safeParse({ ...personal, birthDate }).success,
			false,
			birthDate
		);
	for (const sex of ['', 'other', 'Female', 1])
		assert.equal(createStudentSchema.safeParse({ ...personal, sex }).success, false, String(sex));
	assert.equal(
		createStudentSchema.safeParse({ ...personal, birthDate: demographics.todayInManila() }).success,
		true
	);
});

test('birth dates keep calendar day across server timezones and missing demographics remain explicit', () => {
	const original = process.env.TZ;
	try {
		for (const timezone of ['Pacific/Honolulu', 'Asia/Manila', 'Pacific/Kiritimati']) {
			process.env.TZ = timezone;
			assert.equal(demographics.formatBirthDate('2000-02-29'), 'Feb 29, 2000');
			assert.match(demographics.todayInManila(), /^\d{4}-\d{2}-\d{2}$/);
		}
	} finally {
		if (original === undefined) delete process.env.TZ;
		else process.env.TZ = original;
	}
	for (const absent of [null, undefined]) {
		assert.equal(demographics.formatBirthDate(absent), 'Not recorded');
		assert.equal(demographics.formatStudentSex(absent), 'Not recorded');
	}
	assert.equal(demographics.formatStudentSex('female'), 'Female');
	assert.equal(demographics.formatStudentSex('male'), 'Male');
});

test('demographic migration preserves student/enrollment records and rollback refuses populated details', (t) => {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite);
	migrate(db, migrationConfigThrough(t, 30));
	sqlite.pragma('foreign_keys=ON');
	sqlite.exec(`
		INSERT INTO user(id,name,email,role) VALUES('a','Legacy student','legacy@example.com','student');
		INSERT INTO student(id,user_id,address,contact_number) VALUES('MA-001','a','Legacy address','09123456789');
		INSERT INTO program(id,code,name) VALUES('p','BSIS','Information Systems');
		INSERT INTO curriculum(id,program_code,name) VALUES('c','BSIS','Original curriculum');
		INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level) VALUES('e','MA-001','c','A',2026,1,1);
		UPDATE student SET enrollment_id='e' WHERE id='MA-001';
		INSERT INTO subject(id,code,name) VALUES('s','IS101','Original subject');
		INSERT INTO enrollment_subject(id,enrollment_id,subject_id,source,subject_code,subject_name,units,grade) VALUES('es','e','s','extra','IS101','Snapshot subject',2.5,1.25);
	`);
	const before = {
		student: sqlite.prepare('SELECT * FROM student').get(),
		enrollment: sqlite.prepare('SELECT * FROM enrollment').get(),
		subject: sqlite.prepare('SELECT * FROM enrollment_subject').get()
	};
	migrate(db, migrationConfigThrough(t, 31));
	assert.deepEqual(sqlite.prepare('SELECT * FROM student').get(), {
		...before.student,
		birth_date: null,
		sex: null
	});
	assert.deepEqual(sqlite.prepare('SELECT * FROM enrollment').get(), before.enrollment);
	assert.deepEqual(sqlite.prepare('SELECT * FROM enrollment_subject').get(), before.subject);
	const rollback = readFileSync('drizzle/rollback/0031_student_demographics.sql', 'utf8');
	for (const [birthDate, sex] of [
		['2000-02-29', null],
		[null, 'female']
	]) {
		sqlite.prepare('UPDATE student SET birth_date=?,sex=?').run(birthDate, sex);
		assert.throws(() => sqlite.exec(rollback), /CHECK constraint failed/);
		if (sqlite.inTransaction) sqlite.exec('ROLLBACK');
		assert.equal(sqlite.prepare('SELECT birth_date FROM student').get().birth_date, birthDate);
		assert.equal(sqlite.prepare('SELECT sex FROM student').get().sex, sex);
	}
	sqlite.exec('UPDATE student SET birth_date=NULL,sex=NULL');
	sqlite.exec(rollback);
	assert.deepEqual(sqlite.prepare('SELECT * FROM student').get(), before.student);
	assert.deepEqual(sqlite.prepare('SELECT * FROM enrollment').get(), before.enrollment);
	assert.deepEqual(sqlite.prepare('SELECT * FROM enrollment_subject').get(), before.subject);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
	assert.equal(
		sqlite.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get().count,
		31
	);
});
