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
						.values({ id: 'winner', name: 'Concurrent Account', email: body.email, role: raceRole })
						.run();
					throw { message: 'Email already exists' };
				}
				if (authFailure) throw authFailure;
				const created = {
					id: 'created',
					name: body.name,
					email: body.email,
					role: body.role ?? Role.STUDENT
				};
				db.insert(schema.user).values(created).run();
				return { user: created };
			},
			async requestPasswordReset() {
				state.invitations++;
				if (mailFailure) throw mailFailure;
			},
			async removeUser() {
				state.deletions++;
			}
		}
	};
	const dependencies = {
		'#lib/Roles.js': { Role },
		'#lib/schema.js': schema,
		'#lib/errors.js': errorHelpers,
		'#lib/server/auth.js': { auth, validateUser },
		'../server/db': { db },
		'#lib/applicants.js': loadModule('src/lib/applicants.ts'),
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
	dependencies['#lib/server/enrollment.js'] = {
		...enrollment,
		getEnrollmentPlan: () => ({
			applicant: { id: 'a', name: 'New Student', email: 'taken@example.com' },
			curriculum: { id: 'c' }
		})
	};
	return { ...loadModule('src/lib/actions/user.remote.ts', dependencies), state, db };
}
const registrarInput = { name: 'New Registrar', email: 'TAKEN@example.com' };
const studentInput = {
	applicantId: 'a',
	section: 'A',
	schoolYearStart: 2026,
	semester: 1,
	yearLevel: 1,
	subjects: [{ id: 's', units: 3 }]
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
		await assert.rejects(f.enrollStudent(studentInput), {
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
