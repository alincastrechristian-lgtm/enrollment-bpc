import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Deliberately does not load .env or open the live database. All records below are synthetic.
const destination = resolve(process.argv[2] || 'defense/defense.db');
mkdirSync(dirname(destination), { recursive: true });
closeSync(openSync(destination, 'wx', 0o600)); // Never overwrite an existing database.
const database = new Database(destination);
try {
	migrate(drizzle(database), {
		migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url))
	});
	database.pragma('foreign_keys = ON');
	database
		.transaction(() => {
			database.exec(`
			INSERT INTO system_settings(id, seeded, sender_name, automated_clearance_verification_enabled, personal_info_verification_enabled)
			VALUES (1, 1, 'Defense demonstration only', 0, 0);
			INSERT INTO user(id,name,first_name,last_name,email,role,setup_complete) VALUES
			('demo-admin','Demo Administrator','Demo','Administrator','admin@example.invalid','admin',0),
			('demo-registrar','Demo Registrar','Demo','Registrar','registrar@example.invalid','registrar',0),
			('demo-student','Demo Student','Demo','Student','student@example.invalid','student',0);
			INSERT INTO student(id,user_id,birth_date,sex) VALUES ('MA-20260001','demo-student','2000-01-01','female');
			INSERT INTO program(id,code,name) VALUES ('demo-program','BSIS','Information Systems (Demo)');
			INSERT INTO subject(id,code,name) VALUES ('demo-subject','DEMO101','Sample Subject');
			INSERT INTO curriculum(id,program_code,name,year_levels,semesters,published_at) VALUES ('demo-curriculum','BSIS','Demo Curriculum',4,2,1);
			UPDATE program SET active_curriculum_id='demo-curriculum' WHERE id='demo-program';
			INSERT INTO curriculum_subject(id,curriculum_id,subject_id,year_level,semester,units,subject_code,subject_name)
			VALUES ('demo-curriculum-subject','demo-curriculum','demo-subject',1,1,3,'DEMO101','Sample Subject');
			INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level)
			VALUES ('demo-enrollment','MA-20260001','demo-curriculum','A',2026,1,1);
			UPDATE student SET enrollment_id='demo-enrollment' WHERE user_id='demo-student';
			INSERT INTO enrollment_subject(id,enrollment_id,subject_id,source,curriculum_subject_id,subject_code,subject_name,units,grade)
			VALUES ('demo-grade','demo-enrollment','demo-subject','curriculum','demo-curriculum-subject','DEMO101','Sample Subject',3,1.5);
		`);
		})
		.immediate();
	if (database.pragma('foreign_key_check').length)
		throw new Error('Demo database failed relationship checks.');
	console.log(`Created synthetic defense database: ${destination}`);
} finally {
	database.close();
}
