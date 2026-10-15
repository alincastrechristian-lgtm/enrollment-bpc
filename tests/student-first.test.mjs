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
		'#lib/Roles.js': { Role },
		'#lib/schema.js': schema,
		'#lib/students.js': load('src/lib/students.ts'),
		'#lib/server/auth.js': { auth, validateUser },
		'../server/db': { db },
		'@sveltejs/kit': { error, isHttpError },
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
	const commands = load('src/lib/actions/user.remote.ts', deps);
	return {
		sqlite,
		db,
		state,
		...commands,
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
	const next = await f.enrollStudent({
		...input,
		currentEnrollmentId: first.enrollmentId,
		semester: 2
	});
	assert.notEqual(next.enrollmentId, first.enrollmentId);
	assert.equal(f.state.creates, 1);
	assert.equal(f.db.select().from(schema.enrollment).all().length, 2);
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
});

function legacy(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const migrations = readMigrationFiles({ migrationsFolder: 'drizzle' });
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

test('enrollment page resolves existing student, program selection, and active curriculum', async (t) => {
	const f = fixture(t);
	const created = await f.createStudent(personal);
	const { load: page } = load('src/routes/user/students/[userId]/enroll/+page.server.ts', {
		'#lib/Roles.js': { Role },
		'#lib/schema.js': schema,
		'#lib/server/auth.js': { validateUser },
		'#lib/server/db/index.js': { db: f.db },
		'#lib/server/enrollment.js': load('src/lib/server/enrollment.ts', {
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
