import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { error, isHttpError } from '@sveltejs/kit';
import ts from 'typescript';
import { migrationConfigThrough } from './migration-config.mjs';

const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
	const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => dependencies[id] ?? require(id), exports);
	return exports;
}
const roles = load('src/lib/Roles.ts');
const schema = load('src/lib/schema.ts', {
	'#lib/Roles.js': roles,
	'./email': load('src/lib/email.ts')
});
const templates = load('src/lib/server/email-templates.ts', {
	'./email-html': load('src/lib/server/email-html.ts'),
	'./email-theme': load('src/lib/server/email-theme.ts', {
		'../../routes/layout.css?raw': readFileSync('src/routes/layout.css', 'utf8')
	})
});
const admin = { id: 'admin', name: 'Administrator', role: 'admin' };
const registrar = { id: 'registrar', name: 'Registrar', role: 'registrar' };
const url = 'https://school.example/user/enrollment';
const rejects = (status, message) => (cause) =>
	isHttpError(cause) &&
	cause.status === status &&
	(!message || cause.body.message.includes(message));

function fixture(t, proveMigration = false) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	sqlite.pragma('foreign_keys=OFF');
	migrate(db, proveMigration ? migrationConfigThrough(t, 29) : { migrationsFolder: 'drizzle' });
	sqlite.pragma('foreign_keys=ON');
	sqlite.exec(`
		INSERT INTO user(id,name,email,role,setup_complete,first_name,last_name) VALUES ('admin','Administrator','admin@example.com','admin',1,'Administrator',''),
		('registrar','Registrar','registrar@example.com','registrar',1,'Registrar',''),
		('student','Alice Student','alice@example.com','student',1,'Alice','Student'),
		('other','Other Student','other@example.com','student',1,'Other','Student');
		INSERT INTO student(id,user_id,birth_date,sex) VALUES ('MA-001','student','2000-01-01','female'),('MA-002','other','2000-01-01','female');
		INSERT INTO program(id,code,name,is_active) VALUES
		('p1','BSIS','Information Systems',1),('p2','BSA','Accountancy',1);
		INSERT INTO curriculum(id,program_code,name,year_levels,semesters,published_at) VALUES
		('c1','BSIS','IS Curriculum',4,2,1000),('c2','BSA','Accounting Curriculum',4,2,1000);
		UPDATE program SET active_curriculum_id='c1' WHERE id='p1';
		UPDATE program SET active_curriculum_id='c2' WHERE id='p2';
		INSERT INTO subject(id,code,name) VALUES
		('s1','GEN101','General Subject'),('s2','IS101','Old Program Subject'),('s3','ACC101','New Program Subject');
		INSERT INTO curriculum_subject(id,curriculum_id,subject_id,subject_code,subject_name,units,year_level,semester) VALUES
		('cs1','c2','s1','GEN101','Published General Subject',3,1,1),
		('cs3','c2','s3','ACC101','Published Accounting Subject',3,1,1);
		INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level) VALUES
		('current','MA-001','c1','A',2026,1,1);
		UPDATE student SET enrollment_id='current' WHERE id='MA-001';
		INSERT INTO enrollment_subject(id,enrollment_id,subject_id,source,subject_code,subject_name,units,grade,added_by) VALUES
		('attempt1','current','s1','extra','GEN101','General Subject',3,2,'registrar'),
		('attempt2','current','s2','extra','IS101','Old Program Subject',3,4,'registrar');
	`);
	if (proveMigration) {
		// Legacy enrollments may have no recorded date; preserve this value too.
		sqlite.exec("UPDATE enrollment SET enrolled_at=NULL WHERE id='current'");
		sqlite.exec(
			"INSERT INTO notification(id,recipient_id,actor_id,enrollment_id,type,title,message) VALUES('legacy-notice','student','registrar','current','enrollment_confirmed','Enrolled','Enrollment confirmed')"
		);
		const before = {
			enrollment: sqlite.prepare('SELECT * FROM enrollment').get(),
			subjects: sqlite.prepare('SELECT * FROM enrollment_subject ORDER BY id').all(),
			student: sqlite.prepare("SELECT * FROM student WHERE id='MA-001'").get(),
			notification: sqlite.prepare("SELECT * FROM notification WHERE id='legacy-notice'").get()
		};
		// Exercise the actual migrator's outer transaction with foreign keys enabled.
		assert.equal(sqlite.pragma('foreign_keys', { simple: true }), 1);
		migrate(db, { migrationsFolder: 'drizzle' });
		assert.deepEqual(sqlite.prepare('SELECT * FROM enrollment').get(), {
			...before.enrollment,
			revision: 0
		});
		assert.deepEqual(
			sqlite.prepare('SELECT * FROM enrollment_subject ORDER BY id').all(),
			before.subjects
		);
		assert.deepEqual(
			sqlite.prepare("SELECT * FROM student WHERE id='MA-001'").get(),
			before.student
		);
		assert.deepEqual(
			sqlite.prepare("SELECT * FROM notification WHERE id='legacy-notice'").get(),
			before.notification
		);
		assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
		sqlite.exec(readFileSync('drizzle/rollback/0030_enrollment_corrections.sql', 'utf8'));
		assert.deepEqual(sqlite.prepare('SELECT * FROM enrollment').get(), before.enrollment);
		assert.deepEqual(
			sqlite.prepare('SELECT * FROM enrollment_subject ORDER BY id').all(),
			before.subjects
		);
		assert.deepEqual(
			sqlite.prepare("SELECT * FROM student WHERE id='MA-001'").get(),
			before.student
		);
		assert.deepEqual(
			sqlite.prepare("SELECT * FROM notification WHERE id='legacy-notice'").get(),
			before.notification
		);
		migrate(db, { migrationsFolder: 'drizzle' });
		assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
	}
	const dependencies = {
		'#lib/Roles.js': roles,
		'#lib/schema.js': schema,
		'#lib/enrollment-grades.js': load('src/lib/enrollment-grades.ts'),
		'#lib/server/db/index.js': { db },
		'@sveltejs/kit': { error }
	};
	const enrollment = load('src/lib/server/enrollment.ts', dependencies);
	const guards = load('src/lib/server/student-enrollment.ts', dependencies);
	const actions = load('src/lib/server/enrollment-corrections.ts', {
		...dependencies,
		'./enrollment': enrollment,
		'./student-enrollment': guards,
		'./email-templates': templates,
		'./notifications': load('src/lib/server/notifications.ts', dependencies)
	});
	const input = (overrides = {}) => ({
		userId: 'student',
		enrollmentId: 'current',
		currentEnrollmentId: 'current',
		revision: 0,
		reason: 'Correct incorrectly selected program',
		programCode: 'BSA',
		curriculumId: 'c2',
		schoolYearStart: 2026,
		semester: 1,
		yearLevel: 1,
		section: 'B',
		subjects: [
			{ id: 's1', units: 4.5 },
			{ id: 's2', units: 2 },
			{ id: 's3', units: 3 }
		],
		...overrides
	});
	const row = (id = 'current') => sqlite.prepare('SELECT * FROM enrollment WHERE id=?').get(id);
	const subjects = () => sqlite.prepare('SELECT * FROM enrollment_subject ORDER BY id').all();
	const audit = () => sqlite.prepare('SELECT * FROM enrollment_audit ORDER BY created_at,id').all();
	const counts = () => ({
		audits: audit().length,
		notifications: sqlite.prepare('SELECT count(*) AS n FROM notification').get().n
	});
	const change = (overrides = {}) => ({
		userId: 'student',
		enrollmentId: 'current',
		revision: 0,
		reason: 'Enrollment recorded in error',
		...overrides
	});
	return {
		sqlite,
		db,
		...actions,
		guards,
		enrollment,
		input,
		change,
		row,
		subjects,
		audit,
		counts
	};
}

test('program correction preserves matching attempt IDs, grades and attribution while accepting custom units', (t) => {
	const f = fixture(t);
	const result = f.correctStudentEnrollment(f.db, f.input(), registrar, url);
	const kept = f.subjects().find((subject) => subject.subject_id === 's1');
	assert.equal(kept.id, 'attempt1');
	assert.equal(kept.grade, 2);
	assert.equal(kept.added_by, 'registrar');
	assert.equal(kept.units, 4.5);
	assert.equal(kept.subject_name, 'Published General Subject');
	assert.equal(kept.source, 'curriculum');
	const added = f.subjects().find((subject) => subject.subject_id === 's3');
	assert.equal(added.grade, null);
	assert.equal(added.added_by, registrar.id);
	assert.equal(f.row().curriculum_id, 'c2');
	assert.equal(f.row().section, 'B');
	assert.equal(f.row().revision, 1);
	assert.deepEqual(f.counts(), { audits: 1, notifications: 1 });
	assert.equal(result.message.notification.type, 'enrollment_corrected');
});

test('removing a graded subject requires confirmation and retains its old grade in audit history', (t) => {
	const f = fixture(t);
	const input = f.input({
		subjects: [
			{ id: 's1', units: 3 },
			{ id: 's3', units: 3 }
		]
	});
	const before = { row: f.row(), subjects: f.subjects() };
	assert.throws(
		() => f.correctStudentEnrollment(f.db, input, registrar, url),
		rejects(409, 'Confirm removal')
	);
	assert.deepEqual({ row: f.row(), subjects: f.subjects() }, before);
	assert.deepEqual(f.counts(), { audits: 0, notifications: 0 });
	f.correctStudentEnrollment(f.db, { ...input, confirmGradedSubjectRemoval: true }, registrar, url);
	assert.equal(
		f.subjects().some((subject) => subject.id === 'attempt2'),
		false
	);
	const audit = f.audit()[0];
	assert.equal(audit.actor_id, registrar.id);
	assert.equal(audit.action, 'corrected');
	assert.equal(audit.reason, input.reason);
	assert.equal(
		JSON.parse(audit.before).subjects.find((subject) => subject.id === 'attempt2').grade,
		4
	);
	assert.equal(
		JSON.parse(audit.after).subjects.some((subject) => subject.id === 'attempt2'),
		false
	);
});

test('finalized enrollments stay locked until admin reopens; reopening resets requirements and enables correction and finalization', (t) => {
	const f = fixture(t);
	f.sqlite.exec(
		"UPDATE enrollment SET status='completed',finalized_grades=1,submitted_clearance=1,meeting_request_sent_at=1000,follow_up_completed_at=2000 WHERE id='current'"
	);
	for (const actor of [admin, registrar]) {
		assert.throws(() => f.correctStudentEnrollment(f.db, f.input(), actor, url), rejects(409));
		assert.throws(() => f.voidStudentEnrollment(f.db, f.change(), actor, url), rejects(409));
		assert.equal(
			f.guards.canFinalizeEnrollmentGrades(
				actor.role,
				f.guards.getStudentEnrollment(f.db, 'student', 'current')
			),
			false
		);
	}
	assert.throws(() => f.reopenStudentEnrollment(f.db, f.change(), registrar, url), rejects(403));
	f.reopenStudentEnrollment(f.db, f.change(), admin, url);
	const reopened = f.row();
	assert.equal(reopened.status, 'enrolled');
	for (const key of ['finalized_grades', 'submitted_clearance']) assert.equal(reopened[key], 0);
	for (const key of [
		'meeting_request_sent_at',
		'meeting_request_started_at',
		'follow_up_completed_at'
	])
		assert.equal(reopened[key], null);
	assert.equal(f.subjects()[0].grade, 2);
	f.correctStudentEnrollment(f.db, f.input({ revision: 1 }), admin, url);
	const record = f.guards.getStudentEnrollment(f.db, 'student', 'current');
	assert.equal(f.guards.canFinalizeEnrollmentGrades('admin', record), true);
	assert.equal(f.guards.canFinalizeEnrollmentGrades('registrar', record), true);
	assert.deepEqual(f.counts(), { audits: 2, notifications: 2 });
	assert.deepEqual(
		new Set(f.audit().map((entry) => entry.action)),
		new Set(['reopened', 'corrected'])
	);
});

test('populated migration preserves grades and links; historical corrections and reopening remain admin-only', (t) => {
	const f = fixture(t, true);
	f.sqlite.exec(
		"INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level,status,finalized_grades,submitted_clearance) VALUES('old','MA-001','c1','A',2025,2,1,'completed',1,1)"
	);
	const change = f.change({ enrollmentId: 'old' });
	assert.throws(() => f.reopenStudentEnrollment(f.db, change, registrar, url), rejects(403));
	f.reopenStudentEnrollment(f.db, change, admin, url);
	const correction = f.input({
		enrollmentId: 'old',
		revision: 1,
		schoolYearStart: 2025,
		semester: 2
	});
	assert.throws(() => f.correctStudentEnrollment(f.db, correction, registrar, url), rejects(409));
	assert.throws(
		() => f.voidStudentEnrollment(f.db, { ...change, revision: 1 }, registrar, url),
		rejects(409)
	);
	f.correctStudentEnrollment(f.db, correction, admin, url);
	assert.equal(f.row('old').curriculum_id, 'c2');
	assert.equal(
		f.sqlite.prepare("SELECT enrollment_id FROM student WHERE id='MA-001'").get().enrollment_id,
		'current'
	);
	const record = f.guards.getStudentEnrollment(f.db, 'student', 'old');
	assert.equal(f.guards.canFinalizeEnrollmentGrades('admin', record), true);
	assert.equal(f.guards.canFinalizeEnrollmentGrades('registrar', record), false);
});

test('voiding preserves evidence, restores previous current enrollment or null, and permits same-term replacement', (t) => {
	for (const previous of [false, true]) {
		const f = fixture(t);
		if (previous)
			f.sqlite.exec(
				"INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level,status,finalized_grades,submitted_clearance) VALUES('old','MA-001','c1','A',2025,2,1,'completed',1,1)"
			);
		const subjects = f.subjects();
		f.voidStudentEnrollment(f.db, f.change(), registrar, url);
		assert.equal(f.row().status, 'voided');
		assert.deepEqual(f.subjects(), subjects);
		assert.equal(
			f.sqlite.prepare("SELECT enrollment_id FROM student WHERE id='MA-001'").get().enrollment_id,
			previous ? 'old' : null
		);
		assert.equal(f.audit()[0].action, 'voided');
		assert.equal(JSON.parse(f.audit()[0].before).enrollment.status, 'enrolled');
		assert.equal(JSON.parse(f.audit()[0].after).enrollment.status, 'voided');
		assert.deepEqual(
			f.sqlite.prepare('SELECT type,actor_id,recipient_id,enrollment_id FROM notification').get(),
			{
				type: 'enrollment_voided',
				actor_id: 'registrar',
				recipient_id: 'student',
				enrollment_id: 'current'
			}
		);
		assert.equal(
			f.guards.canEditEnrollmentGrades(
				'admin',
				f.guards.getStudentEnrollment(f.db, 'student', 'current')
			),
			false
		);
		const replacement = f.input({ currentEnrollmentId: previous ? 'old' : null });
		assert.equal(f.enrollment.getEnrollmentPlan(f.db, replacement).curriculum.id, 'c2');
		f.sqlite.exec(
			"INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level) VALUES('replacement','MA-001','c2','B',2026,1,1)"
		);
		assert.equal(f.row('replacement').status, 'enrolled');
	}
});

test('stale revisions, wrong student ownership and unauthorized actors cannot mutate enrollment or evidence', (t) => {
	const f = fixture(t);
	f.correctStudentEnrollment(f.db, f.input(), registrar, url);
	const before = { row: f.row(), subjects: f.subjects(), counts: f.counts() };
	assert.throws(
		() => f.correctStudentEnrollment(f.db, f.input({ section: 'D' }), admin, url),
		rejects(409, 'Enrollment changed')
	);
	assert.throws(
		() => f.voidStudentEnrollment(f.db, f.change(), admin, url),
		rejects(409, 'Enrollment changed')
	);
	assert.throws(
		() => f.correctStudentEnrollment(f.db, f.input({ userId: 'other', revision: 1 }), admin, url),
		rejects(404)
	);
	assert.throws(
		() => f.voidStudentEnrollment(f.db, f.change({ userId: 'other', revision: 1 }), admin, url),
		rejects(404)
	);
	const student = { id: 'student', name: 'Alice Student', role: 'student' };
	assert.throws(
		() => f.correctStudentEnrollment(f.db, f.input({ revision: 1 }), student, url),
		rejects(409)
	);
	assert.throws(
		() => f.voidStudentEnrollment(f.db, f.change({ revision: 1 }), student, url),
		rejects(409)
	);
	assert.deepEqual({ row: f.row(), subjects: f.subjects(), counts: f.counts() }, before);
	// Rollback must refuse to erase new audit history.
	assert.throws(() =>
		f.sqlite.exec(readFileSync('drizzle/rollback/0030_enrollment_corrections.sql', 'utf8'))
	);
	f.sqlite.exec('ROLLBACK');
	assert.deepEqual({ row: f.row(), subjects: f.subjects(), counts: f.counts() }, before);
});
