import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { migrationConfigThrough } from './migration-config.mjs';

test('registrar deletion migration preserves attempts and supports guarded rollback', (t) => {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite);
	migrate(db, migrationConfigThrough(t, 28));
	sqlite.pragma('foreign_keys=ON');
	sqlite.exec(`
		INSERT INTO user(id,name,email,role) VALUES('r','Registrar','r@example.com','registrar'),('s','Student','s@example.com','student');
		INSERT INTO student(id,user_id) VALUES('MA','s');
		INSERT INTO program(id,code,name) VALUES('p','BSIS','Information Systems');
		INSERT INTO curriculum(id,program_code,name) VALUES('c','BSIS','Curriculum');
		INSERT INTO subject(id,code,name) VALUES('s','IS101','Introduction');
		INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level) VALUES('e','MA','c','A',2026,1,1);
		UPDATE student SET enrollment_id='e';
		INSERT INTO enrollment_subject(id,enrollment_id,subject_id,source,subject_code,subject_name,units,grade,added_by,added_at)
		VALUES('es','e','s','extra','IS101','Introduction',3,2.5,'r',1000);
	`);
	const before = sqlite.prepare('SELECT * FROM enrollment_subject').all();
	assert.throws(() => sqlite.exec("DELETE FROM user WHERE id='r'"));
	migrate(db, { migrationsFolder: 'drizzle' });
	assert.deepEqual(sqlite.prepare('SELECT * FROM enrollment_subject').all(), before);
	const rollback = readFileSync('drizzle/rollback/0029_registrar_deletion.sql', 'utf8');
	sqlite.exec(rollback);
	assert.deepEqual(sqlite.prepare('SELECT * FROM enrollment_subject').all(), before);
	assert.throws(() => sqlite.exec("DELETE FROM user WHERE id='r'"));
	migrate(db, { migrationsFolder: 'drizzle' });
	migrate(db, { migrationsFolder: 'drizzle' });
	sqlite.exec("DELETE FROM user WHERE id='r'");
	assert.deepEqual(sqlite.prepare('SELECT * FROM enrollment_subject').all(), [
		{ ...before[0], added_by: null }
	]);
	assert.equal(sqlite.prepare('SELECT enrollment_id FROM student').get().enrollment_id, 'e');
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
	assert.throws(() => sqlite.exec(rollback));
	sqlite.exec('ROLLBACK');
	assert.equal(sqlite.prepare('SELECT grade FROM enrollment_subject').get().grade, 2.5);
	assert.equal(
		sqlite.pragma('table_info(enrollment_subject)').find((column) => column.name === 'added_by')
			.notnull,
		0
	);
});
