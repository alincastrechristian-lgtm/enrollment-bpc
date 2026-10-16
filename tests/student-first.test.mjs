import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { error, isHttpError, redirect } from '@sveltejs/kit';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file, deps = {}, source) {
	const { outputText } = ts.transpileModule(source ?? readFileSync(file, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => deps[id] ?? require(id), exports);
	return exports;
}
const { Role } = load('src/lib/Roles.ts');
const schema = load('src/lib/schema.ts', {
	'#lib/Roles.js': { Role },
	'./email': load('src/lib/email.ts')
});
const emailTemplates = load('src/lib/server/email-templates.ts', {
	'./email-html': load('src/lib/server/email-html.ts'),
	'./email-theme': load('src/lib/server/email-theme.ts', {
		'../../routes/layout.css?raw': readFileSync('src/routes/layout.css', 'utf8')
	})
});
const guard = ts
	.createSourceFile(
		'auth.ts',
		readFileSync('src/lib/server/auth.ts', 'utf8'),
		ts.ScriptTarget.Latest,
		true
	)
	.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'validateUser')
	.getText();
const { validateUser } = load(
	'',
	{ '@sveltejs/kit': { error } },
	"import {error} from '@sveltejs/kit';\n" + guard
);
const status = (n) => (cause) => isHttpError(cause) && cause.status === n;
const personal = {
	name: 'New Student',
	email: 'new@example.com',
	address: 'Malolos, Bulacan',
	contactNumber: '09171234567'
};
function fixture(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	sqlite.pragma('foreign_keys = ON');
	sqlite.exec(`INSERT INTO user(id,name,email,role) VALUES ('caller','Registrar','staff@example.com','registrar');
 INSERT INTO program(id,code,name) VALUES('p','BSIS','Information Systems');
 INSERT INTO curriculum(id,program_code,name,published_at,year_levels,semesters) VALUES('c','BSIS','Published Curriculum',1000,4,2);
 UPDATE program SET active_curriculum_id='c';
 INSERT INTO subject(id,code,name) VALUES('s1','IS101','Introduction'),('s2','IS201','Programming');
 INSERT INTO curriculum_subject(id,curriculum_id,subject_id,subject_code,subject_name,year_level,semester,units) VALUES('cs1','c','s1','IS101','Introduction',1,1,3),('cs2','c','s2','IS201','Programming',2,2,4);`);
	const state = { role: Role.REGISTRAR, creates: 0, emails: 0, mailFail: false, authFail: false };
	state.meetingEmails = [];
	state.enrollmentEmails = [];
	state.dropEmails = [];
	const auth = {
		api: {
			async createUser({ body }) {
				state.creates++;
				if (state.authFail) throw new Error('SECRET auth credentials');
				const user = {
					id: crypto.randomUUID(),
					name: body.name,
					email: body.email,
					role: body.role ?? Role.STUDENT
				};
				db.insert(schema.user).values(user).run();
				return { user };
			},
			async requestPasswordReset() {
				state.emails++;
				if (state.mailFail) throw new Error('SECRET SMTP credentials');
			}
		}
	};
	const deps = {
		'#lib/enrollment-grades.js': load('src/lib/enrollment-grades.ts'),
		'#lib/server/email-templates.js': emailTemplates,
		'#lib/server/email.js': {
			sendEmail: async (...args) => {
				if (args[1].includes('enrollment has been dropped')) {
					state.dropEmails.push(args);
					assert.equal(sqlite.inTransaction, false);
					return !state.dropEmailFail;
				}
				if (args[1].includes('Your enrollment is confirmed')) {
					state.onEnrollmentEmail?.();
					state.enrollmentEmails.push(args);
					if (state.deferEnrollmentEmail)
						await new Promise((resolve) => (state.finishEnrollmentEmail = resolve));
					return !state.enrollmentEmailFail;
				}
				state.onEmail?.();
				state.meetingEmails.push(args);
				if (state.deferMeetingEmail)
					await new Promise((resolve) => (state.finishMeetingEmail = resolve));
				return !state.meetingEmailFail;
			}
		},
		'#lib/Roles.js': { Role },
		'#lib/schema.js': schema,
		'#lib/students.js': load('src/lib/students.ts'),
		'#lib/server/auth.js': { auth, validateUser },
		'../server/db': { db },
		'#lib/server/db/index.js': { db },
		'@sveltejs/kit': { error, isHttpError },
		'$app/env/private': { ORIGIN: 'https://example.com' },
		'$app/paths': { resolve: (path) => '/portal' + path },
		'$app/server': {
			getRequestEvent: () => ({
				locals: {
					user: state.role ? { id: 'caller', role: state.role } : null,
					session: state.role ? {} : null
				},
				request: { headers: new Headers() }
			}),
			command: (validation, handler) => async (input) => handler(validation.parse(input))
		}
	};
	deps['#lib/server/enrollment.js'] = load('src/lib/server/enrollment.ts', deps);
	deps['#lib/server/student-enrollment.js'] = load('src/lib/server/student-enrollment.ts', deps);
	const commands = load('src/lib/actions/user.remote.ts', deps);
	const gradeCommands = load('src/lib/actions/grades.remote.ts', deps);
	return {
		sqlite,
		db,
		state,
		...commands,
		...gradeCommands,
		enrollmentPage: (userId) =>
			load('src/routes/user/students/[userId]/enroll/+page.server.ts', deps).load({
				locals: { user: { id: 'caller', role: state.role }, session: {} },
				params: { userId },
				url: new URL('https://example.com/user/students/u/enroll')
			}),
		getOutstandingSubjects: (studentId) =>
			deps['#lib/server/enrollment.js'].getOutstandingEnrollmentSubjects(db, studentId),
		input: (created, overrides = {}) => ({
			userId: created.userId,
			programCode: 'BSIS',
			curriculumId: 'c',
			currentEnrollmentId: null,
			schoolYearStart: 2026,
			semester: 1,
			yearLevel: 1,
			section: 'A',
			subjects: [
				{ id: 's1', units: 2.5 },
				{ id: 's2', units: 4 }
			],
			...overrides
		})
	};
}
test('staff create a student without enrollment or academic columns, then enroll the same account', async (t) => {
	const f = fixture(t);
	const created = await f.createStudent(personal);
	assert.match(created.studentId, /^MA-\d{6}-\d{6}$/);
	assert.equal(created.invitationSent, true);
	const record = f.db.select().from(schema.studentData).get();
	assert.equal(record.address, personal.address);
	assert.equal(record.contactNumber, personal.contactNumber);
	assert.equal(record.currentEnrollmentId, null);
	assert.equal(f.db.select().from(schema.enrollment).all().length, 0);
	for (const field of ['programCode', 'section', 'yearLevel', 'semester', 'applicantId'])
		assert.ok(!(field in record));
	const enrolled = await f.enrollStudent(f.input(created));
	assert.equal(enrolled.userId, created.userId);
	assert.equal(enrolled.studentId, created.studentId);
	assert.equal(f.state.creates, 1);
	assert.equal(f.state.emails, 1);
	assert.equal(
		f.db.select().from(schema.studentData).get().currentEnrollmentId,
		enrolled.enrollmentId
	);
	const subjects = f.db.select().from(schema.enrollmentSubject).all();
	assert.deepEqual(
		subjects.map((s) => [s.source, s.units]),
		[
			['curriculum', 2.5],
			['extra', 4]
		]
	);
	assert.deepEqual(f.sqlite.pragma('foreign_key_check'), []);
});
test('enrollment confirmation sends after commit and email failure preserves enrollment', async (t) => {
	const f = fixture(t);
	for (const role of [Role.ADMIN, Role.REGISTRAR]) {
		f.state.role = role;
		const created = await f.createStudent({ ...personal, email: role + '@example.com' });
		const input = f.input(created);
		f.state.onEnrollmentEmail = () => {
			assert.equal(f.sqlite.inTransaction, false);
			const current = f.sqlite
				.prepare('SELECT enrollment_id FROM student WHERE user_id=?')
				.get(created.userId).enrollment_id;
			assert.ok(current);
			assert.equal(
				f.sqlite
					.prepare('SELECT count(*) n FROM enrollment_subject WHERE enrollment_id=?')
					.get(current).n,
				2
			);
		};
		f.state.deferEnrollmentEmail = true;
		f.state.enrollmentEmailFail = role === Role.REGISTRAR;
		const pending = f.enrollStudent(input);
		await assert.rejects(f.enrollStudent(input), status(409));
		f.state.finishEnrollmentEmail();
		const result = await pending;
		assert.equal(result.success, true);
		assert.equal(result.notificationSent, role === Role.ADMIN);
		assert.equal(f.state.enrollmentEmails.length, role === Role.ADMIN ? 1 : 2);
		const [to, subject, text] = f.state.enrollmentEmails.at(-1);
		assert.equal(to, role + '@example.com');
		assert.match(subject, /enrollment is confirmed/);
		assert.match(text, /BSIS, Year 1, Section A/);
		assert.match(text, /https:\/\/example.com\/portal\/user\/enrollment/);
	}
});

test('admin and registrar can create, student and anonymous cannot create or enroll', async (t) => {
	const f = fixture(t);
	for (const role of [Role.ADMIN, Role.REGISTRAR]) {
		f.state.role = role;
		await f.createStudent({ ...personal, email: role + '@example.com' });
	}
	for (const role of [Role.STUDENT, null]) {
		f.state.role = role;
		await assert.rejects(f.createStudent(personal), status(role ? 403 : 401));
		await assert.rejects(f.enrollStudent(f.input({ userId: 'missing' })), status(role ? 403 : 401));
	}
	assert.equal(f.state.creates, 2);
});
test('duplicate emails identify existing roles and do not create duplicate student records', async (t) => {
	const f = fixture(t);
	await f.createStudent(personal);
	await assert.rejects(
		f.createStudent({ ...personal, email: 'NEW@EXAMPLE.COM' }),
		(e) => status(409)(e) && e.body.message.includes('student account')
	);
	await assert.rejects(
		f.createStudent({ ...personal, email: 'staff@example.com' }),
		(e) => status(409)(e) && e.body.message.includes('registrar account')
	);
	assert.equal(f.state.creates, 1);
});
test('mail failure keeps student saved; enrollment does not send another invitation', async (t) => {
	const f = fixture(t);
	f.state.mailFail = true;
	const created = await f.createStudent(personal);
	assert.equal(created.invitationSent, false);
	await f.enrollStudent(f.input(created));
	assert.equal(f.state.emails, 1);
});
test('failed student insert compensates only its auth account and rolls back the monthly sequence', async (t) => {
	const f = fixture(t);
	f.sqlite.exec(
		"CREATE TRIGGER fail_student BEFORE INSERT ON student BEGIN SELECT RAISE(ABORT,'SECRET database failure');END;"
	);
	await assert.rejects(f.createStudent(personal), status(500));
	assert.equal(f.db.select().from(schema.user).all().length, 1);
	assert.equal(f.db.select().from(schema.studentSequence).all().length, 0);
});
test('concurrent/stale enrollment requests cannot duplicate terms or replace current enrollment', async (t) => {
	const f = fixture(t);
	const created = await f.createStudent(personal);
	const input = f.input(created);
	const first = await f.enrollStudent(input);
	await assert.rejects(f.enrollStudent(input), status(409));
	await assert.rejects(
		f.enrollStudent({ ...input, currentEnrollmentId: first.enrollmentId }),
		status(409)
	);
	f.sqlite.exec('UPDATE enrollment SET finalized_grades=1, submitted_clearance=1');
	const next = await f.enrollStudent({
		...input,
		currentEnrollmentId: first.enrollmentId,
		acknowledgeGradeConcerns: true,
		semester: 2
	});
	assert.notEqual(next.enrollmentId, first.enrollmentId);
	assert.equal(f.state.creates, 1);
	assert.equal(f.db.select().from(schema.enrollment).all().length, 2);
});

test('reenrollment requires both finalized grades and verified clearance for admin and registrar', async (t) => {
	const f = fixture(t);
	const created = await f.createStudent(personal);
	const first = await f.enrollStudent(f.input(created));
	const next = f.input(created, { currentEnrollmentId: first.enrollmentId, semester: 2 });
	for (const role of [Role.ADMIN, Role.REGISTRAR]) {
		f.state.role = role;
		for (const [finalized, clearance] of [
			[0, 0],
			[1, 0],
			[0, 1]
		]) {
			f.sqlite
				.prepare('UPDATE enrollment SET finalized_grades=?,submitted_clearance=?')
				.run(finalized, clearance);
			await assert.rejects(
				f.enrollStudent(next),
				(cause) => status(409)(cause) && cause.body.message.includes('verify clearance')
			);
			assert.equal(f.db.select().from(schema.enrollment).all().length, 1);
			assert.equal(
				f.db.select().from(schema.studentData).get().currentEnrollmentId,
				first.enrollmentId
			);
		}
	}
	f.sqlite.exec('UPDATE enrollment SET finalized_grades=1,submitted_clearance=1');
	await assert.rejects(
		f.enrollStudent(next),
		(cause) => status(409)(cause) && cause.body.message.includes('acknowledge')
	);
	const result = await f.enrollStudent({ ...next, acknowledgeGradeConcerns: true });
	const current = f.db
		.select()
		.from(schema.enrollment)
		.all()
		.find((e) => e.id === result.enrollmentId);
	assert.equal(current.finalizedGrades, false);
	assert.equal(current.submittedClearance, false);
});

test('reenrollment with failed grades requires completed Registrar follow-up for both staff roles', async (t) => {
	const f = fixture(t);
	for (const role of [Role.ADMIN, Role.REGISTRAR]) {
		f.state.role = role;
		const created = await f.createStudent({ ...personal, email: `failed-${role}@example.com` });
		const first = await f.enrollStudent(f.input(created));
		const reference = { userId: created.userId, enrollmentId: first.enrollmentId };
		f.sqlite.prepare('UPDATE user SET setup_complete=1 WHERE id=?').run(created.userId);
		f.sqlite
			.prepare(
				"UPDATE enrollment SET finalized_grades=1,submitted_clearance=1,status='completed' WHERE id=?"
			)
			.run(first.enrollmentId);
		f.sqlite
			.prepare('UPDATE enrollment_subject SET grade=4 WHERE enrollment_id=?')
			.run(first.enrollmentId);
		const next = f.input(created, {
			currentEnrollmentId: first.enrollmentId,
			semester: 2,
			acknowledgeGradeConcerns: true
		});
		const blocked = (cause) =>
			status(409)(cause) && /Registrar.*meeting|meeting.*Registrar/i.test(cause.body.message);
		await assert.rejects(f.enrollStudent(next), blocked);
		const page = f.enrollmentPage(created.userId);
		assert.match(page.enrollmentLockReason, /meeting/i);
		assert.equal(page.plan, null);
		await f.sendEnrollmentMeetingRequest(reference);
		await assert.rejects(f.enrollStudent(next), blocked);
		assert.equal(
			f.sqlite
				.prepare('SELECT count(*) n FROM enrollment WHERE student_id=?')
				.get(created.studentId).n,
			1
		);
		assert.equal(
			f.sqlite.prepare('SELECT enrollment_id FROM student WHERE id=?').get(created.studentId)
				.enrollment_id,
			first.enrollmentId
		);
		await f.completeEnrollmentFollowUp(reference);
		assert.equal(f.enrollmentPage(created.userId).enrollmentLockReason, null);
		const reenrolled = await f.enrollStudent(next);
		assert.notEqual(reenrolled.enrollmentId, first.enrollmentId);

		const passing = await f.createStudent({ ...personal, email: `passing-${role}@example.com` });
		const passingFirst = await f.enrollStudent(f.input(passing));
		f.sqlite
			.prepare(
				"UPDATE enrollment SET finalized_grades=1,submitted_clearance=1,status='completed' WHERE id=?"
			)
			.run(passingFirst.enrollmentId);
		f.sqlite
			.prepare('UPDATE enrollment_subject SET grade=3 WHERE enrollment_id=?')
			.run(passingFirst.enrollmentId);
		await f.enrollStudent(
			f.input(passing, { currentEnrollmentId: passingFirst.enrollmentId, semester: 2 })
		);
	}
});

test('staff can drop and reenroll in the same term without losing the dropped record or subject history', async (t) => {
	const f = fixture(t);
	f.sqlite.exec(
		"INSERT INTO curriculum(id,program_code,name,published_at)VALUES('next-c','BSIS','Next curriculum',1000)"
	);
	for (const role of [Role.ADMIN, Role.REGISTRAR]) {
		f.state.role = role;
		f.sqlite.exec(
			"UPDATE program SET active_curriculum_id='c';UPDATE curriculum SET archived_at=NULL,is_active=1 WHERE id='c'"
		);
		const created = await f.createStudent({ ...personal, email: role + '@example.com' });
		const first = await f.enrollStudent(f.input(created, { section: 'C' }));
		const reference = { userId: created.userId, enrollmentId: first.enrollmentId };
		f.sqlite.prepare('UPDATE enrollment SET finalized_grades=1 WHERE id=?').run(first.enrollmentId);
		f.sqlite
			.prepare('UPDATE enrollment_subject SET grade=5 WHERE enrollment_id=?')
			.run(first.enrollmentId);
		const original = f.sqlite
			.prepare('SELECT * FROM enrollment_subject WHERE enrollment_id=? ORDER BY id')
			.all(first.enrollmentId);
		for (const deniedRole of [Role.STUDENT, null]) {
			f.state.role = deniedRole;
			await assert.rejects(f.dropEnrollment(reference), status(deniedRole ? 403 : 401));
		}
		f.state.role = role;
		await assert.rejects(f.dropEnrollment({ ...reference, userId: 'caller' }), status(404));
		f.state.dropEmailFail = role === Role.REGISTRAR;
		const dropped = await f.dropEnrollment(reference);
		assert.equal(dropped.notificationSent, role === Role.ADMIN);
		assert.equal(f.state.dropEmails.at(-1)[0], role + '@example.com');
		const saved = f.sqlite.prepare('SELECT * FROM enrollment WHERE id=?').get(first.enrollmentId);
		assert.equal(saved.status, 'dropped');
		assert.ok(saved.dropped_at);
		await assert.rejects(f.dropEnrollment(reference), status(409));
		await assert.rejects(f.verifyEnrollmentClearance(reference), status(409));
		await assert.rejects(
			f.updateEnrollmentGrades({
				...reference,
				grades: [{ id: original[0].id, grade: 3, originalGrade: 5 }]
			}),
			status(409)
		);
		assert.deepEqual(f.getOutstandingSubjects(created.studentId), []);
		// Reenrollment restores the recorded curriculum even after a new one is selected.
		f.sqlite.exec(
			"UPDATE program SET active_curriculum_id='next-c';UPDATE curriculum SET archived_at=1000,is_active=0 WHERE id='c'"
		);
		const page = f.enrollmentPage(created.userId);
		assert.equal(page.restoringDropped, true);
		assert.equal(page.enrollmentLockReason, null);
		assert.equal(page.programCode, 'BSIS');
		assert.equal(page.plan.curriculum.id, 'c');
		assert.equal(page.schoolYearStart, 2026);
		assert.equal(page.student.yearLevel, 1);
		assert.equal(page.student.semester, 1);
		assert.equal(page.student.section, 'C');
		assert.deepEqual(page.gradeConcerns, { failedCount: 0, incompleteCount: 0 });
		assert.deepEqual(page.plan.restoredSubjects.map((entry) => entry.units).sort(), [2.5, 4]);
		const input = f.input(created, {
			currentEnrollmentId: first.enrollmentId,
			section: 'C',
			subjects: page.plan.restoredSubjects
		});
		const reenrolled = await f.enrollStudent(input);
		assert.notEqual(reenrolled.enrollmentId, first.enrollmentId);
		assert.equal(
			f.sqlite.prepare('SELECT status FROM enrollment WHERE id=?').get(first.enrollmentId).status,
			'dropped'
		);
		assert.equal(
			f.sqlite.prepare('SELECT enrollment_id FROM student WHERE user_id=?').get(created.userId)
				.enrollment_id,
			reenrolled.enrollmentId
		);
		assert.deepEqual(
			f.sqlite
				.prepare('SELECT * FROM enrollment_subject WHERE enrollment_id=? ORDER BY id')
				.all(first.enrollmentId),
			original
		);
		assert.equal(
			f.sqlite.prepare('SELECT status FROM enrollment WHERE id=?').get(reenrolled.enrollmentId)
				.status,
			'enrolled'
		);
		assert.equal(
			f.sqlite
				.prepare(
					'SELECT count(*) n FROM enrollment_subject WHERE enrollment_id=? AND grade IS NOT NULL'
				)
				.get(reenrolled.enrollmentId).n,
			0
		);
		await assert.rejects(f.enrollStudent(input), status(409));
		assert.deepEqual(f.sqlite.pragma('foreign_key_check'), []);
	}
});

test('staff complete an existing follow-up once without changing grades, clearance or enrollment status', async (t) => {
	const f = fixture(t);
	const created = await f.createStudent(personal);
	const first = await f.enrollStudent(f.input(created));
	const reference = { userId: created.userId, enrollmentId: first.enrollmentId };
	await assert.rejects(f.completeEnrollmentFollowUp(reference), status(409));
	for (const role of [Role.STUDENT, null]) {
		f.state.role = role;
		await assert.rejects(f.completeEnrollmentFollowUp(reference), status(role ? 403 : 401));
	}
	f.state.role = Role.ADMIN;
	await assert.rejects(
		f.completeEnrollmentFollowUp({ ...reference, userId: 'caller' }),
		status(404)
	);
	f.sqlite.exec('UPDATE enrollment SET finalized_grades=1,meeting_request_sent_at=1000');
	const grades = f.sqlite.prepare('SELECT id,grade FROM enrollment_subject ORDER BY id').all();
	for (const role of [Role.ADMIN, Role.REGISTRAR]) {
		f.state.role = role;
		f.sqlite.exec('UPDATE enrollment SET follow_up_completed_at=NULL');
		const result = await f.completeEnrollmentFollowUp(reference);
		assert.ok(result.followUpCompletedAt instanceof Date);
		const saved = f.db.select().from(schema.enrollment).get();
		assert.ok(saved.followUpCompletedAt instanceof Date);
		assert.equal(saved.submittedClearance, false);
		assert.equal(saved.finalizedGrades, true);
		assert.equal(saved.status, 'enrolled');
		await assert.rejects(f.completeEnrollmentFollowUp(reference), status(409));
	}
	f.sqlite.exec("UPDATE enrollment SET status='dropped',follow_up_completed_at=NULL");
	await assert.rejects(f.completeEnrollmentFollowUp(reference), status(409));
	assert.equal(f.db.select().from(schema.enrollment).get().followUpCompletedAt, null);
	assert.deepEqual(
		f.sqlite.prepare('SELECT id,grade FROM enrollment_subject ORDER BY id').all(),
		grades
	);
});

test('clearance verification enforces staff access, ownership and grade finalization', async (t) => {
	const f = fixture(t);
	const created = await f.createStudent(personal);
	const first = await f.enrollStudent(f.input(created));
	const reference = { userId: created.userId, enrollmentId: first.enrollmentId };
	await assert.rejects(f.verifyEnrollmentClearance(reference), status(409));
	assert.equal(f.db.select().from(schema.enrollment).get().submittedClearance, false);
	await assert.rejects(
		f.verifyEnrollmentClearance({ ...reference, userId: 'caller' }),
		status(404)
	);
	f.sqlite.exec("UPDATE user SET setup_complete=1 WHERE role='student'");
	await f.finalizeEnrollmentGrades({
		...reference,
		grades: f.db
			.select()
			.from(schema.enrollmentSubject)
			.all()
			.map(({ id, grade }) => ({ id, grade }))
	});
	for (const role of [Role.STUDENT, null]) {
		f.state.role = role;
		await assert.rejects(f.verifyEnrollmentClearance(reference), status(role ? 403 : 401));
	}
	for (const role of [Role.ADMIN, Role.REGISTRAR]) {
		f.state.role = role;
		f.sqlite.exec('UPDATE enrollment SET submitted_clearance=0');
		assert.equal((await f.verifyEnrollmentClearance(reference)).submittedClearance, true);
		assert.equal(f.db.select().from(schema.enrollment).get().submittedClearance, true);
		assert.equal(f.db.select().from(schema.enrollment).get().status, 'completed');
		await assert.rejects(f.dropEnrollment(reference), status(409));
		await assert.rejects(f.verifyEnrollmentClearance(reference), status(409));
	}
});

test('grade finalization sends email after commit, avoids duplicate sends, and survives delivery failure', async (t) => {
	const f = fixture(t);
	for (const role of [Role.ADMIN, Role.REGISTRAR]) {
		f.state.role = role;
		const created = await f.createStudent({ ...personal, email: role + '@example.com' });
		const first = await f.enrollStudent(f.input(created));
		const reference = {
			userId: created.userId,
			enrollmentId: first.enrollmentId,
			grades: f.sqlite
				.prepare('SELECT id,grade FROM enrollment_subject WHERE enrollment_id=?')
				.all(first.enrollmentId)
		};
		await assert.rejects(f.finalizeEnrollmentGrades(reference), status(409));
		assert.equal(f.state.meetingEmails.length, role === Role.ADMIN ? 0 : 1);
		f.sqlite.prepare('UPDATE user SET setup_complete=1 WHERE id=?').run(created.userId);
		await assert.rejects(
			f.finalizeEnrollmentGrades({
				...reference,
				grades: reference.grades.map((row) => ({ ...row, grade: 2 }))
			}),
			status(409)
		);
		f.state.onEmail = () => {
			assert.equal(f.sqlite.inTransaction, false);
			assert.equal(
				f.sqlite
					.prepare('SELECT finalized_grades FROM enrollment WHERE id=?')
					.get(first.enrollmentId).finalized_grades,
				1
			);
		};
		f.state.deferMeetingEmail = true;
		f.state.meetingEmailFail = role === Role.REGISTRAR;
		if (role === Role.REGISTRAR)
			f.sqlite
				.prepare('UPDATE enrollment SET submitted_clearance=1 WHERE id=?')
				.run(first.enrollmentId);
		const pending = f.finalizeEnrollmentGrades(reference);
		await assert.rejects(f.finalizeEnrollmentGrades(reference), status(409));
		f.state.finishMeetingEmail();
		const result = await pending;
		assert.equal(result.finalizedGrades, true);
		assert.equal(result.notificationSent, role === Role.ADMIN);
		assert.equal(
			f.sqlite.prepare('SELECT status FROM enrollment WHERE id=?').get(first.enrollmentId).status,
			role === Role.REGISTRAR ? 'completed' : 'enrolled'
		);
		assert.equal(f.state.meetingEmails.at(-1)[0], role + '@example.com');
		assert.match(f.state.meetingEmails.at(-1)[1], /grades have been finalized/);
		assert.match(f.state.meetingEmails.at(-1)[2], /Program: Information Systems \(BSIS\)/);
		assert.match(
			f.state.meetingEmails.at(-1)[2],
			/https:\/\/example.com\/portal\/user\/enrollment/
		);
		assert.equal(f.state.meetingEmails.length, role === Role.ADMIN ? 1 : 2);
	}
});

test('meeting requests validate concerns and ownership, retry failed email, and prevent duplicate delivery', async (t) => {
	const f = fixture(t);
	const created = await f.createStudent(personal);
	const first = await f.enrollStudent(f.input(created));
	const reference = { userId: created.userId, enrollmentId: first.enrollmentId };
	await assert.rejects(f.sendEnrollmentMeetingRequest(reference), status(409));
	for (const role of [Role.STUDENT, null]) {
		f.state.role = role;
		await assert.rejects(f.sendEnrollmentMeetingRequest(reference), status(role ? 403 : 401));
	}
	f.state.role = Role.ADMIN;
	await assert.rejects(
		f.sendEnrollmentMeetingRequest({ ...reference, userId: 'caller' }),
		status(404)
	);
	f.sqlite.exec('UPDATE enrollment SET finalized_grades=1; UPDATE enrollment_subject SET grade=3');
	await assert.rejects(f.sendEnrollmentMeetingRequest(reference), status(409));
	assert.equal(f.state.meetingEmails.length, 0);
	f.sqlite.exec(
		"UPDATE enrollment_subject SET grade=3.01 WHERE source='curriculum'; UPDATE enrollment_subject SET grade=NULL WHERE source='extra'"
	);
	f.state.meetingEmailFail = true;
	await assert.rejects(f.sendEnrollmentMeetingRequest(reference), status(502));
	let saved = f.db.select().from(schema.enrollment).get();
	assert.equal(saved.meetingRequestSentAt, null);
	assert.equal(saved.meetingRequestStartedAt, null);
	f.state.meetingEmailFail = false;
	f.state.deferMeetingEmail = true;
	const sending = f.sendEnrollmentMeetingRequest(reference);
	assert.equal(f.db.select().from(schema.enrollment).get().meetingRequestSentAt, null);
	await assert.rejects(f.sendEnrollmentMeetingRequest(reference), status(409));
	f.state.finishMeetingEmail();
	const result = await sending;
	assert.ok(result.meetingRequestSentAt instanceof Date);
	saved = f.db.select().from(schema.enrollment).get();
	assert.ok(saved.meetingRequestSentAt instanceof Date);
	assert.equal(saved.meetingRequestStartedAt, null);
	assert.equal(f.state.meetingEmails.length, 2);
	assert.equal(f.state.meetingEmails[1][0], personal.email);
	assert.match(f.state.meetingEmails[1][2], /Registrar's Office/);
	await assert.rejects(f.sendEnrollmentMeetingRequest(reference), status(409));
	assert.equal(f.state.meetingEmails.length, 2);
	f.state.role = Role.REGISTRAR;
	f.state.deferMeetingEmail = false;
	f.sqlite.exec('UPDATE enrollment SET meeting_request_sent_at=NULL,meeting_request_started_at=1');
	await f.sendEnrollmentMeetingRequest(reference);
	assert.equal(f.state.meetingEmails.length, 3);
	// The additive migration and rollback preserve student, enrollment and grade records.
	const grades = f.sqlite.prepare('SELECT id,grade FROM enrollment_subject ORDER BY id').all();
	f.sqlite.exec(readFileSync('drizzle/rollback/0027_complete_enrollment_follow_up.sql', 'utf8'));
	f.sqlite.exec(readFileSync('drizzle/rollback/0026_enrollment_lifecycle.sql', 'utf8'));
	f.sqlite.exec(readFileSync('drizzle/rollback/0025_enrollment_meeting_request.sql', 'utf8'));
	assert.equal(f.sqlite.prepare('SELECT count(*) n FROM enrollment').get().n, 1);
	assert.deepEqual(
		f.sqlite.prepare('SELECT id,grade FROM enrollment_subject ORDER BY id').all(),
		grades
	);
	migrate(f.db, { migrationsFolder: 'drizzle' });
	assert.equal(f.db.select().from(schema.enrollment).get().meetingRequestSentAt, null);
});
test('enrollment rejects invalid curricula, units, duplicate subjects, and wrong student accounts without writes', async (t) => {
	const f = fixture(t);
	const created = await f.createStudent(personal);
	for (const patch of [
		{ curriculumId: 'stale' },
		{ yearLevel: 5 },
		{ semester: 3 },
		{ subjects: [{ id: 'missing', units: 3 }] },
		{
			subjects: [
				{ id: 's1', units: 3 },
				{ id: 's1', units: 4 }
			]
		},
		{ userId: 'caller' }
	])
		await assert.rejects(f.enrollStudent(f.input(created, patch)));
	await assert.rejects(f.enrollStudent(f.input(created, { subjects: [{ id: 's1', units: 0 }] })));
	assert.equal(f.db.select().from(schema.enrollment).all().length, 0);
});

test('failed enrollment preserves the student account and rolls back subjects and current link', async (t) => {
	const f = fixture(t);
	const created = await f.createStudent(personal);
	f.sqlite.exec(
		"CREATE TRIGGER fail_enrollment_subject BEFORE INSERT ON enrollment_subject BEGIN SELECT RAISE(ABORT,'SECRET subject database failure');END;"
	);
	await assert.rejects(f.enrollStudent(f.input(created)), status(500));
	assert.equal(f.db.select().from(schema.studentData).get().currentEnrollmentId, null);
	assert.equal(f.db.select().from(schema.enrollment).all().length, 0);
	assert.equal(f.db.select().from(schema.user).all().length, 2);
	assert.equal(f.state.emails, 1);
	assert.equal(f.state.enrollmentEmails.length, 0);
});

function legacy(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	// This fixture exercises 0023 specifically, independent of later migrations.
	const migrations = readMigrationFiles({ migrationsFolder: 'drizzle' }).slice(0, 24);
	for (const migration of migrations.slice(0, -1))
		sqlite.transaction(() => {
			for (const sql of migration.sql) sqlite.exec(sql);
		})();
	sqlite.pragma('foreign_keys = ON');
	sqlite.exec(`INSERT INTO user(id,name,email,role)VALUES('old','Old Student','old@example.com','student'),('staff','Staff','staff@example.com','registrar');
 INSERT INTO program(id,code,name)VALUES('p','BSIS','Information Systems');INSERT INTO curriculum(id,program_code,name,published_at)VALUES('c','BSIS','Published',1000);
 INSERT INTO applicant(id,user_id,application_id,name,program_code,year_level,date_applied,email,contact_number,address,created_at,updated_at)VALUES
 ('a1','old','MA-202610-000012','Old Student','BSIS',1,1000,'old@example.com','0917','Old Address',1000,2000),('a2',null,'MA-202610-000013','Waiting Student','BSIS',1,1000,'waiting@example.com','0918','Waiting Address',1000,2000);
 INSERT INTO student(id,user_id,applicant_id)VALUES('MA-202610-000012','old','a1');INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level,finalized_grades)VALUES('e','MA-202610-000012','c','A',2026,1,1,1);UPDATE student SET enrollment_id='e';
 INSERT INTO subject(id,code,name)VALUES('s','IS101','Introduction');INSERT INTO enrollment_subject(id,enrollment_id,subject_id,source,subject_code,subject_name,units,grade,added_by)VALUES('es','e','s','extra','IS101','Introduction',3,2.5,'staff');`);
	return {
		sqlite,
		apply: () =>
			sqlite.transaction(() => {
				for (const sql of migrations.at(-1).sql) sqlite.exec(sql);
			})()
	};
}
test('migration preserves profiles, numbers, current enrollment and grades; waiting applicants become unenrolled students', (t) => {
	const f = legacy(t);
	f.apply();
	assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM student').get().n, 2);
	assert.deepEqual(
		f.sqlite
			.prepare("SELECT address,contact_number,enrollment_id FROM student WHERE user_id='old'")
			.get(),
		{ address: 'Old Address', contact_number: '0917', enrollment_id: 'e' }
	);
	assert.equal(f.sqlite.prepare('SELECT grade FROM enrollment_subject').get().grade, 2.5);
	assert.equal(
		f.sqlite.prepare('SELECT finalized_grades FROM enrollment').get().finalized_grades,
		1
	);
	assert.equal(
		f.sqlite.prepare('SELECT last_number FROM student_sequence WHERE year=2026 AND month=10').get()
			.last_number,
		13
	);
	assert.deepEqual(f.sqlite.pragma('foreign_key_check'), []);
	assert.equal(
		f.sqlite.prepare("SELECT name FROM sqlite_master WHERE name='applicant'").get(),
		undefined
	);
});
test('migration aborts ambiguous existing emails without partially deleting applicant data', (t) => {
	const f = legacy(t);
	f.sqlite.exec("UPDATE applicant SET email='staff@example.com' WHERE id='a2'");
	assert.throws(f.apply);
	assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM applicant').get().n, 2);
	assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM student').get().n, 1);
	assert.deepEqual(f.sqlite.pragma('foreign_key_check'), []);
});

test('monthly sequence increments and an exhausted month creates no orphan auth account', async (t) => {
	const f = fixture(t);
	const first = await f.createStudent(personal);
	const second = await f.createStudent({ ...personal, email: 'second@example.com' });
	assert.equal(Number(second.studentId.slice(-6)), Number(first.studentId.slice(-6)) + 1);
	f.sqlite.exec('UPDATE student_sequence SET last_number=999999');
	await assert.rejects(f.createStudent({ ...personal, email: 'third@example.com' }), status(409));
	assert.equal(f.db.select().from(schema.studentData).all().length, 2);
	assert.equal(f.db.select().from(schema.user).all().length, 3);
	migrate(f.db, { migrationsFolder: 'drizzle' });
	assert.equal(f.db.select().from(schema.studentData).all().length, 2);
});

test('rollback refuses to invent academic details, then preserves profiles and history when enrollment exists', (t) => {
	const f = legacy(t);
	f.apply();
	const rollback = readFileSync('drizzle/rollback/0023_student_first.sql', 'utf8');
	assert.throws(() => f.sqlite.exec(rollback));
	f.sqlite.exec('ROLLBACK');
	assert.equal(f.sqlite.prepare('SELECT count(*) n FROM student').get().n, 2);
	f.sqlite.exec(
		"INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level)VALUES('e2','MA-202610-000013','c','B',2026,1,1);UPDATE student SET enrollment_id='e2' WHERE id='MA-202610-000013';CREATE TABLE __drizzle_migrations(id integer,hash text,created_at integer);"
	);
	f.sqlite.exec(rollback);
	assert.equal(f.sqlite.prepare('SELECT count(*) n FROM applicant').get().n, 2);
	assert.deepEqual(f.sqlite.pragma('foreign_key_check'), []);
	f.apply();
	assert.equal(
		f.sqlite.prepare("SELECT address FROM student WHERE id='MA-202610-000013'").get().address,
		'Waiting Address'
	);
	assert.equal(f.sqlite.prepare('SELECT grade FROM enrollment_subject').get().grade, 2.5);
});

test('outstanding-subject suggestions use latest finalized results, deduplicate attempts and stay scoped to the student', async (t) => {
	const f = fixture(t);
	const created = await f.createStudent(personal);
	await f.enrollStudent(f.input(created));
	f.sqlite.exec('UPDATE enrollment SET finalized_grades=1; UPDATE enrollment_subject SET grade=5');
	assert.equal(f.getOutstandingSubjects(created.studentId).length, 2);
	const other = await f.createStudent({ ...personal, email: 'other@example.com' });
	const otherEnrollment = await f.enrollStudent(f.input(other));
	f.sqlite
		.prepare('UPDATE enrollment SET finalized_grades=1 WHERE id=?')
		.run(otherEnrollment.enrollmentId);
	f.sqlite
		.prepare('UPDATE enrollment_subject SET grade=1 WHERE enrollment_id=?')
		.run(otherEnrollment.enrollmentId);
	f.sqlite
		.prepare(
			"INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level,finalized_grades) VALUES('retake',?,'c','A',2026,2,1,1),('provisional',?,'c','A',2027,1,2,0)"
		)
		.run(created.studentId, created.studentId);
	f.sqlite
		.exec(`INSERT INTO enrollment_subject(id,enrollment_id,subject_id,source,subject_code,subject_name,units,grade,added_by) VALUES
		('passed-retake','retake','s1','extra','IS101','Introduction',3,3,'caller'),
		('failed-retake','retake','s2','extra','IS201','Programming',4.5,4,'caller'),
		('pending-retake','provisional','s2','extra','IS201','Programming',3,1,'caller')`);
	const failed = f.getOutstandingSubjects(created.studentId);
	assert.equal(failed.length, 1);
	assert.equal(failed[0].id, 's2');
	assert.equal(failed[0].grade, 4);
	assert.equal(failed[0].units, 4.5);
	assert.equal(failed[0].semester, 2);
	assert.deepEqual(f.getOutstandingSubjects(other.studentId), []);
	f.sqlite.exec("UPDATE enrollment_subject SET grade=NULL WHERE id='failed-retake'");
	assert.equal(f.getOutstandingSubjects(created.studentId).length, 1);
	assert.equal(f.getOutstandingSubjects(created.studentId)[0].grade, null);
	f.sqlite.exec("UPDATE enrollment_subject SET grade=3 WHERE id='failed-retake'");
	assert.deepEqual(f.getOutstandingSubjects(created.studentId), []);
});

test('enrollment page resolves existing student, program selection, and active curriculum', async (t) => {
	const f = fixture(t);
	const created = await f.createStudent(personal);
	const { load: page } = load('src/routes/user/students/[userId]/enroll/+page.server.ts', {
		'#lib/enrollment-grades.js': load('src/lib/enrollment-grades.ts'),
		'#lib/Roles.js': { Role },
		'#lib/schema.js': schema,
		'#lib/server/auth.js': { validateUser },
		'#lib/server/db/index.js': { db: f.db },
		'#lib/server/enrollment.js': load('src/lib/server/enrollment.ts', {
			'#lib/enrollment-grades.js': load('src/lib/enrollment-grades.ts'),
			'#lib/Roles.js': { Role },
			'#lib/schema.js': schema,
			'@sveltejs/kit': { error }
		}),
		'@sveltejs/kit': { error }
	});
	const event = {
		locals: { user: { id: 'caller', role: Role.REGISTRAR }, session: {} },
		params: { userId: created.userId },
		url: new URL('https://example.com/user/students/u/enroll')
	};
	assert.equal(page(event).plan, null);
	const selected = page({ ...event, url: new URL(event.url + '?programCode=BSIS') });
	assert.equal(selected.student.name, personal.name);
	assert.equal(selected.plan.curriculum.id, 'c');
	assert.equal(selected.plan.entries.length, 2);
	assert.deepEqual(selected.plan.outstandingSubjects, []);
	assert.equal(selected.student.section, '');
	const first = await f.enrollStudent(f.input(created, { section: 'D' }));
	f.sqlite
		.prepare('UPDATE enrollment SET finalized_grades=1,submitted_clearance=1 WHERE id=?')
		.run(first.enrollmentId);
	const next = page(event);
	assert.equal(next.programCode, 'BSIS');
	assert.equal(next.plan.curriculum.id, 'c');
	assert.equal(next.student.section, 'D');
	assert.equal(next.student.semester, 2);
	assert.equal(next.student.yearLevel, 1);
	assert.equal(next.schoolYearStart, 2026);
	f.sqlite.prepare('UPDATE enrollment SET semester=2 WHERE id=?').run(first.enrollmentId);
	const nextYear = page(event);
	assert.equal(nextYear.student.semester, 1);
	assert.equal(nextYear.student.yearLevel, 2);
	assert.equal(nextYear.schoolYearStart, 2027);
	assert.equal(nextYear.student.section, 'D');
	// Custom three-semester curricula advance to semester three before rolling over.
	f.sqlite.exec('UPDATE curriculum SET semesters=3');
	assert.equal(page(event).student.semester, 3);
	assert.equal(page(event).schoolYearStart, 2026);
	f.sqlite.exec("UPDATE program SET is_active=0 WHERE code='BSIS'");
	assert.equal(page(event).programCode, '');
	assert.equal(page(event).plan, null);
	assert.throws(() => page({ ...event, params: { userId: 'caller' } }), status(404));
	assert.throws(
		() => page({ ...event, locals: { user: { id: 'caller', role: Role.STUDENT }, session: {} } }),
		status(403)
	);
});

test('migration creates student records for older student accounts without applicants', (t) => {
	const f = legacy(t);
	f.sqlite.exec(
		"INSERT INTO user(id,name,email,role)VALUES('orphan','Older Student','orphan@example.com','student')"
	);
	f.apply();
	const record = f.sqlite.prepare("SELECT * FROM student WHERE user_id='orphan'").get();
	assert.match(record.id, /^MA-\d{6}-\d{6}$/);
	assert.equal(record.enrollment_id, null);
	assert.deepEqual(f.sqlite.pragma('foreign_key_check'), []);
});
test('student numbering starts at one in a new month even when the preceding month is full', async (t) => {
	const f = fixture(t);
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Asia/Manila',
		year: 'numeric',
		month: '2-digit'
	}).formatToParts(new Date());
	const year = Number(parts.find((p) => p.type === 'year').value),
		month = Number(parts.find((p) => p.type === 'month').value);
	f.db
		.insert(schema.studentSequence)
		.values({
			year: month === 1 ? year - 1 : year,
			month: month === 1 ? 12 : month - 1,
			lastNumber: 999999
		})
		.run();
	const created = await f.createStudent(personal);
	assert.equal(created.studentId.slice(-6), '000001');
});

test('student filters combine current enrollment fields without matching enrollment history', async (t) => {
	const f = fixture(t);
	const alice = await f.createStudent(personal);
	const bob = await f.createStudent({ ...personal, name: 'Bob', email: 'bob@example.com' });
	const waiting = await f.createStudent({
		...personal,
		name: 'Waiting Student',
		email: 'waiting@example.com'
	});
	f.sqlite.exec(
		"INSERT INTO program(id,code,name)VALUES('act','ACT','Computer Technology');INSERT INTO curriculum(id,program_code,name,published_at)VALUES('c2','ACT','ACT Curriculum',1000);UPDATE program SET active_curriculum_id='c2' WHERE code='ACT';"
	);
	await f.enrollStudent(f.input(alice));
	await f.enrollStudent(
		f.input(bob, {
			programCode: 'ACT',
			curriculumId: 'c2',
			yearLevel: 2,
			semester: 2,
			section: 'B'
		})
	);
	f.sqlite
		.prepare(
			"INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level)VALUES('historic',?,'c2','B',2025,2,2)"
		)
		.run(alice.studentId);
	const fields = load('src/lib/components/Filter/fields.ts');
	const academicFields = fields.filterFields(schema.studentEnrollmentFilterSchema);
	for (const field of academicFields) {
		assert.deepEqual(fields.filterKeys(field), [field.key]);
		assert.equal(field.group, 'Current enrollment');
	}
	assert.deepEqual(academicFields.find((field) => field.key === 'section').options, [
		'A',
		'B',
		'C',
		'D'
	]);
	const filters = load('src/lib/server/filters.ts', {
		'#lib/components/Filter/fields.js': fields,
		'@sveltejs/kit': { error }
	});
	const { load: page } = load('src/routes/user/students/+page.server.ts', {
		'#lib/Roles.js': { Role },
		'#lib/schema.js': schema,
		'#lib/server/auth.js': { validateUser },
		'#lib/server/db/index.js': { db: f.db },
		'#lib/server/filters.js': filters,
		'#lib/components/Table/TableValues.js': { MAX_ITEMS_PER_PAGE: 20 },
		'@sveltejs/kit': { error, redirect }
	});
	const request = (query) =>
		page({
			locals: { user: { id: 'caller', role: Role.REGISTRAR }, session: {} },
			url: new URL('https://example.com/user/students?' + query)
		});
	for (const [query, expected] of [
		['filter.programCode=ACT', [bob.userId]],
		['filter.programCode=AC', []],
		['filter.yearLevel=1', [alice.userId]],
		['filter.yearLevel=2', [bob.userId]],
		['filter.section=B', [bob.userId]],
		['filter.semester=2', [bob.userId]],
		['filter.hasCurrentEnrollment=No', [waiting.userId]],
		['filter.hasCurrentEnrollment=Yes', [bob.userId, alice.userId]],
		[
			'filter.programCode=BSIS&filter.yearLevel=1&filter.section=A&filter.semester=1&filter.hasCurrentEnrollment=Yes',
			[alice.userId]
		],
		['filter.programCode=BSIS&filter.hasCurrentEnrollment=No', []],
		['q=Waiting&filter.hasCurrentEnrollment=No', [waiting.userId]]
	]) {
		const result = await request(query);
		assert.deepEqual(
			result.users.map((u) => u.id),
			expected,
			query
		);
		assert.equal(result.total, expected.length, query);
	}
	f.sqlite.exec(
		"INSERT INTO program(id,code,name,is_active)VALUES('unused','UNUSED','Unused program',0)"
	);
	assert.deepEqual((await request('')).filterOptions, {
		programCode: ['ACT', 'BSIS', 'UNUSED'],
		yearLevel: ['1', '2'],
		semester: ['1', '2']
	});
	await assert.rejects(request('filter.semester=invalid'), status(400));
	await assert.rejects(request('filter.section=E'), status(400));
});
