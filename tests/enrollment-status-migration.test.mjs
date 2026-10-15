import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { migrationConfigThrough } from './migration-config.mjs';

function fixture(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	migrate(drizzle(sqlite), migrationConfigThrough(t, 21));
	sqlite.pragma('foreign_keys = ON');
	sqlite.exec(`
		INSERT INTO user (id, name, email) VALUES ('u', 'Student', 'student@example.com');
		INSERT INTO student (id, user_id) VALUES ('MA-001', 'u');
		INSERT INTO program (id, code, name) VALUES ('p', 'BSIS', 'Information Systems');
		INSERT INTO curriculum (id, program_code, name) VALUES ('c', 'BSIS', 'Curriculum');
		INSERT INTO subject (id, code, name) VALUES ('s', 'IS101', 'Introduction');
	`);
	for (const [index, status] of ['pending', 'enrolled', 'cancelled', 'withdrawn'].entries()) {
		sqlite
			.prepare(
				`INSERT INTO enrollment (id, student_id, curriculum_id, section, school_year_start, semester, year_level, status, enrolled_at, finalized_grades)
			VALUES (?, 'MA-001', 'c', 'A', ?, 1, 1, ?, ?, ?)`
			)
			.run(`e${index}`, 2023 + index, status, index ? 1000 + index : null, Number(index === 0));
		sqlite
			.prepare(
				`INSERT INTO enrollment_subject (id, enrollment_id, subject_id, source, subject_code, subject_name, units, grade, added_by)
			VALUES (?, ?, 's', 'extra', 'SNAP101', 'Published subject', 1.5, ?, 'u')`
			)
			.run(`es${index}`, `e${index}`, [null, 1.25, 3, 5][index]);
	}
	sqlite.exec("UPDATE student SET enrollment_id = 'e0' WHERE id = 'MA-001'");
	return sqlite;
}

function snapshot(sqlite) {
	return Object.fromEntries(
		['enrollment', 'enrollment_subject', 'student'].map((table) => [
			table,
			sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all()
		])
	);
}

function withoutPendingFlag(entry) {
	const result = { ...entry };
	delete result.is_pending;
	return result;
}

test('removing pending converts only that status and preserves grades, links, and legacy timestamps', (t) => {
	const sqlite = fixture(t);
	const before = snapshot(sqlite);
	const config = migrationConfigThrough(t, 22);
	migrate(drizzle(sqlite), config);
	const after = snapshot(sqlite);
	assert.deepEqual(
		after.enrollment,
		before.enrollment.map((entry) => ({
			...withoutPendingFlag(entry),
			status: entry.status === 'pending' ? 'enrolled' : entry.status
		}))
	);
	assert.deepEqual(after.enrollment_subject, before.enrollment_subject);
	assert.deepEqual(after.student, before.student);
	assert.equal(after.enrollment[0].enrolled_at, null);
	assert.equal(after.enrollment[0].finalized_grades, 1);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
	assert.equal(sqlite.pragma('foreign_keys', { simple: true }), 1);
	assert.equal(sqlite.pragma('defer_foreign_keys', { simple: true }), 0);
	migrate(drizzle(sqlite), config);
	assert.deepEqual(snapshot(sqlite), after);
});

test('new enrollments default to enrolled and pending is rejected on insert and update', (t) => {
	const sqlite = fixture(t);
	migrate(drizzle(sqlite), migrationConfigThrough(t, 22));
	sqlite.exec(`INSERT INTO enrollment (id, student_id, curriculum_id, section, school_year_start, semester, year_level)
		VALUES ('default', 'MA-001', 'c', 'B', 2030, 1, 1)`);
	const record = sqlite.prepare("SELECT * FROM enrollment WHERE id = 'default'").get();
	assert.equal(record.status, 'enrolled');
	assert.equal(typeof record.enrolled_at, 'number');
	assert.throws(
		() => sqlite.exec("UPDATE enrollment SET status = 'pending' WHERE id = 'default'"),
		/enrollment_status_valid/
	);
	assert.throws(
		() =>
			sqlite.exec(`INSERT INTO enrollment (id, student_id, curriculum_id, section, school_year_start, semester, year_level, status)
		VALUES ('invalid', 'MA-001', 'c', 'B', 2031, 1, 1, 'pending')`),
		/enrollment_status_valid/
	);
	assert.throws(
		() =>
			sqlite.exec(`INSERT INTO enrollment (id, student_id, curriculum_id, section, school_year_start, semester, year_level)
		VALUES ('duplicate', 'MA-001', 'c', 'B', 2030, 1, 1)`),
		/UNIQUE/
	);
	assert.throws(
		() => sqlite.exec("UPDATE enrollment SET student_id = 'missing' WHERE id = 'default'"),
		/FOREIGN KEY/
	);
});

test('schema rollback preserves converted records and can be migrated forward again', (t) => {
	const sqlite = fixture(t);
	const config = migrationConfigThrough(t, 22);
	migrate(drizzle(sqlite), config);
	const before = snapshot(sqlite);
	sqlite.exec(readFileSync('drizzle/rollback/0022_remove_pending_enrollment.sql', 'utf8'));
	const rolledBack = snapshot(sqlite);
	assert.deepEqual(rolledBack.enrollment.map(withoutPendingFlag), before.enrollment);
	assert.deepEqual(rolledBack.enrollment_subject, before.enrollment_subject);
	assert.deepEqual(rolledBack.student, before.student);
	sqlite.exec(`INSERT INTO enrollment (id, student_id, curriculum_id, section, school_year_start, semester, year_level)
		VALUES ('old-default', 'MA-001', 'c', 'B', 2030, 1, 1)`);
	assert.equal(
		sqlite.prepare("SELECT status FROM enrollment WHERE id = 'old-default'").get().status,
		'pending'
	);
	migrate(drizzle(sqlite), config);
	assert.equal(
		sqlite.prepare("SELECT status FROM enrollment WHERE id = 'old-default'").get().status,
		'enrolled'
	);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
});

test('a broken existing reference aborts the migration without partial conversion', (t) => {
	const sqlite = fixture(t);
	sqlite.pragma('foreign_keys = OFF');
	sqlite.exec("UPDATE enrollment SET student_id = 'missing' WHERE id = 'e0'");
	sqlite.pragma('foreign_keys = ON');
	const before = snapshot(sqlite);
	assert.throws(
		() => migrate(drizzle(sqlite), migrationConfigThrough(t, 22)),
		(cause) => /CHECK/.test(cause.cause?.message ?? cause.message)
	);
	assert.deepEqual(snapshot(sqlite), before);
	assert.equal(
		sqlite
			.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name = '__new_enrollment'")
			.get().count,
		0
	);
	assert.equal(sqlite.pragma('defer_foreign_keys', { simple: true }), 0);
});
