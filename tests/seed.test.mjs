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
import { migrationConfigThrough } from './migration-config.mjs';

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
const email = loadModule('src/lib/email.ts');
const schema = loadModule('src/lib/schema.ts', {
	'#lib/Roles.js': { Role },
	'./email': email
});
const { seedAcademicData } = loadModule('src/lib/server/db/seed-data.ts', {
	'../../schema.ts': schema,
	'#lib/Roles.js': { Role }
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
		schema.studentData
	].map((table) => db.select().from(table).all());
}

test('seeded migration preserves existing settings, retries safely, and can roll back', (t) => {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	migrate(drizzle(sqlite), migrationConfigThrough(t, 19));
	sqlite.exec("INSERT INTO system_settings (id, sender_name) VALUES (1, 'Existing school')");
	const before = sqlite.prepare('SELECT * FROM system_settings WHERE id = 1').get();
	const config = migrationConfigThrough(t, 20);
	migrate(drizzle(sqlite), config);
	assert.deepEqual(sqlite.prepare('SELECT * FROM system_settings WHERE id = 1').get(), {
		...before,
		seeded: 0
	});
	sqlite.exec('UPDATE system_settings SET seeded = 1 WHERE id = 1');
	migrate(drizzle(sqlite), config);
	assert.equal(sqlite.prepare('SELECT seeded FROM system_settings WHERE id = 1').get().seeded, 1);
	sqlite.exec(readFileSync('drizzle/rollback/0020_seeded_flag.sql', 'utf8'));
	assert.deepEqual(sqlite.prepare('SELECT * FROM system_settings WHERE id = 1').get(), before);
	migrate(drizzle(sqlite), config);
	assert.deepEqual(sqlite.prepare('SELECT * FROM system_settings WHERE id = 1').get(), {
		...before,
		seeded: 0
	});
});

test('seed creates linked catalog data, valid draft curricula and students without enrollments', (t) => {
	const { db, sqlite } = fixture(t);
	assert.deepEqual(seedAcademicData(db), {
		programs: 3,
		subjects: 20,
		curricula: 3,
		students: 20
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
	const students = db.select().from(schema.studentData).all();
	assert.equal(students.length, 20);
	assert.ok(
		students.every(
			(record) => record.address && record.contactNumber && !record.currentEnrollmentId
		)
	);
	assert.equal(db.select().from(schema.user).all().length, 20);
	assert.equal(sqlite.prepare('SELECT count(*) n FROM enrollment').get().n, 0);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
	assert.deepEqual(seedAcademicData(db), { programs: 0, subjects: 0, curricula: 0, students: 0 });
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
		students: 20
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
		"UPDATE curriculum SET published_at = 1234; DELETE FROM curriculum_subject WHERE subject_id = 'existing-subject'; UPDATE student SET address = 'Edited address';"
	);
	const before = academicRows(db);
	assert.deepEqual(seedAcademicData(db), { programs: 0, subjects: 0, curricula: 0, students: 0 });
	assert.deepEqual(academicRows(db), before);
});

test('seed rolls back academic inserts when a student insert fails', (t) => {
	const { db, sqlite } = fixture(t);
	sqlite.exec(
		"CREATE TRIGGER reject_seed BEFORE INSERT ON student BEGIN SELECT RAISE(ABORT, 'test failure'); END;"
	);
	assert.throws(() => seedAcademicData(db), /test failure/);
	assert.ok(academicRows(db).every((rows) => rows.length === 0));
});

test('seed CLI creates the configured admin and skips all changes once seeded', () => {
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
			if (run === 0) {
				assert.match(output, /No enrollments created/);
				sqlite = new Database(filename);
				assert.equal(
					sqlite.prepare('SELECT seeded FROM system_settings WHERE id = 1').get().seeded,
					1
				);
				sqlite.exec(
					"DELETE FROM student; DELETE FROM user WHERE id LIKE 'seed-student-user-%'; UPDATE user SET name = 'Edited admin', role = 'student', setup_complete = 0;"
				);
				sqlite.close();
				sqlite = undefined;
			} else {
				assert.match(output, /Database already seeded; skipping/);
				assert.doesNotMatch(output, /Added|Seeding complete/);
			}
		}
		sqlite = new Database(filename, { readonly: true });
		const users = sqlite.prepare('SELECT email, name, role, setup_complete FROM user').all();
		assert.deepEqual(users, [
			{ email: 'seed.admin@example.com', name: 'Edited admin', role: 'student', setup_complete: 0 }
		]);
		assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM student').get().count, 0);
		assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM account').get().count, 1);
		assert.equal(
			sqlite.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name='applicant'").get()
				.count,
			0
		);
		assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
	} finally {
		sqlite?.close();
		for (const suffix of ['', '-wal', '-shm', '-journal'])
			rmSync(filename + suffix, { force: true });
		rmdirSync(directory);
	}
});
