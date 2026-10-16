import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadModule(filename, dependencies = {}, sourceOverride) {
	const source = sourceOverride ?? readFileSync(new URL('../' + filename, import.meta.url), 'utf8');
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => dependencies[id] ?? require(id), exports);
	return exports;
}
const { Role } = loadModule('src/lib/Roles.ts');
const schema = loadModule('src/lib/schema.ts', {
	'#lib/Roles.js': { Role },
	'./email': loadModule('src/lib/email.ts')
});
const authSource = readFileSync('src/lib/server/auth.ts', 'utf8');
const guard = ts
	.createSourceFile('auth.ts', authSource, ts.ScriptTarget.Latest, true)
	.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'validateUser')
	.getText();
const error = (status, message) => {
	throw Object.assign(new Error(message), { status });
};
const { validateUser } = loadModule(
	'',
	{ '@sveltejs/kit': { error } },
	"import {error} from '@sveltejs/kit';\n" + guard
);

function fixture(t, finalized = true) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	sqlite.pragma('foreign_keys = ON');
	sqlite.exec(`
		INSERT INTO user (id, name, email, role) VALUES
		('u', 'Maria Cruz', 'maria@example.com', 'student'),
		('other', 'Other Student', 'other@example.com', 'student'),
		('empty', 'New Student', 'new@example.com', 'student');
		INSERT INTO student (id, user_id) VALUES ('MA-001', 'u'), ('MA-002', 'other');
		INSERT INTO program (id, code, name) VALUES ('p', 'BSIS', 'Information Systems');
		INSERT INTO curriculum (id, program_code, name) VALUES ('c', 'BSIS', 'Curriculum');
		INSERT INTO enrollment (id, student_id, curriculum_id, section, school_year_start, semester, year_level, status, finalized_grades) VALUES
		('current', 'MA-001', 'c', 'B', 2026, 1, 2, 'enrolled', ${Number(finalized)}),
		('newer', 'MA-001', 'c', 'C', 2027, 1, 3, 'enrolled', 0),
		('private', 'MA-002', 'c', 'Z', 2026, 1, 1, 'enrolled', 1);
		UPDATE student SET enrollment_id = 'current' WHERE user_id = 'u';
		UPDATE student SET enrollment_id = 'private' WHERE user_id = 'other';
	`);
	for (const [index, grade] of [1, 2.99, 3, 3.01, 5, null].entries()) {
		sqlite
			.prepare('INSERT INTO subject (id, code, name) VALUES (?, ?, ?)')
			.run(`s${index}`, `S${index}`, `Subject ${index}`);
		sqlite
			.prepare(
				`INSERT INTO enrollment_subject (id, enrollment_id, subject_id, source, subject_code, subject_name, units, grade, added_by)
			VALUES (?, 'current', ?, 'extra', ?, ?, 3, ?, 'u')`
			)
			.run(`es${index}`, `s${index}`, `S${index}`, `Published subject ${index}`, grade);
	}
	sqlite
		.prepare(
			`INSERT INTO enrollment_subject (id, enrollment_id, subject_id, source, subject_code, subject_name, units, grade, added_by)
		VALUES ('private-subject', 'private', 's0', 'extra', 'SECRET', 'Private subject', 3, 5, 'other')`
		)
		.run();
	const dependencies = {
		'#lib/enrollment-grades.js': loadModule('src/lib/enrollment-grades.ts'),
		'#lib/Roles.js': { Role },
		'#lib/schema.js': schema,
		'#lib/server/db/index.js': { db },
		'#lib/server/auth.js': { validateUser },
		'@sveltejs/kit': { error }
	};
	dependencies['#lib/server/student-enrollment.js'] = loadModule(
		'src/lib/server/student-enrollment.ts',
		dependencies
	);
	dependencies['#lib/server/student-dashboard.js'] = loadModule(
		'src/lib/server/student-dashboard.ts',
		dependencies
	);
	dependencies['#lib/server/staff-dashboard.js'] = loadModule(
		'src/lib/server/staff-dashboard.ts',
		dependencies
	);
	const { load } = loadModule('src/routes/user/dashboard/+page.server.ts', dependencies);
	const historyLoad = loadModule('src/routes/user/enrollment/+page.server.ts', dependencies).load;
	const event = (id = 'u', role = Role.STUDENT) => ({
		locals: {
			user: role ? { id, role, name: id === 'u' ? 'Maria Cruz' : 'Other Student' } : null,
			session: role ? {} : null
		},
		params: { userId: 'other' },
		url: new URL('https://example.com/user/dashboard?userId=other')
	});
	return {
		sqlite,
		staff: (role, now) =>
			dependencies['#lib/server/staff-dashboard.js'].getStaffDashboard(role, now),
		load: (id, role) => load(event(id, role)),
		history: (id) => historyLoad(event(id))
	};
}

test('dashboard loads only the signed-in current enrollment and applies passing boundaries', async (t) => {
	const f = fixture(t);
	const { studentDashboard: data } = await f.load();
	assert.equal(data.studentName, 'Maria');
	assert.equal(data.studentNumber, 'MA-001');
	assert.equal(data.enrollment.schoolYear, '2026–2027');
	assert.equal(data.enrollment.section, 'B');
	assert.equal(data.enrollment.status, 'enrolled');
	assert.equal(data.enrollment.programCode, 'BSIS');
	assert.equal(data.enrollment.finalizedGrades, true);
	assert.deepEqual(
		data.subjects.map((subject) => subject.status),
		['Passed', 'Passed', 'Passed', 'Failed', 'Failed', 'Incomplete']
	);
	assert.deepEqual(
		data.subjects.map((subject) => subject.grade),
		['1.00', '2.99', '3.00', '3.01', '5.00', 'INC']
	);
	assert.equal(data.passedCount, 3);
	assert.equal(data.failedCount, 2);
	assert.equal(data.incompleteCount, 1);
	assert.equal(data.attentionCount, 3);
	assert.equal(data.totalUnits, 18);
	assert.match(data.nextSteps.find((step) => step.id === 'failed').detail, /S3, S4/);
	assert.match(data.nextSteps.find((step) => step.id === 'incomplete').detail, /S5/);
	assert.equal(JSON.stringify(data).includes('SECRET'), false);
	assert.equal('notifications' in data, false);
	assert.equal((await f.load('other')).studentDashboard.subjects[0].code, 'SECRET');
});

test('dashboard shows only the signed-in student meeting requests and keeps historical requests visible', async (t) => {
	const f = fixture(t);
	f.sqlite.exec(
		"UPDATE enrollment SET meeting_request_sent_at=1000 WHERE id IN ('current','private')"
	);
	let data = (await f.load()).studentDashboard;
	assert.equal(data.meetingRequests.length, 1);
	assert.equal(data.meetingRequests[0].id, 'current');
	assert.equal(data.meetingRequests[0].failedCount, 2);
	assert.equal(data.meetingRequests[0].incompleteCount, 1);
	assert.ok(data.nextSteps.some((step) => step.id === 'meeting'));
	f.sqlite.exec("UPDATE enrollment SET follow_up_completed_at=2000 WHERE id='current'");
	data = (await f.load()).studentDashboard;
	assert.deepEqual(data.meetingRequests, []);
	assert.equal(
		data.nextSteps.some((step) => step.id === 'meeting'),
		false
	);
	assert.equal(data.failedCount, 2);
	assert.equal(data.incompleteCount, 1);
	f.sqlite.exec("UPDATE enrollment SET follow_up_completed_at=NULL WHERE id='current'");
	f.sqlite.exec("UPDATE student SET enrollment_id='newer' WHERE user_id='u'");
	data = (await f.load()).studentDashboard;
	assert.equal(data.meetingRequests[0].id, 'current');
	f.sqlite.exec("UPDATE enrollment_subject SET grade=3 WHERE enrollment_id='current'");
	assert.deepEqual((await f.load()).studentDashboard.meetingRequests, []);
});

test('unfinalized grades are hidden from dashboard and history responses and produce no failure or INC alerts', async (t) => {
	const f = fixture(t, false);
	const { studentDashboard: data } = await f.load();
	assert.equal(data.enrollment.finalizedGrades, false);
	assert.ok(
		data.subjects.every((subject) => subject.grade === '—' && subject.status === 'Pending')
	);
	assert.equal(data.passedCount, null);
	assert.equal(data.failedCount, 0);
	assert.equal(data.incompleteCount, 0);
	assert.equal(data.attentionCount, 0);
	assert.deepEqual(
		data.nextSteps.map((step) => step.id),
		['grades']
	);
	const { record } = await f.history();
	assert.ok(
		record.enrollments
			.find((entry) => entry.id === 'current')
			.subjects.every((subject) => subject.grade === null)
	);
	assert.equal(
		record.enrollments.some((entry) => entry.id === 'private'),
		false
	);
});

test('missing student records and current links render empty data without selecting another enrollment', async (t) => {
	const f = fixture(t);
	for (const id of ['empty', 'u']) {
		if (id === 'u') f.sqlite.exec("UPDATE student SET enrollment_id = NULL WHERE user_id = 'u'");
		const { studentDashboard: data } = await f.load(id);
		assert.equal(data.enrollment, null);
		assert.deepEqual(data.subjects, []);
		assert.equal(data.totalUnits, 0);
		assert.equal(data.attentionCount, 0);
		assert.deepEqual(
			data.nextSteps.map((step) => step.id),
			['enrollment']
		);
	}
});

test('drop notifications stay scoped to the student and remain historical after reenrollment', async (t) => {
	const f = fixture(t);
	f.sqlite.exec(
		"UPDATE enrollment SET status='dropped',dropped_at=1000 WHERE id IN ('current','private')"
	);
	let data = (await f.load()).studentDashboard;
	assert.equal(data.droppedEnrollments.length, 1);
	assert.equal(data.droppedEnrollments[0].id, 'current');
	assert.equal(data.droppedEnrollments[0].isCurrent, true);
	assert.equal(data.enrollment.status, 'dropped');
	assert.ok(data.nextSteps.some((step) => step.id === 'dropped'));
	f.sqlite.exec("UPDATE student SET enrollment_id='newer' WHERE user_id='u'");
	data = (await f.load()).studentDashboard;
	assert.equal(data.droppedEnrollments[0].isCurrent, false);
	assert.equal(data.enrollment.schoolYear, '2027–2028');
	assert.deepEqual(data.subjects, []);
});

test('all-passing grades and completed enrollment status do not produce false concern alerts', async (t) => {
	const f = fixture(t);
	f.sqlite.exec(
		"UPDATE enrollment_subject SET grade = 3 WHERE enrollment_id = 'current'; UPDATE enrollment SET status = 'completed' WHERE id = 'current'"
	);
	const { studentDashboard: data } = await f.load();
	assert.equal(data.enrollment.status, 'completed');
	assert.equal(data.passedCount, 6);
	assert.equal(data.attentionCount, 0);
	assert.deepEqual(
		data.nextSteps.map((step) => step.id),
		['history']
	);
});

for (const role of [Role.ADMIN, Role.REGISTRAR]) {
	test(`${role} dashboard receives staff data instead of a student dashboard`, async (t) => {
		const f = fixture(t);
		const result = await f.load('u', role);
		assert.equal(result.studentDashboard, null);
		assert.equal(result.staffDashboard.overview.totalStudents, 3);
		assert.equal(result.staffDashboard.admin !== null, role === Role.ADMIN);
		assert.equal(JSON.stringify(result.staffDashboard).includes('SECRET'), false);
	});
}

test('staff totals follow current links and separate setup, completion, dropped records and historical follow-ups', (t) => {
	const f = fixture(t);
	const initial = f.staff(Role.REGISTRAR);
	assert.equal(initial.overview.activeStudents, 2);
	assert.equal(initial.programs[0].students, 2);
	f.sqlite.exec(`
		UPDATE user SET setup_complete=1 WHERE id IN ('u','other');
		UPDATE enrollment SET status='completed', submitted_clearance=1, meeting_request_sent_at=1000 WHERE id='current';
		UPDATE enrollment SET status='dropped' WHERE id='private';
		UPDATE enrollment SET finalized_grades=1 WHERE id='newer';
		INSERT INTO enrollment_subject (id,enrollment_id,subject_id,source,subject_code,subject_name,units,grade,added_by)
		VALUES ('historical-concern','newer','s0','extra','S0','Subject',3,5,'u');
	`);
	let data = f.staff(Role.ADMIN);
	assert.deepEqual(data.overview, {
		totalStudents: 3,
		activeStudents: 0,
		completedStudents: 1,
		droppedStudents: 1,
		withoutEnrollment: 1,
		awaitingGrades: 0,
		awaitingClearance: 0,
		readyForNextTerm: 0,
		setupPending: 1
	});
	assert.deepEqual(data.gradeResults, { passed: 3, failed: 2, incomplete: 1 });
	assert.deepEqual(data.followUpCount, { total: 2, sent: 1 });
	assert.deepEqual(data.queues.ready, []);
	assert.equal(data.admin.programs.missingCurriculum, 1);
	f.sqlite.exec("UPDATE enrollment SET follow_up_completed_at=2000 WHERE id='current'");
	data = f.staff(Role.REGISTRAR);
	assert.equal(data.admin, null);
	assert.equal(data.followUpCount.total, 1);
	assert.equal(data.queues.followUp[0].enrollmentId, 'newer');
	assert.equal(data.overview.readyForNextTerm, 1);
	assert.equal(data.queues.ready[0].enrollmentId, 'current');
	f.sqlite.exec("UPDATE enrollment_subject SET grade=3 WHERE enrollment_id='newer'");
	assert.equal(f.staff(Role.REGISTRAR).followUpCount.total, 0);
	f.sqlite.exec(
		"UPDATE enrollment SET status='enrolled',finalized_grades=0,submitted_clearance=0 WHERE id='current'"
	);
	data = f.staff(Role.REGISTRAR);
	assert.equal(data.overview.awaitingGrades, 1);
	assert.equal(data.queues.grades[0].enrollmentId, 'current');
	f.sqlite.exec("UPDATE user SET setup_complete=0 WHERE id='u'");
	assert.equal(f.staff(Role.REGISTRAR).overview.awaitingGrades, 0);
});

test('staff activity groups six Manila calendar months, including dropped events, and handles empty data', (t) => {
	const f = fixture(t);
	for (const [id, timestamp] of [
		['current', '2026-04-30T16:00:00Z'],
		['newer', '2026-05-31T16:00:00Z'],
		['private', '2026-09-30T16:00:00Z']
	])
		f.sqlite
			.prepare('UPDATE enrollment SET enrolled_at=? WHERE id=?')
			.run(Date.parse(timestamp), id);
	f.sqlite.exec("UPDATE enrollment SET status='dropped' WHERE id='private'");
	const now = new Date('2026-10-15T17:00:00Z');
	let data = f.staff(Role.ADMIN, now);
	assert.deepEqual(
		data.trend.map(({ key, total }) => [key, total]),
		[
			['2026-05', 1],
			['2026-06', 1],
			['2026-07', 0],
			['2026-08', 0],
			['2026-09', 0],
			['2026-10', 1]
		]
	);
	f.sqlite.exec(
		'UPDATE student SET enrollment_id=NULL; DELETE FROM enrollment_subject; DELETE FROM enrollment; DELETE FROM student; DELETE FROM user;'
	);
	data = f.staff(Role.ADMIN, now);
	assert.equal(data.overview.totalStudents, 0);
	assert.equal(data.overview.awaitingGrades, 0);
	assert.deepEqual(data.gradeResults, { passed: 0, failed: 0, incomplete: 0 });
	assert.ok(data.trend.every((entry) => entry.total === 0));
	assert.deepEqual(data.queues.setup, []);
	assert.deepEqual(data.recentEnrollments, []);
});

for (const role of [null, 'unknown']) {
	test(`dashboard rejects ${role ?? 'anonymous'} access`, async (t) => {
		const f = fixture(t);
		await assert.rejects(f.load('u', role), { status: role ? 403 : 401 });
	});
}
