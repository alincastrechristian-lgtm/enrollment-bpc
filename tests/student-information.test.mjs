import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { error, isHttpError } from '@sveltejs/kit';
import { z } from 'zod';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(file, dependencies = {}, source = readFileSync(file, 'utf8')) {
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => dependencies[id] ?? require(id), exports);
	return exports;
}
const roles = load('src/lib/Roles.ts');
const personNames = load('src/lib/person-name.ts');
const { nameFields, nameHooks } = load('src/lib/server/auth-names.ts', {
	'../person-name': personNames
});
const schema = load('src/lib/schema.ts', {
	'#lib/Roles.js': roles,
	'./email': load('src/lib/email.ts')
});
const students = load('src/lib/students.ts', {
	'./person-name': personNames,
	'./student-demographics': load('src/lib/student-demographics.ts')
});
const guard = ts
	.createSourceFile(
		'auth.ts',
		readFileSync('src/lib/server/auth.ts', 'utf8'),
		ts.ScriptTarget.Latest,
		true
	)
	.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'validateUser')
	.getText();
const { validateUser } = load(
	'src/lib/server/auth.ts',
	{ '@sveltejs/kit': { error } },
	`import {error} from '@sveltejs/kit';\n${guard}`
);
const status = (code) => (cause) => isHttpError(cause, code);

async function fixture(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	sqlite.pragma('foreign_keys=ON');
	const auth = betterAuth({
		baseURL: 'http://localhost:3000',
		secret: 'test-secret-with-at-least-thirty-two-characters',
		database: drizzleAdapter(db, { provider: 'sqlite' }),
		emailAndPassword: { enabled: true },
		user: { additionalFields: nameFields },
		databaseHooks: { user: nameHooks },
		plugins: [admin({ defaultRole: 'student' })]
	});
	const password = 'TestPassword123!';
	const { user: target } = await auth.api.createUser({
		body: {
			name: 'Ignored',
			email: 'ana@example.com',
			password,
			data: { firstName: 'Ana', middleName: '', lastName: 'Student' }
		}
	});
	sqlite.prepare('UPDATE user SET email_verified=1,setup_complete=1 WHERE id=?').run(target.id);
	sqlite
		.prepare(
			'INSERT INTO student(id,user_id,address,contact_number,birth_date,sex) VALUES(?,?,?,?,?,?)'
		)
		.run('MA-202610-000001', target.id, 'Malolos', '09123456789', '2000-02-29', 'female');
	sqlite.exec(`
		INSERT INTO user(id,name,first_name,last_name,email,role) VALUES('admin','Admin User','Admin','User','admin@example.com','admin'),('registrar','Registrar User','Registrar','User','STAFF@EXAMPLE.COM','registrar'),('orphan','No student profile','No','student profile','orphan@example.com','student');
		INSERT INTO program(id,code,name) VALUES('p','BSIS','Information Systems');
		INSERT INTO curriculum(id,program_code,name) VALUES('c','BSIS','Curriculum');
		INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level) VALUES('e','MA-202610-000001','c','A',2026,1,1);
		UPDATE student SET enrollment_id='e';
		INSERT INTO subject(id,code,name) VALUES('s','IS101','Subject');
		INSERT INTO enrollment_subject(id,enrollment_id,subject_id,source,subject_code,subject_name,units,grade) VALUES('es','e','s','extra','IS101','Snapshot',2.5,1.25);
	`);
	for (const [id, identifier, value] of [
		['reset', 'reset-password:target-token', target.id],
		['other-reset', 'reset-password:staff-token', 'registrar'],
		['unrelated', 'email-verification:target', target.id]
	])
		sqlite
			.prepare('INSERT INTO verification(id,identifier,value,expires_at) VALUES(?,?,?,?)')
			.run(id, identifier, value, Date.now() + 600000);
	const state = { locals: { user: { id: 'admin', role: 'admin' }, session: {} } };
	const { updateStudent, updateRegistrar } = load('src/lib/actions/user.remote.ts', {
		'#lib/Roles.js': roles,
		'#lib/person-name.js': personNames,
		'#lib/schema.js': schema,
		'#lib/students.js': students,
		'#lib/server/auth.js': { auth, validateUser },
		'#lib/server/account-setup-email.js': load('src/lib/server/account-setup-email.ts'),
		'../server/db': { db },
		'#lib/server/enrollment.js': { enrollStudentSchema: z.any() },
		'#lib/server/email.js': {},
		'#lib/server/email-templates.js': {},
		'#lib/server/notifications.js': {},
		'@sveltejs/kit': { error, isHttpError },
		'$app/env/private': { ORIGIN: 'http://localhost:3000' },
		'$app/paths': { resolve: (path) => path },
		'$app/server': {
			getRequestEvent: () => ({ locals: state.locals }),
			command: (validation, fn) => (data) => fn(validation.parse(data))
		}
	});
	const snapshot = () =>
		sqlite
			.prepare(
				'SELECT user.name,user.first_name AS firstName,user.middle_name AS middleName,user.last_name AS lastName,user.email,student.address,student.contact_number AS contactNumber,student.birth_date AS birthDate,student.sex FROM user INNER JOIN student ON student.user_id=user.id WHERE user.id=?'
			)
			.get(target.id);
	const input = (changes = {}) => ({
		...snapshot(),
		userId: target.id,
		original: snapshot(),
		...changes
	});
	async function signIn(email = 'ana@example.com') {
		const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
		assert.equal(response.status, 200);
		return new Headers({
			cookie: response.headers
				.getSetCookie()
				.map((value) => value.split(';')[0])
				.join('; ')
		});
	}
	return {
		sqlite,
		auth,
		state,
		target,
		updateStudent,
		updateRegistrar,
		input,
		snapshot,
		signIn,
		password
	};
}

for (const role of ['admin', 'registrar']) {
	test(`${role} updates required details, clears optional middle name, and preserves academic/auth state for unchanged email`, async (t) => {
		const f = await fixture(t);
		f.state.locals = { user: { id: role, role }, session: {} };
		const headers = await f.signIn();
		const before = {
			user: f.sqlite
				.prepare('SELECT role,setup_complete,banned,email_verified FROM user WHERE id=?')
				.get(f.target.id),
			profile: f.sqlite.prepare('SELECT id,user_id,enrollment_id,created_at FROM student').get(),
			account: f.sqlite.prepare('SELECT * FROM account').all(),
			sessions: f.sqlite.prepare('SELECT * FROM session').all(),
			tokens: f.sqlite.prepare('SELECT * FROM verification').all(),
			enrollments: f.sqlite.prepare('SELECT * FROM enrollment').all(),
			subjects: f.sqlite.prepare('SELECT * FROM enrollment_subject').all()
		};
		const result = f.updateStudent(
			f.input({
				name: 'Ignored forged composed name',
				firstName: ' Ana ',
				middleName: '',
				lastName: ' Updated ',
				address: 'New address',
				contactNumber: '09999999999',
				birthDate: '2001-01-01',
				sex: 'male',
				email: 'ANA@EXAMPLE.COM',
				role: 'admin',
				setupComplete: false,
				banned: true,
				studentId: 'CHANGED'
			})
		);
		assert.deepEqual(result, { success: true, userId: f.target.id, emailChanged: false });
		assert.deepEqual(f.snapshot(), {
			name: 'Ana Updated',
			firstName: 'Ana',
			middleName: '',
			lastName: 'Updated',
			email: 'ana@example.com',
			address: 'New address',
			contactNumber: '09999999999',
			birthDate: '2001-01-01',
			sex: 'male'
		});
		assert.deepEqual(
			f.sqlite
				.prepare('SELECT role,setup_complete,banned,email_verified FROM user WHERE id=?')
				.get(f.target.id),
			before.user
		);
		assert.deepEqual(
			f.sqlite.prepare('SELECT id,user_id,enrollment_id,created_at FROM student').get(),
			before.profile
		);
		for (const [table, saved] of [
			['account', before.account],
			['session', before.sessions],
			['verification', before.tokens],
			['enrollment', before.enrollments],
			['enrollment_subject', before.subjects]
		])
			assert.deepEqual(f.sqlite.prepare(`SELECT * FROM ${table}`).all(), saved);
		assert.equal((await f.auth.api.getSession({ headers })).user.name, 'Ana Updated');
		assert.deepEqual(f.sqlite.pragma('foreign_key_check'), []);
	});

	test(`${role} email correction changes real Better Auth login, clears target sessions/reset tokens, and preserves password`, async (t) => {
		const f = await fixture(t);
		f.state.locals = { user: { id: role, role }, session: {} };
		const headers = await f.signIn();
		const credential = f.sqlite.prepare('SELECT * FROM account WHERE user_id=?').get(f.target.id);
		const otherSession = {
			id: 'staff-session',
			userId: 'registrar',
			token: 'staff-token',
			expiresAt: Date.now() + 600000
		};
		f.sqlite
			.prepare('INSERT INTO session(id,user_id,token,expires_at,updated_at) VALUES(?,?,?,?,?)')
			.run(
				otherSession.id,
				otherSession.userId,
				otherSession.token,
				otherSession.expiresAt,
				Date.now()
			);
		assert.equal(f.updateStudent(f.input({ email: 'CORRECTED@EXAMPLE.COM' })).emailChanged, true);
		assert.equal(f.snapshot().email, 'corrected@example.com');
		assert.equal(
			f.sqlite.prepare('SELECT email_verified FROM user WHERE id=?').get(f.target.id)
				.email_verified,
			0
		);
		assert.equal(await f.auth.api.getSession({ headers }), null);
		assert.equal(
			f.sqlite.prepare('SELECT count(*) AS count FROM session WHERE user_id=?').get(f.target.id)
				.count,
			0
		);
		assert.ok(f.sqlite.prepare('SELECT id FROM session WHERE id=?').get(otherSession.id));
		assert.deepEqual(
			f.sqlite
				.prepare('SELECT id FROM verification ORDER BY id')
				.all()
				.map((row) => row.id),
			['other-reset', 'unrelated']
		);
		assert.deepEqual(
			f.sqlite.prepare('SELECT * FROM account WHERE user_id=?').get(f.target.id),
			credential
		);
		await assert.rejects(
			f.auth.api.signInEmail({ body: { email: 'ana@example.com', password: f.password } })
		);
		const correctedSession = await f.signIn('corrected@example.com');
		assert.equal((await f.auth.api.getSession({ headers: correctedSession })).user.id, f.target.id);
	});
}

test('denied, stale, duplicate, invalid and failed updates preserve full records and never expose database diagnostics', async (t) => {
	const f = await fixture(t);
	const input = f.input({
		email: 'new@example.com',
		firstName: 'New',
		lastName: 'Name',
		address: 'New address'
	});
	for (const role of [null, 'student']) {
		f.state.locals = role ? { user: { id: 'registrar', role }, session: {} } : {};
		assert.throws(() => f.updateStudent(input), status(role ? 403 : 401));
	}
	f.state.locals = { user: { id: 'admin', role: 'admin' }, session: {} };
	for (const userId of ['admin', 'registrar', 'orphan', 'missing'])
		assert.throws(() => f.updateStudent({ ...input, userId }), status(404));
	for (const changes of [
		{ birthDate: '2001-02-29' },
		{ birthDate: '2999-01-01' },
		{ birthDate: null },
		{ birthDate: undefined },
		{ sex: 'other' },
		{ sex: null },
		{ sex: undefined },
		{ firstName: '' },
		{ lastName: undefined }
	])
		assert.throws(() => f.updateStudent({ ...input, ...changes }), z.ZodError);
	assert.throws(() => f.updateStudent({ ...input, email: 'staff@example.com' }), status(409));
	assert.throws(
		() => f.updateStudent({ ...input, original: { ...input.original, address: 'Stale address' } }),
		status(409)
	);
	assert.deepEqual(f.snapshot(), input.original);
	await f.signIn();
	const tables = [
		'user',
		'student',
		'account',
		'session',
		'verification',
		'enrollment',
		'enrollment_subject'
	];
	const saved = tables.map((table) => f.sqlite.prepare(`SELECT * FROM ${table}`).all());
	f.sqlite.exec(
		"CREATE TRIGGER fail_reset_cleanup BEFORE DELETE ON verification WHEN OLD.id='reset' BEGIN SELECT RAISE(ABORT,'SECRET database failure'); END"
	);
	t.mock.method(console, 'error', () => {});
	assert.throws(
		() => f.updateStudent(input),
		(cause) => status(500)(cause) && !cause.body.message.includes('SECRET')
	);
	for (const [index, table] of tables.entries())
		assert.deepEqual(f.sqlite.prepare(`SELECT * FROM ${table}`).all(), saved[index], table);
	assert.deepEqual(f.sqlite.pragma('foreign_key_check'), []);
});

test('auth derives names from required parts and denies self-service name changes', async (t) => {
	const f = await fixture(t);
	assert.equal(f.snapshot().name, 'Ana Student');
	const headers = await f.signIn();
	await assert.rejects(f.auth.api.updateUser({ headers, body: { name: 'Self rename' } }));
	assert.equal(f.snapshot().name, 'Ana Student');
	await assert.rejects(
		f.auth.api.createUser({
			body: {
				name: 'Missing required parts',
				email: 'missing@example.com',
				data: { firstName: 'Missing' }
			}
		})
	);
	await assert.rejects(
		f.auth.api.signUpEmail({
			body: {
				name: 'Self signup',
				email: 'signup@example.com',
				password: f.password,
				firstName: 'Self',
				lastName: 'Signup'
			}
		})
	);
	assert.equal(
		f.sqlite
			.prepare('SELECT count(*) AS count FROM user WHERE email IN (?,?)')
			.get('missing@example.com', 'signup@example.com').count,
		0
	);
});

test('only admin edits registrars; role, stale and duplicate guards preserve records', async (t) => {
	const f = await fixture(t);
	const snapshot = () =>
		f.sqlite
			.prepare(
				'SELECT name,first_name AS firstName,middle_name AS middleName,last_name AS lastName,email FROM user WHERE id=?'
			)
			.get('registrar');
	const original = snapshot();
	const input = {
		...original,
		userId: 'registrar',
		original,
		firstName: ' Vera ',
		middleName: ' Lee ',
		lastName: ' Santos ',
		name: 'Forged name'
	};
	for (const role of [null, 'student', 'registrar']) {
		f.state.locals = role ? { user: { id: role, role }, session: {} } : {};
		assert.throws(() => f.updateRegistrar(input), status(role ? 403 : 401));
	}
	f.state.locals = { user: { id: 'admin', role: 'admin' }, session: {} };
	for (const userId of ['admin', f.target.id, 'orphan', 'missing'])
		assert.throws(() => f.updateRegistrar({ ...input, userId }), status(404));
	assert.throws(
		() => f.updateRegistrar({ ...input, original: { ...original, firstName: 'Stale' } }),
		status(409)
	);
	assert.throws(() => f.updateRegistrar({ ...input, email: 'ANA@EXAMPLE.COM' }), status(409));
	assert.deepEqual(snapshot(), original);
	assert.deepEqual(f.updateRegistrar(input), {
		success: true,
		userId: 'registrar',
		emailChanged: false
	});
	assert.deepEqual(snapshot(), {
		name: 'Vera Lee Santos',
		firstName: 'Vera',
		middleName: 'Lee',
		lastName: 'Santos',
		email: 'staff@example.com'
	});
	assert.throws(() => f.updateRegistrar(input), status(409));
	f.sqlite
		.prepare('INSERT INTO session(id,user_id,token,expires_at,updated_at) VALUES(?,?,?,?,?)')
		.run('registrar-session', 'registrar', 'registrar-token', Date.now() + 600000, Date.now());
	const before = snapshot();
	assert.equal(
		f.updateRegistrar({
			...before,
			userId: 'registrar',
			original: before,
			email: 'corrected-staff@example.com',
			middleName: ''
		}).emailChanged,
		true
	);
	assert.equal(snapshot().name, 'Vera Santos');
	assert.equal(
		f.sqlite.prepare('SELECT count(*) AS count FROM session WHERE user_id=?').get('registrar')
			.count,
		0
	);
	assert.equal(
		f.sqlite.prepare('SELECT id FROM verification WHERE id=?').get('other-reset'),
		undefined
	);
	assert.ok(f.sqlite.prepare('SELECT id FROM verification WHERE id=?').get('reset'));
});
