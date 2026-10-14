import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { migrationConfigThrough } from './migration-config.mjs';

test('grade migration preserves subject attempts, enforces range, and can be retried and rolled back', (t) => {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	migrate(drizzle(sqlite), migrationConfigThrough(t, 17));
	sqlite.pragma('foreign_keys = ON');
	sqlite.exec(`
		INSERT INTO user (id, name, email) VALUES ('u', 'Student', 'student@example.com');
		INSERT INTO student (id, user_id) VALUES ('2026-001', 'u');
		INSERT INTO program (id, code, name) VALUES ('p', 'BSIS', 'Information Systems');
		INSERT INTO curriculum (id, program_code, name) VALUES ('c', 'BSIS', 'Curriculum');
		INSERT INTO subject (id, code, name) VALUES ('s', 'IS101', 'Introduction');
		INSERT INTO enrollment (id, student_id, curriculum_id, section, school_year_start, semester, year_level)
		VALUES ('e', '2026-001', 'c', 'A', 2026, 1, 1);
		INSERT INTO enrollment_subject (id, enrollment_id, subject_id, source, subject_code, subject_name, units, added_by, added_at)
		VALUES ('es', 'e', 's', 'extra', 'SNAP101', 'Published subject', 1.5, 'u', 1234);
	`);
	const before = sqlite.prepare('SELECT * FROM enrollment_subject').get();
	const enrollmentBefore = sqlite.prepare('SELECT * FROM enrollment').get();
	const config = { migrationsFolder: 'drizzle' };
	migrate(drizzle(sqlite), config);
	const { remarks, ...attempt } = before;
	assert.equal(remarks, null);
	assert.deepEqual(sqlite.prepare('SELECT * FROM enrollment_subject').get(), {
		...attempt,
		grade: null
	});
	assert.deepEqual(sqlite.prepare('SELECT * FROM enrollment').get(), enrollmentBefore);
	const update = sqlite.prepare('UPDATE enrollment_subject SET grade = ? WHERE id = ?');
	for (const grade of [1, 1.25, 2.75, 5, null]) {
		update.run(grade, 'es');
		assert.equal(sqlite.prepare('SELECT grade FROM enrollment_subject').get().grade, grade);
	}
	for (const grade of [-1, 0, 0.99, 5.01, Infinity, 'ungraded']) {
		assert.throws(() => update.run(grade, 'es'), /enrollment_subject_grade_range/);
	}
	update.run(1.25, 'es');
	migrate(drizzle(sqlite), config);
	assert.equal(sqlite.prepare('SELECT grade FROM enrollment_subject').get().grade, 1.25);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
	assert.equal(sqlite.pragma('foreign_keys', { simple: true }), 1);

	sqlite.exec(readFileSync('drizzle/rollback/0018_enrollment_subject_grades.sql', 'utf8'));
	assert.deepEqual(sqlite.prepare('SELECT * FROM enrollment_subject').get(), before);
	assert.deepEqual(sqlite.prepare('SELECT * FROM enrollment').get(), enrollmentBefore);
	migrate(drizzle(sqlite), config);
	assert.deepEqual(sqlite.prepare('SELECT * FROM enrollment_subject').get(), {
		...attempt,
		grade: null
	});
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
});
