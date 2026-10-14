import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, rmdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadModule(filename, dependencies = {}) {
	const source = readFileSync(new URL('../' + filename, import.meta.url), 'utf8');
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => dependencies[id] ?? require(id), exports);
	return exports;
}
const { Role } = loadModule('src/lib/Roles.ts');
const schema = loadModule('src/lib/schema.ts', { '#lib/Roles.js': { Role } });
const { seedAcademicData } = loadModule('src/lib/server/db/seed-data.ts', {
	'../../schema.ts': schema
});

function fixture(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	sqlite.pragma('foreign_keys = ON');
	return { sqlite, db };
}
function academicRows(db) {
	return [
		schema.program,
		schema.subject,
		schema.curriculum,
		schema.curriculumSubject,
		schema.applicant
	].map((table) => db.select().from(table).all());
}

test('seed creates linked catalog data, valid draft curricula and applicants without students', (t) => {
	const { db, sqlite } = fixture(t);
	assert.deepEqual(seedAcademicData(db), {
		programs: 3,
		subjects: 20,
		curricula: 3,
		applicants: 20
	});
	const curricula = db.select().from(schema.curriculum).all();
	const entries = db.select().from(schema.curriculumSubject).all();
	assert.equal(entries.length, 33);
	for (const entry of entries) {
		const curriculum = curricula.find((record) => record.id === entry.curriculumId);
		assert.equal(curriculum.publishedAt, null);
		assert.ok(entry.yearLevel >= 1 && entry.yearLevel <= curriculum.yearLevels);
		assert.ok(entry.semester >= 1 && entry.semester <= curriculum.semesters);
		assert.ok(entry.units > 0);
	}
	const applicants = db.select().from(schema.applicant).all();
	const programs = db.select().from(schema.program).all();
	assert.ok(
		applicants.every(
			(record) => !record.userId && programs.some((program) => program.code === record.programCode)
		)
	);
	assert.ok(applicants.some((record) => record.hasPicture));
	assert.ok(applicants.some((record) => !record.hasBirthCertificate));
	assert.equal(db.select().from(schema.user).all().length, 0);
	assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM student').get().count, 0);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
	assert.deepEqual(seedAcademicData(db), { programs: 0, subjects: 0, curricula: 0, applicants: 0 });
});

test('seed reuses existing catalog IDs and preserves edited and published records on reruns', (t) => {
	const { db, sqlite } = fixture(t);
	db.insert(schema.program)
		.values({ id: 'existing-program', code: 'BSIS', name: 'Custom program' })
		.run();
	db.insert(schema.subject)
		.values({ id: 'existing-subject', code: 'IS101', name: 'Custom subject' })
		.run();
	assert.deepEqual(seedAcademicData(db), {
		programs: 2,
		subjects: 19,
		curricula: 3,
		applicants: 20
	});
	assert.ok(
		db
			.select()
			.from(schema.curriculum)
			.all()
			.some((row) => row.programCode === 'BSIS')
	);
	assert.ok(
		db
			.select()
			.from(schema.curriculumSubject)
			.all()
			.some((row) => row.subjectId === 'existing-subject' && row.subjectName === 'Custom subject')
	);
	sqlite.exec(
		"UPDATE curriculum SET published_at = 1234; DELETE FROM curriculum_subject WHERE subject_id = 'existing-subject'; UPDATE applicant SET name = 'Edited applicant', has_picture = 1;"
	);
	const before = academicRows(db);
	assert.deepEqual(seedAcademicData(db), { programs: 0, subjects: 0, curricula: 0, applicants: 0 });
	assert.deepEqual(academicRows(db), before);
});

test('seed rolls back academic inserts when an applicant insert fails', (t) => {
	const { db, sqlite } = fixture(t);
	sqlite.exec(
		"CREATE TRIGGER reject_seed BEFORE INSERT ON applicant BEGIN SELECT RAISE(ABORT, 'test failure'); END;"
	);
	assert.throws(() => seedAcademicData(db), /test failure/);
	assert.ok(academicRows(db).every((rows) => rows.length === 0));
});

test('seed CLI creates the configured admin only and can run twice', () => {
	const directory = mkdtempSync(path.join(tmpdir(), 'enrollment-seed-test-'));
	const filename = path.join(directory, 'seed.sqlite');
	let sqlite;
	try {
		sqlite = new Database(filename);
		migrate(drizzle(sqlite, { schema }), { migrationsFolder: 'drizzle' });
		sqlite.close();
		sqlite = undefined;
		const env = {
			...process.env,
			DATABASE_URL: filename,
			ORIGIN: 'http://localhost:5173',
			BETTER_AUTH_SECRET: 'seed-test-secret-for-local-testing-only',
			INITIAL_ADMIN_EMAIL: ' Seed.Admin@example.com ',
			INITIAL_ADMIN_PASSWORD: 'SeedTestPassword123'
		};
		for (let run = 0; run < 2; run++) {
			const output = execFileSync(
				process.execPath,
				[require.resolve('tsx/cli'), path.resolve('src/lib/server/db/seed.ts')],
				{ env, encoding: 'utf8', timeout: 30000 }
			);
			assert.match(output, /No students created/);
			if (run === 1)
				assert.match(output, /Added 0 programs, 0 subjects, 0 curricula, and 0 applicants/);
		}
		sqlite = new Database(filename, { readonly: true });
		const users = sqlite.prepare('SELECT email, role, setup_complete FROM user').all();
		assert.deepEqual(users, [
			{ email: 'seed.admin@example.com', role: 'admin', setup_complete: 1 }
		]);
		assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM student').get().count, 0);
		assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM account').get().count, 1);
		assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM applicant').get().count, 20);
		assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
	} finally {
		sqlite?.close();
		for (const suffix of ['', '-wal', '-shm', '-journal'])
			rmSync(filename + suffix, { force: true });
		rmdirSync(directory);
	}
});
