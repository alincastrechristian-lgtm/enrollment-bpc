import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { HttpError, HandledHttpError } from '@sveltejs/kit/internal';
import { isHttpError } from '@sveltejs/kit';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { twoFactor } from 'better-auth/plugins/two-factor';

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
const deliveryModule = loadModule('src/lib/server/account-setup-email.ts');
const errorHelpers = loadModule('src/lib/errors.ts', { '@sveltejs/kit': { isHttpError } });
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

function fixture(
	t,
	{
		existingRole = null,
		callerRole = Role.ADMIN,
		raceRole = null,
		authFailure = null,
		mailFailure = null
	} = {}
) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	if (existingRole)
		db.insert(schema.user)
			.values({
				id: 'existing',
				name: 'Existing Account',
				firstName: 'Existing',
				lastName: 'Account',
				email: 'Taken@Example.com',
				role: existingRole
			})
			.run();
	const state = { creates: 0, invitations: 0, deletions: 0 };
	const auth = {
		api: {
			async createUser({ body }) {
				state.creates++;
				if (raceRole) {
					db.insert(schema.user)
						.values({
							id: 'winner',
							name: 'Concurrent Account',
							firstName: 'Concurrent',
							lastName: 'Account',
							email: body.email,
							role: raceRole
						})
						.run();
					throw { message: 'Email already exists' };
				}
				if (authFailure) throw authFailure;
				const created = {
					id: state.creates === 1 ? 'created' : `created-${state.creates}`,
					name: body.name,
					...body.data,
					email: body.email,
					role: body.role ?? Role.STUDENT
				};
				db.insert(schema.user).values(created).run();
				return { user: created };
			},
			async requestPasswordReset() {
				state.invitations++;
				if (mailFailure) throw mailFailure;
				deliveryModule.accountSetupEmailDelivery.getStore().sent = true;
			},
			async removeUser() {
				state.deletions++;
			}
		}
	};
	const dependencies = {
		'#lib/server/notifications.js': { recordNotification: () => {} },
		'#lib/server/email.js': { sendEmail: async () => true },
		'#lib/server/email-templates.js': {
			createEnrollmentConfirmationEmail: () => ({
				subject: 'Enrollment confirmed',
				text: 'Enrollment confirmed'
			})
		},
		'$app/env/private': { ORIGIN: 'https://example.com' },
		'$app/paths': { resolve: (path) => path },
		'#lib/enrollment-grades.js': loadModule('src/lib/enrollment-grades.ts'),
		'#lib/Roles.js': { Role },
		'#lib/schema.js': schema,
		'#lib/errors.js': errorHelpers,
		'#lib/server/auth.js': { auth, validateUser },
		'#lib/server/account-setup-email.js': deliveryModule,
		'../server/db': { db },
		'#lib/person-name.js': loadModule('src/lib/person-name.ts'),
		'#lib/students.js': loadModule('src/lib/students.ts', {
			'./person-name': loadModule('src/lib/person-name.ts'),
			'./student-demographics': loadModule('src/lib/student-demographics.ts')
		}),
		'@sveltejs/kit': { error, isHttpError: (cause) => Number.isInteger(cause?.status) },
		'$app/server': {
			command: (validation, handler) => async (input) => handler(validation.parse(input)),
			getRequestEvent: () => ({
				locals: {
					user: callerRole ? { id: 'caller', role: callerRole } : null,
					session: callerRole ? {} : null
				},
				request: { headers: new Headers() }
			})
		}
	};
	const enrollment = loadModule('src/lib/server/enrollment.ts', dependencies);
	dependencies['#lib/server/enrollment.js'] = enrollment;
	return { ...loadModule('src/lib/actions/user.remote.ts', dependencies), state, db, auth };
}
const registrarInput = { firstName: 'New', lastName: 'Registrar', email: 'TAKEN@example.com' };
const studentInput = {
	firstName: 'New',
	lastName: 'Student',
	birthDate: '2000-02-29',
	sex: 'female',
	email: 'taken@example.com',
	address: 'Bulacan',
	contactNumber: '0917'
};

for (const [role, label] of [
	[Role.STUDENT, 'A student'],
	[Role.REGISTRAR, 'A registrar'],
	[Role.ADMIN, 'An administrator']
]) {
	test(`registrar creation identifies an existing ${role} account without sending email`, async (t) => {
		const f = fixture(t, { existingRole: role });
		await assert.rejects(f.createRegistrar(registrarInput), {
			status: 409,
			message: `${label} account already exists with this email.`
		});
		assert.deepEqual(f.state, { creates: 0, invitations: 0, deletions: 0 });
		assert.equal(f.db.select().from(schema.user).all().length, 1);
	});
}
for (const role of [Role.STUDENT, Role.REGISTRAR]) {
	test(`enrollment identifies an existing ${role} account before any enrollment writes`, async (t) => {
		const f = fixture(t, { existingRole: role, callerRole: Role.REGISTRAR });
		await assert.rejects(f.createStudent(studentInput), {
			status: 409,
			message: `A ${role} account already exists with this email.`
		});
		assert.deepEqual(f.state, { creates: 0, invitations: 0, deletions: 0 });
		assert.equal(f.db.select().from(schema.enrollment).all().length, 0);
		assert.equal(f.db.select().from(schema.studentData).all().length, 0);
	});
	test(`simultaneous creation identifies the winning ${role} account`, async (t) => {
		const f = fixture(t, { raceRole: role });
		await assert.rejects(f.createRegistrar(registrarInput), {
			status: 409,
			message: `A ${role} account already exists with this email.`
		});
		assert.deepEqual(f.state, { creates: 1, invitations: 0, deletions: 0 });
		assert.equal(f.db.select().from(schema.user).all().length, 1);
	});
}

test('available email creates one registrar and sends one setup invitation', async (t) => {
	const f = fixture(t);
	const result = await f.createRegistrar(registrarInput);
	assert.equal(result.success, true);
	assert.equal(result.email, 'taken@example.com');
	assert.deepEqual(f.state, { creates: 1, invitations: 1, deletions: 0 });
	assert.equal(f.db.select().from(schema.user).get().role, Role.REGISTRAR);
});

test('unrelated auth failures hide provider details and send no invitation', async (t) => {
	const f = fixture(t, { authFailure: { message: 'SECRET database credentials' } });
	await assert.rejects(f.createRegistrar(registrarInput), {
		status: 500,
		message: 'Failed to create account. Please try again.'
	});
	assert.deepEqual(f.state, { creates: 1, invitations: 0, deletions: 0 });
});

test('setup email failures hide SMTP details', async (t) => {
	const f = fixture(t, { mailFailure: new Error('SECRET smtp credentials') });
	await assert.rejects(f.resendMagicLink({ email: 'taken@example.com' }), {
		status: 502,
		message: 'Failed to send account setup email. Please try again.'
	});
});

test('staff receive actual mail results even when Better Auth suppresses delivery errors', async (t) => {
	t.mock.method(console, 'error', () => {});
	const f = fixture(t);
	const names = loadModule('src/lib/person-name.ts');
	const deliveries = new Map();
	const { auth } = loadModule('src/lib/server/auth.ts', {
		'#lib/Roles.js': { Role },
		'#lib/server/db/index.js': { db: f.db },
		'$app/env/private': {
			ORIGIN: 'http://localhost:3000',
			BETTER_AUTH_SECRET: 'test-secret-with-at-least-thirty-two-characters'
		},
		'$app/server': {
			getRequestEvent: () => ({ locals: { user: { id: 'caller', role: Role.ADMIN } } })
		},
		'@sveltejs/kit': { error },
		'better-auth/minimal': { betterAuth },
		'better-auth/adapters/drizzle': { drizzleAdapter },
		'better-auth/plugins/admin': { admin },
		'better-auth/plugins/two-factor': { twoFactor },
		'better-auth/svelte-kit': { sveltekitCookies: () => ({ id: 'test-cookies' }) },
		'../auth-permissions': loadModule('src/lib/auth-permissions.ts'),
		'./auth-names': loadModule('src/lib/server/auth-names.ts', { '../person-name': names }),
		'./account-setup-email': deliveryModule,
		'./notifications': { recordNotification: () => {} },
		'./email': { sendEmail: (email) => deliveries.get(email) ?? Promise.resolve(false) },
		'./email-templates': {
			createFirstLoginEmail: () => ({ subject: 'Setup', text: 'Setup' }),
			createResetPasswordEmail: () => ({ subject: 'Reset', text: 'Reset' })
		}
	});
	f.auth.api.requestPasswordReset = auth.api.requestPasswordReset;

	const registrar = await f.createRegistrar(registrarInput);
	assert.equal(registrar.success, true);
	assert.equal(registrar.invitationSent, false);
	assert.equal(f.db.select().from(schema.user).all().length, 1);
	deliveries.set(registrar.email, Promise.reject(new Error('SECRET email provider error')));
	await assert.rejects(f.resendMagicLink({ email: registrar.email }), {
		status: 502,
		message: 'Failed to send account setup email. Please try again.'
	});

	f.db
		.insert(schema.user)
		.values({
			id: 'another',
			name: 'Another Student',
			firstName: 'Another',
			lastName: 'Student',
			email: 'another@example.com'
		})
		.run();
	let finish;
	deliveries.set(
		registrar.email,
		new Promise((resolve) => {
			finish = resolve;
		})
	);
	const sent = f.resendMagicLink({ email: registrar.email });
	await assert.rejects(f.resendMagicLink({ email: 'another@example.com' }), { status: 502 });
	finish(true);
	assert.equal((await sent).success, true);

	const student = await f.createStudent({ ...studentInput, email: 'student@example.com' });
	assert.equal(student.invitationSent, false);
	assert.equal(f.db.select().from(schema.studentData).all().length, 1);
});
for (const role of [Role.STUDENT, Role.REGISTRAR, null]) {
	test(`${role ?? 'anonymous'} cannot probe existing accounts through registrar creation`, async (t) => {
		const f = fixture(t, { callerRole: role, existingRole: Role.STUDENT });
		await assert.rejects(f.createRegistrar(registrarInput), { status: role ? 403 : 401 });
		assert.equal(f.state.creates, 0);
	});
}

test('only expected wrapped remote errors expose their public message', () => {
	const { getErrorMessage } = errorHelpers;
	assert.equal(
		getErrorMessage(
			{ status: 409, message: 'A student account already exists with this email.' },
			'Fallback'
		),
		'Fallback'
	);
	assert.equal(getErrorMessage(new Error('Network unavailable'), 'Fallback'), 'Fallback');
	for (const ErrorType of [HttpError, HandledHttpError]) {
		const message = 'A registrar account already exists with this email.';
		const remoteError = new ErrorType({ status: 409, message });
		assert.equal(remoteError instanceof Error, false);
		assert.equal('message' in remoteError, false);
		assert.equal(getErrorMessage(remoteError, 'Fallback'), message);
	}
	for (const value of [null, undefined, {}, 'unknown', { message: '' }, { message: 123 }])
		assert.equal(getErrorMessage(value, 'Fallback'), 'Fallback');
});
