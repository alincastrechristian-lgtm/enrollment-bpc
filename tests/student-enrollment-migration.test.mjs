import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import assert from 'node:assert/strict';
import test from 'node:test';

const config = { migrationsFolder: 'drizzle' };
const migrations = readMigrationFiles(config);
function fixture(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	sqlite.exec(
		'CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)'
	);
	sqlite.transaction(() => {
		for (const migration of migrations.slice(0, 17)) {
			for (const statement of migration.sql) sqlite.exec(statement);
			sqlite
				.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
				.run(migration.hash, migration.folderMillis);
		}
	})();
	sqlite.pragma('foreign_keys = ON');
	sqlite.exec(`
		INSERT INTO program (id, code, name) VALUES ('p', 'BSIS', 'Information Systems');
		INSERT INTO curriculum (id, program_code, name) VALUES ('c', 'BSIS', 'Curriculum');
		INSERT INTO subject (id, code, name) VALUES ('subject', 'IS101', 'Introduction');
		INSERT INTO user (id, name, email, created_at) VALUES ('u', 'Student', 'student@example.com', 1234);
		INSERT INTO applicant (id, user_id, application_id, name, program_code, year_level, date_applied, email, contact_number, address)
		VALUES ('a', 'u', 'APP-1', 'Student', 'BSIS', 1, 1234, 'student@example.com', '09123456789', 'Address');
		INSERT INTO student (id, user_id, studentId) VALUES ('uuid', 'u', '2026-001');
		INSERT INTO enrollment (id, student_id, curriculum_id, section, school_year_start, semester, year_level, enrolled_at)
		VALUES ('e', 'uuid', 'c', 'A', 2026, 1, 1, NULL);
		INSERT INTO enrollment_subject (id, enrollment_id, subject_id, source, subject_code, subject_name, units, added_by, added_at)
		VALUES ('es', 'e', 'subject', 'extra', 'OLD', 'Old Subject', 3, 'u', 1234);
	`);
	return sqlite;
}
function snapshot(sqlite) {
	return Object.fromEntries(
		['student', 'enrollment', 'enrollment_subject', 'applicant', '__drizzle_migrations'].map(
			(name) => [name, sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]
		)
	);
}
test('student numbers replace UUIDs, enrollment history is preserved, retries are safe, and no backups remain', (t) => {
	const sqlite = fixture(t);
	const before = snapshot(sqlite);
	migrate(drizzle(sqlite), config);
	assert.deepEqual(sqlite.prepare('SELECT * FROM student').get(), {
		id: '2026-001',
		user_id: 'u',
		applicant_id: 'a',
		enrollment_id: null,
		created_at: 1234
	});
	const after = snapshot(sqlite);
	assert.deepEqual(
		after.enrollment,
		before.enrollment.map((row) => ({ ...row, student_id: '2026-001' }))
	);
	assert.deepEqual(after.enrollment_subject, before.enrollment_subject);
	assert.deepEqual(after.applicant, before.applicant);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
	assert.equal(sqlite.pragma('defer_foreign_keys', { simple: true }), 0);
	assert.equal(
		sqlite
			.prepare(
				"SELECT count(*) AS n FROM sqlite_master WHERE name LIKE '%0017%' OR name LIKE '__new_%'"
			)
			.get().n,
		0
	);
	migrate(drizzle(sqlite), config);
	assert.deepEqual(snapshot(sqlite), after);
	sqlite.exec("UPDATE student SET enrollment_id = 'e' WHERE id = '2026-001'");
	assert.throws(() => sqlite.exec("UPDATE student SET enrollment_id = 'missing'"), /FOREIGN KEY/);
});
test('ID swaps cannot cause transient enrollment uniqueness collisions', (t) => {
	const sqlite = fixture(t);
	sqlite.exec(`
		INSERT INTO user (id, name, email) VALUES ('u2', 'Student 2', 'student2@example.com');
		UPDATE student SET studentId = 'other' WHERE id = 'uuid';
		INSERT INTO student (id, user_id, studentId) VALUES ('other', 'u2', 'uuid');
		INSERT INTO enrollment (id, student_id, curriculum_id, section, school_year_start, semester, year_level)
		VALUES ('e2', 'other', 'c', 'B', 2026, 1, 1);
	`);
	migrate(drizzle(sqlite), config);
	assert.equal(
		sqlite.prepare("SELECT student_id FROM enrollment WHERE id = 'e'").get().student_id,
		'other'
	);
	assert.equal(
		sqlite.prepare("SELECT student_id FROM enrollment WHERE id = 'e2'").get().student_id,
		'uuid'
	);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
});
test('orphaned enrollment aborts migration and restores every original row', (t) => {
	const sqlite = fixture(t);
	sqlite.pragma('foreign_keys = OFF');
	sqlite.exec("UPDATE enrollment SET student_id = 'missing' WHERE id = 'e'");
	sqlite.pragma('foreign_keys = ON');
	const before = snapshot(sqlite);
	assert.throws(
		() => migrate(drizzle(sqlite), config),
		(cause) => /NOT NULL/.test(cause.cause?.message ?? cause.message)
	);
	assert.deepEqual(snapshot(sqlite), before);
	assert.equal(sqlite.pragma('defer_foreign_keys', { simple: true }), 0);
});
