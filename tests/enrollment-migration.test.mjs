import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import assert from 'node:assert/strict';
import test from 'node:test';
import { migrationConfigThrough } from './migration-config.mjs';

const config = { migrationsFolder: 'drizzle' };
const migrations = readMigrationFiles(config);

function fixture(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	sqlite.exec(
		'CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)'
	);
	sqlite.transaction(() => {
		for (const migration of migrations.slice(0, 14)) {
			for (const statement of migration.sql) sqlite.exec(statement);
			sqlite
				.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
				.run(migration.hash, migration.folderMillis);
		}
	})();
	sqlite.exec(`
		INSERT INTO user (id, name, email) VALUES ('u', 'Student', 'student@example.com');
		INSERT INTO student (id, user_id, studentId) VALUES ('s', 'u', '2026-001');
		INSERT INTO program (id, code, name) VALUES ('p', 'BSIS', 'Information Systems');
		INSERT INTO curriculum (id, program_id, name) VALUES ('c', 'p', 'Curriculum');
		INSERT INTO subject (id, code, name) VALUES ('subject', 'IS101', 'Introduction');
		INSERT INTO applicant (id, user_id, application_id, name, program, year_level, date_applied, email, contact_number, address)
		VALUES ('a', 'u', '2026-001', 'Student', 'BSIS', 4, 1234, 'student@example.com', '09123456789', 'Address');
	`);
	for (const [index, status] of ['pending', 'enrolled', 'cancelled', 'withdrawn'].entries()) {
		sqlite
			.prepare('INSERT INTO academic_term VALUES (?, ?, ?, ?, ?)')
			.run(`t${index}`, 2024 + Math.floor(index / 2), 1 + (index % 2), 100, 200);
		sqlite
			.prepare(
				'INSERT INTO enrollment (id, student_id, term_id, curriculum_id, year_level, status, enrolled_at, section) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.run(
				`e${index}`,
				's',
				`t${index}`,
				'c',
				index + 1,
				status,
				index ? 1000 + index : null,
				`Section ${index}`
			);
		sqlite
			.prepare(
				'INSERT INTO enrollment_subject (id, enrollment_id, subject_id, source, subject_code, subject_name, units, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.run(`es${index}`, `e${index}`, 'subject', 'extra', 'IS101', 'Introduction', 3, 'u', 1234);
	}
	return sqlite;
}

function snapshot(sqlite) {
	return Object.fromEntries(
		['applicant', 'enrollment', 'enrollment_subject', 'academic_term', '__drizzle_migrations'].map(
			(table) => [table, sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]
		)
	);
}

test('migration preserves applicants, enrollment history, terms and subjects; retry is a no-op', (t) => {
	const sqlite = fixture(t);
	const before = snapshot(sqlite);
	migrate(drizzle(sqlite), migrationConfigThrough(t, 14));
	const { program, ...applicant } = before.applicant[0];
	assert.deepEqual(sqlite.prepare('SELECT * FROM applicant').get(), {
		...applicant,
		program_code: program
	});
	assert.deepEqual(
		sqlite.prepare('SELECT * FROM enrollment ORDER BY rowid').all(),
		before.enrollment.map(({ term_id, ...row }) => {
			const term = before.academic_term.find((entry) => entry.id === term_id);
			return {
				...row,
				school_year_start: term.start_year,
				semester: term.semester,
				is_pending: Number(row.status === 'pending')
			};
		})
	);
	assert.deepEqual(
		sqlite.prepare('SELECT * FROM academic_term ORDER BY rowid').all(),
		before.academic_term
	);
	assert.deepEqual(
		sqlite.prepare('SELECT * FROM enrollment_subject ORDER BY rowid').all(),
		before.enrollment_subject
	);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
	assert.equal(sqlite.pragma('foreign_keys', { simple: true }), 1);
	assert.equal(sqlite.pragma('defer_foreign_keys', { simple: true }), 0);
	const after = snapshot(sqlite);
	migrate(drizzle(sqlite), migrationConfigThrough(t, 14));
	assert.deepEqual(snapshot(sqlite), after);

	// New readers/writers use the renamed program and direct term columns.
	sqlite.exec(
		"UPDATE program SET code = 'IS' WHERE id = 'p'; UPDATE applicant SET year_level = 5 WHERE id = 'a';"
	);
	assert.equal(sqlite.prepare('SELECT program_code FROM applicant').get().program_code, 'IS');
	sqlite.exec(
		"INSERT INTO enrollment (id, student_id, curriculum_id, section, school_year_start, semester, year_level) VALUES ('new', 's', 'c', 'A', 2026, 1, 5)"
	);
	assert.equal(
		sqlite.prepare("SELECT is_pending FROM enrollment WHERE id = 'new'").get().is_pending,
		1
	);
	assert.throws(
		() =>
			sqlite.exec(
				"INSERT INTO enrollment (id, student_id, curriculum_id, section, school_year_start, semester, year_level) VALUES ('duplicate', 's', 'c', 'B', 2026, 1, 5)"
			),
		/UNIQUE constraint/
	);
	assert.throws(
		() => sqlite.exec("DELETE FROM enrollment WHERE id = 'e0'"),
		/FOREIGN KEY constraint/
	);
	assert.throws(
		() => sqlite.exec("UPDATE applicant SET program_code = 'missing' WHERE id = 'a'"),
		/FOREIGN KEY constraint/
	);
});

for (const [name, corruption, message] of [
	[
		'missing term',
		"UPDATE enrollment SET term_id = 'missing' WHERE id = 'e0'",
		/NOT NULL constraint/
	],
	[
		'invalid foreign key',
		"UPDATE enrollment SET curriculum_id = 'missing' WHERE id = 'e0'",
		/migration_0014_foreign_keys_valid/
	],
	[
		'duplicate student term',
		"DROP INDEX academic_term_year_semester_unique; UPDATE academic_term SET start_year = 2024, semester = 1 WHERE id = 't1'",
		/UNIQUE constraint/
	]
]) {
	test(`migration rolls back every change for ${name}`, (t) => {
		const sqlite = fixture(t);
		sqlite.pragma('foreign_keys = OFF');
		sqlite.exec(corruption);
		sqlite.pragma('foreign_keys = ON');
		const before = snapshot(sqlite);
		assert.throws(
			() => migrate(drizzle(sqlite), migrationConfigThrough(t, 14)),
			(error) => message.test(error.cause?.message ?? error.message)
		);
		assert.deepEqual(snapshot(sqlite), before);
		assert.equal(sqlite.pragma('foreign_keys', { simple: true }), 1);
		assert.equal(sqlite.pragma('defer_foreign_keys', { simple: true }), 0);
		assert.deepEqual(
			sqlite.prepare("SELECT name FROM sqlite_master WHERE name LIKE '__new_%'").all(),
			[]
		);
	});
}

test('migration chain also creates a fresh database', (t) => {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	migrate(drizzle(sqlite), config);
	assert.equal(
		sqlite.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get().n,
		migrations.length
	);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
	assert.ok(
		sqlite.pragma('table_info(applicant)').some((column) => column.name === 'program_code')
	);
	assert.ok(
		sqlite.pragma('table_info(enrollment)').some((column) => column.name === 'school_year_start')
	);
});
