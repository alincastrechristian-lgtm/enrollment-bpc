import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { migrationConfigThrough } from './migration-config.mjs';

test('lifecycle migration preserves grades and links, backfills completion and permits dropped-term reenrollment', (t) => {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	migrate(drizzle(sqlite), migrationConfigThrough(t, 25));
	sqlite.pragma('foreign_keys=ON');
	sqlite.exec(`INSERT INTO user(id,name,email,role)VALUES('u','Student','s@example.com','student');
	 INSERT INTO student(id,user_id)VALUES('MA','u');
	 INSERT INTO program(id,code,name)VALUES('p','BSIS','Information Systems');
	 INSERT INTO curriculum(id,program_code,name)VALUES('c','BSIS','Curriculum');
	 INSERT INTO subject(id,code,name)VALUES('s','S1','Subject');
	 INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level,status,finalized_grades,submitted_clearance,enrolled_at)VALUES
	 ('e','MA','c','A',2026,1,1,'enrolled',1,1,NULL),('cancelled','MA','c','A',2026,2,1,'cancelled',0,0,1000),('withdrawn','MA','c','A',2027,1,2,'withdrawn',0,0,1000);
	 UPDATE student SET enrollment_id='e';
	 INSERT INTO enrollment_subject(id,enrollment_id,subject_id,source,subject_code,subject_name,units,grade,added_by)VALUES('es','e','s','extra','S1','Subject',3,2.5,'u');`);
	const migration = readMigrationFiles({ migrationsFolder: 'drizzle' })[26];
	const apply = () =>
		sqlite.transaction(() => {
			for (const sql of migration.sql) sqlite.exec(sql);
		})();
	apply();
	assert.deepEqual(sqlite.prepare('SELECT id,status FROM enrollment ORDER BY id').all(), [
		{ id: 'cancelled', status: 'dropped' },
		{ id: 'e', status: 'completed' },
		{ id: 'withdrawn', status: 'dropped' }
	]);
	assert.equal(sqlite.prepare('SELECT grade FROM enrollment_subject').get().grade, 2.5);
	assert.equal(sqlite.prepare('SELECT enrollment_id FROM student').get().enrollment_id, 'e');
	assert.equal(
		sqlite.prepare("SELECT enrolled_at FROM enrollment WHERE id='e'").get().enrolled_at,
		null
	);
	sqlite.exec(
		"INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level)VALUES('reenrolled','MA','c','A',2026,2,1)"
	);
	assert.throws(() =>
		sqlite.exec(
			"INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level)VALUES('duplicate','MA','c','A',2026,2,1)"
		)
	);
	const rollback = readFileSync('drizzle/rollback/0026_enrollment_lifecycle.sql', 'utf8');
	assert.throws(() => sqlite.exec(rollback));
	sqlite.exec('ROLLBACK');
	assert.equal(sqlite.prepare('SELECT count(*) n FROM enrollment').get().n, 4);
	sqlite.exec("DELETE FROM enrollment WHERE id='reenrolled'");
	sqlite.exec(rollback);
	assert.equal(sqlite.prepare('SELECT grade FROM enrollment_subject').get().grade, 2.5);
	apply();
	assert.equal(sqlite.prepare('SELECT count(*) n FROM enrollment').get().n, 3);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
});
