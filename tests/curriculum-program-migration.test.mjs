import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { migrationConfigThrough } from './migration-config.mjs';

const config = { migrationsFolder: 'drizzle' };
const migrations = readMigrationFiles(config);
function fixture(t, foreignKeys = true) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	sqlite.exec(
		'CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)'
	);
	sqlite.transaction(() => {
		for (const migration of migrations.slice(0, 16)) {
			for (const statement of migration.sql) sqlite.exec(statement);
			sqlite
				.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
				.run(migration.hash, migration.folderMillis);
		}
	})();
	sqlite.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
	sqlite.exec(`
		INSERT INTO program (id, code, name) VALUES ('uuid-p', 'BSIS', 'Information Systems');
		INSERT INTO subject (id, code, name) VALUES ('s', 'IS101', 'Introduction');
		INSERT INTO curriculum (id, program_id, name, published_at, archived_at)
		VALUES ('c', 'uuid-p', 'Published', 1000, NULL), ('archived', 'uuid-p', 'Archived', 500, 1000);
		INSERT INTO curriculum_subject (id, curriculum_id, subject_id, year_level, semester, units, subject_code, subject_name)
		VALUES ('cs', 'c', 's', 1, 1, 3, 'SNAPSHOT', 'Original Subject');
		UPDATE program SET active_curriculum_id = 'c';
		INSERT INTO user (id, name, email) VALUES ('u', 'Student', 'student@example.com');
		INSERT INTO student (id, user_id, studentId) VALUES ('student', 'u', '2026-1');
		INSERT INTO enrollment (id, student_id, curriculum_id, section, school_year_start, semester, year_level)
		VALUES ('e', 'student', 'c', 'A', 2026, 1, 1);
		INSERT INTO enrollment_subject (id, enrollment_id, subject_id, curriculum_subject_id, source, subject_code, subject_name, units, added_by, added_at)
		VALUES ('es', 'e', 's', 'cs', 'curriculum', 'SNAPSHOT', 'Original Subject', 3, 'u', 1000);
	`);
	return sqlite;
}
function snapshot(sqlite) {
	return Object.fromEntries(
		[
			'curriculum',
			'curriculum_subject',
			'program',
			'enrollment',
			'enrollment_subject',
			'__drizzle_migrations'
		].map((name) => [name, sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()])
	);
}
for (const foreignKeys of [true, false]) {
	test(`converts UUIDs to codes, preserves references and retries with foreign keys ${foreignKeys}`, (t) => {
		const sqlite = fixture(t, foreignKeys);
		const before = snapshot(sqlite);
		migrate(drizzle(sqlite), migrationConfigThrough(t, 16));
		const after = snapshot(sqlite);
		assert.deepEqual(
			after.curriculum,
			before.curriculum.map(({ program_id, ...row }) => {
				assert.equal(program_id, 'uuid-p');
				return { ...row, program_code: 'BSIS' };
			})
		);
		for (const table of ['program', 'curriculum_subject', 'enrollment', 'enrollment_subject']) {
			assert.deepEqual(after[table], before[table]);
		}
		assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
		assert.equal(sqlite.pragma('foreign_keys', { simple: true }), Number(foreignKeys));
		migrate(drizzle(sqlite), migrationConfigThrough(t, 16));
		assert.deepEqual(snapshot(sqlite), after);
	});
}
test('program code renames cascade; missing programs and duplicate curriculum names are rejected', (t) => {
	const sqlite = fixture(t);
	migrate(drizzle(sqlite), migrationConfigThrough(t, 16));
	sqlite.exec("UPDATE program SET code = 'IS' WHERE id = 'uuid-p'");
	assert.deepEqual(sqlite.prepare('SELECT DISTINCT program_code FROM curriculum').all(), [
		{ program_code: 'IS' }
	]);
	assert.throws(
		() =>
			sqlite.exec(
				"INSERT INTO curriculum (id, program_code, name) VALUES ('missing', 'no-program', 'Invalid')"
			),
		/FOREIGN KEY/
	);
	assert.throws(
		() =>
			sqlite.exec(
				"INSERT INTO curriculum (id, program_code, name) VALUES ('duplicate', 'IS', 'Published')"
			),
		/UNIQUE/
	);
	assert.throws(() => sqlite.exec("DELETE FROM program WHERE id = 'uuid-p'"), /FOREIGN KEY/);
});
test('orphaned program references roll back migration without losing rows', (t) => {
	const sqlite = fixture(t);
	sqlite.pragma('foreign_keys = OFF');
	sqlite.exec("UPDATE curriculum SET program_id = 'missing' WHERE id = 'archived'");
	sqlite.pragma('foreign_keys = ON');
	const before = snapshot(sqlite);
	assert.throws(
		() => migrate(drizzle(sqlite), migrationConfigThrough(t, 16)),
		(error) => /NOT NULL/.test(error.cause?.message ?? error.message)
	);
	assert.deepEqual(snapshot(sqlite), before);
	assert.equal(sqlite.pragma('defer_foreign_keys', { simple: true }), 0);
	assert.deepEqual(
		sqlite.prepare("SELECT name FROM sqlite_master WHERE name LIKE '__new_%'").all(),
		[]
	);
});
test('rollback restores UUID ownership and preserves history; forward migration can reapply', (t) => {
	const sqlite = fixture(t);
	const before = snapshot(sqlite);
	migrate(drizzle(sqlite), migrationConfigThrough(t, 16));
	sqlite.exec(
		readFileSync(
			new URL('../drizzle/rollback/0016_curriculum_program_code.sql', import.meta.url),
			'utf8'
		)
	);
	sqlite
		.prepare('DELETE FROM __drizzle_migrations WHERE created_at = ?')
		.run(migrations[16].folderMillis);
	assert.deepEqual(snapshot(sqlite), before);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
	migrate(drizzle(sqlite), migrationConfigThrough(t, 16));
	assert.equal(
		sqlite.prepare("SELECT program_code FROM curriculum WHERE id = 'c'").get().program_code,
		'BSIS'
	);
});
