import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
// Remote commands need SvelteKit request context. Inject that boundary while testing real SQL.
function loadTypeScript(filename, dependencies = {}, sourceOverride) {
	const source = sourceOverride ?? readFileSync(new URL('../' + filename, import.meta.url), 'utf8');
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => dependencies[id] ?? require(id), exports);
	return exports;
}
const { Role } = loadTypeScript('src/lib/Roles.ts');
const schema = loadTypeScript('src/lib/server/db/schema.ts', { '#lib/Roles.js': { Role } });
const documents = loadTypeScript('src/lib/applicants.ts');
const authSource = readFileSync(new URL('../src/lib/server/auth.ts', import.meta.url), 'utf8');
const validateUserSource = ts
	.createSourceFile('auth.ts', authSource, ts.ScriptTarget.Latest, true)
	.statements.find(
		(statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === 'validateUser'
	)
	.getText();

function fixture(t, role = Role.REGISTRAR) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	sqlite.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
   email_verified INTEGER NOT NULL DEFAULT 0, image TEXT, created_at INTEGER NOT NULL DEFAULT 0,
   updated_at INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL DEFAULT 'student', setup_complete INTEGER NOT NULL DEFAULT 0,
   banned INTEGER DEFAULT 0, ban_reason TEXT, ban_expires INTEGER, two_factor_enabled INTEGER DEFAULT 0);
  CREATE TABLE applicant (id TEXT PRIMARY KEY, user_id TEXT UNIQUE REFERENCES user(id) ON DELETE CASCADE,
   application_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, program TEXT NOT NULL, year_level INTEGER NOT NULL,
   date_applied INTEGER NOT NULL, email TEXT NOT NULL, contact_number TEXT NOT NULL, address TEXT NOT NULL,
   has_birth_certificate INTEGER NOT NULL DEFAULT 0, has_form_138 INTEGER NOT NULL DEFAULT 0,
   has_good_moral INTEGER NOT NULL DEFAULT 0, has_picture INTEGER NOT NULL DEFAULT 0,
   created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0);
 `);
	const db = drizzle(sqlite, { schema });
	db.insert(schema.applicant)
		.values({
			id: 'applicant-1',
			applicationId: '2026-000001',
			name: 'Stored Applicant',
			program: 'BSIS',
			yearLevel: 1,
			dateApplied: new Date(),
			email: 'stored@example.com',
			contactNumber: '09123456789',
			address: 'Bulacan',
			hasBirthCertificate: true,
			hasForm138: true,
			hasGoodMoral: true,
			hasPicture: true
		})
		.run();
	const state = { creations: 0, invitations: [], onCreate: undefined, invitationFails: false };
	const error = (status, message) => {
		throw Object.assign(new Error(message), { status });
	};
	const { validateUser } = loadTypeScript(
		'src/lib/server/auth.ts',
		{ '@sveltejs/kit': { error } },
		"import { error } from '@sveltejs/kit';\n" + validateUserSource
	);
	const auth = {
		api: {
			async createUser({ body }) {
				state.creations++;
				await Promise.resolve();
				const user = { id: crypto.randomUUID(), ...body, role: body.role ?? Role.STUDENT };
				db.insert(schema.user).values(user).run();
				await state.onCreate?.(user);
				return { user };
			},
			async requestPasswordReset({ body }) {
				assert.equal(body.redirectTo, '/first-login');
				state.invitations.push(body.email);
				if (state.invitationFails) throw new Error('Mail unavailable');
			}
		}
	};
	const commands = loadTypeScript('src/lib/actions/user.remote.ts', {
		'#lib/Roles.js': { Role },
		'#lib/applicants.js': documents,
		'#lib/schema.js': schema,
		'../server/db': { db },
		'#lib/server/auth.js': { auth, validateUser },
		'$app/server': {
			command: (validation, handler) => async (input) => handler(validation.parse(input)),
			getRequestEvent: () => ({
				locals: { user: role ? { role } : null, session: role ? {} : null },
				request: { headers: new Headers() }
			})
		},
		'@sveltejs/kit': { error }
	});
	return {
		...commands,
		db,
		state,
		record: () => db.select().from(schema.applicant).get(),
		users: () => db.select().from(schema.user).all()
	};
}

for (const role of [Role.ADMIN, Role.REGISTRAR]) {
	test(`${role} creates and links a student using stored applicant identity`, async (t) => {
		const f = fixture(t, role);
		const result = await f.createStudent({
			applicantId: 'applicant-1',
			name: 'Forged Name',
			email: 'forged@example.com'
		});
		assert.equal(result.invitationSent, true);
		const [student] = f.users();
		assert.equal(student.name, 'Stored Applicant');
		assert.equal(student.email, 'stored@example.com');
		assert.equal(student.role, Role.STUDENT);
		assert.equal(f.record().userId, student.id);
		assert.notEqual(f.record().userId, f.record().applicationId);
		assert.deepEqual(f.state.invitations, ['stored@example.com']);
		await assert.rejects(f.createStudent({ applicantId: 'applicant-1' }), { status: 409 });
		assert.equal(f.state.creations, 1);
	});
}
for (const role of [Role.STUDENT, null]) {
	test(`rejects ${role ?? 'anonymous'} before account creation`, async (t) => {
		const f = fixture(t, role);
		await assert.rejects(f.createStudent({ applicantId: 'applicant-1' }), {
			status: role ? 403 : 401
		});
		assert.equal(f.state.creations, 0);
	});
}
test('missing applicants and each missing document are rejected before account creation', async (t) => {
	const f = fixture(t);
	await assert.rejects(f.createStudent({ applicantId: 'missing' }), { status: 404 });
	for (const field of ['hasBirthCertificate', 'hasForm138', 'hasGoodMoral', 'hasPicture']) {
		f.db
			.update(schema.applicant)
			.set({ [field]: false })
			.run();
		await assert.rejects(f.createStudent({ applicantId: 'applicant-1' }), { status: 400 });
		f.db
			.update(schema.applicant)
			.set({ [field]: true })
			.run();
	}
	assert.equal(f.state.creations, 0);
});
test('invalid applicant identifiers cannot fall back to standalone creation', async (t) => {
	const f = fixture(t);
	await assert.rejects(
		f.createStudent({ applicantId: '', name: 'Fake Student', email: 'fake@example.com' })
	);
	assert.equal(f.state.creations, 0);
});
test('standalone student creation still works', async (t) => {
	const f = fixture(t);
	await f.createStudent({ name: 'Standalone Student', email: 'standalone@example.com' });
	assert.equal(f.users()[0].role, Role.STUDENT);
	assert.equal(f.record().userId, null);
});
test('concurrent requests create only one linked account', async (t) => {
	const f = fixture(t);
	const results = await Promise.allSettled([
		f.createStudent({ applicantId: 'applicant-1' }),
		f.createStudent({ applicantId: 'applicant-1' })
	]);
	assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
	assert.equal(f.users().length, 1);
	assert.equal(f.record().userId, f.users()[0].id);
	assert.equal(f.state.invitations.length, 1);
});
test('documents changing during creation cancel linking and remove only the new account', async (t) => {
	const f = fixture(t);
	f.state.onCreate = async () => f.db.update(schema.applicant).set({ hasPicture: false }).run();
	await assert.rejects(f.createStudent({ applicantId: 'applicant-1' }), { status: 409 });
	assert.equal(f.users().length, 0);
	assert.equal(f.record().userId, null);
	assert.equal(f.state.invitations.length, 0);
});
test('a competing link is preserved and the losing account is removed', async (t) => {
	const f = fixture(t);
	f.state.onCreate = async () => {
		f.db
			.insert(schema.user)
			.values({ id: 'winner', name: 'Existing Student', email: 'winner@example.com' })
			.run();
		f.db.update(schema.applicant).set({ userId: 'winner' }).run();
	};
	await assert.rejects(f.createStudent({ applicantId: 'applicant-1' }), { status: 409 });
	assert.equal(f.record().userId, 'winner');
	assert.deepEqual(
		f.users().map((user) => user.id),
		['winner']
	);
});
test('duplicate email leaves existing accounts and applicant unchanged', async (t) => {
	const f = fixture(t);
	f.db
		.insert(schema.user)
		.values({ id: 'existing', name: 'Existing User', email: 'stored@example.com' })
		.run();
	await assert.rejects(f.createStudent({ applicantId: 'applicant-1' }), { status: 400 });
	assert.equal(f.record().userId, null);
	assert.deepEqual(
		f.users().map((user) => user.id),
		['existing']
	);
});
test('invitation failure keeps the linked account and reports partial success', async (t) => {
	const f = fixture(t);
	f.state.invitationFails = true;
	assert.deepEqual(await f.createStudent({ applicantId: 'applicant-1' }), {
		success: true,
		invitationSent: false
	});
	assert.equal(f.record().userId, f.users()[0].id);
	await assert.rejects(f.createStudent({ applicantId: 'applicant-1' }), { status: 409 });
	assert.equal(f.users().length, 1);
});

test('identity changes during creation cancel linking without leaving a new account', async (t) => {
	for (const changes of [{ name: 'Changed Applicant' }, { email: 'changed@example.com' }]) {
		const f = fixture(t);
		f.state.onCreate = async () => f.db.update(schema.applicant).set(changes).run();
		await assert.rejects(f.createStudent({ applicantId: 'applicant-1' }), { status: 409 });
		assert.equal(f.users().length, 0);
		assert.equal(f.record().userId, null);
	}
});
test('registrar creation retains admin-only access and correct role', async (t) => {
	const admin = fixture(t, Role.ADMIN);
	await admin.createRegistrar({ name: 'New Registrar', email: 'registrar@example.com' });
	assert.equal(admin.users()[0].role, Role.REGISTRAR);
	const registrar = fixture(t, Role.REGISTRAR);
	await assert.rejects(
		registrar.createRegistrar({ name: 'New Registrar', email: 'registrar@example.com' }),
		{ status: 403 }
	);
	assert.equal(registrar.state.creations, 0);
});
