import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { isAPIError } from 'better-auth/api';
import { error, isHttpError, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import ts from 'typescript';

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
const names = load('src/lib/person-name.ts');
const schema = load('src/lib/schema.ts', {
	'#lib/Roles.js': roles,
	'./email': load('src/lib/email.ts')
});
const permissions = load('src/lib/auth-permissions.ts');
const { nameFields, nameHooks } = load('src/lib/server/auth-names.ts', { '../person-name': names });
const delivery = load('src/lib/server/email/account-setup.ts');
const status = (expected) => (cause) => isHttpError(cause) && cause.status === expected;

async function fixture(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	const invitations = [];
	const auth = betterAuth({
		baseURL: 'http://localhost:3000',
		secret: 'test-only-secret-with-at-least-thirty-two-characters',
		database: drizzleAdapter(db, { provider: 'sqlite' }),
		emailAndPassword: {
			enabled: true,
			sendResetPassword: async ({ user }) => {
				invitations.push(user.id);
				delivery.accountSetupEmailDelivery.getStore().sent = true;
			}
		},
		user: { additionalFields: nameFields },
		databaseHooks: { user: nameHooks },
		plugins: [
			admin({
				ac: permissions.ac,
				roles: {
					admin: permissions.adminRole,
					registrar: permissions.registrarRole,
					student: permissions.studentRole
				}
			})
		]
	});
	const ids = {};
	const password = 'Test-password-123';
	for (const [id, role] of [
		['owner', 'admin'],
		['other', 'admin'],
		['registrar', 'registrar'],
		['student', 'student']
	]) {
		const created = await auth.api.createUser({
			body: {
				name: id + ' Account',
				email: `${id}@example.com`,
				password,
				data: { firstName: id, lastName: 'Account' }
			}
		});
		ids[id] = created.user.id;
		db.update(schema.user).set({ role }).where(eq(schema.user.id, ids[id])).run();
	}
	async function signIn(id) {
		const response = await auth.api.signInEmail({
			body: { email: `${id}@example.com`, password },
			asResponse: true
		});
		assert.equal(response.status, 200);
		return new Headers({
			origin: 'http://localhost:3000',
			cookie: response.headers
				.getSetCookie()
				.map((value) => value.split(';')[0])
				.join('; ')
		});
	}
	const ownerHeaders = await signIn('owner');
	const state = {
		locals: { user: { id: ids.owner, role: 'admin' }, session: {} },
		headers: ownerHeaders
	};
	const validateUser = (locals, allowed) => {
		if (!locals.user || !locals.session) error(401, 'Unauthorized');
		if (!allowed.includes(locals.user.role)) error(403, 'Forbidden');
	};
	const actions = load('src/lib/actions/user.remote.ts', {
		'#lib/Roles.js': roles,
		'#lib/person-name.js': names,
		'#lib/schema.js': schema,
		'#lib/students.js': load('src/lib/students.ts', {
			'./person-name': names,
			'./student-demographics': load('src/lib/student-demographics.ts')
		}),
		'#lib/server/auth.js': { auth, validateUser },
		'#lib/server/email/account-setup.js': delivery,
		'../server/db': { db },
		'#lib/server/enrollment.js': { enrollStudentSchema: z.any() },
		'#lib/server/email/index.js': {},
		'#lib/server/email/templates.js': {},
		'#lib/server/notifications.js': {},
		'@sveltejs/kit': { error, isHttpError },
		'$app/env/private': { ORIGIN: 'http://localhost:3000' },
		'$app/paths': { resolve: (value) => value },
		'$app/server': {
			getRequestEvent: () => ({ locals: state.locals, request: { headers: state.headers } }),
			command: (validation, callback) => (input) => callback(validation.parse(input))
		}
	});
	const filters = load('src/lib/server/filters.ts', {
		'#lib/components/Filter/fields.js': load('src/lib/components/Filter/fields.ts'),
		'@sveltejs/kit': { error }
	});
	const { loadStaffAccounts } = load('src/lib/server/staff-accounts.ts', {
		'#lib/components/Table/TableValues.js': { MAX_ITEMS_PER_PAGE: 10 },
		'#lib/Roles.js': roles,
		'#lib/schema.js': schema,
		'#lib/server/filters.js': filters,
		'#lib/server/auth.js': { validateUser },
		'#lib/server/db/index.js': { db },
		'@sveltejs/kit': { redirect }
	});
	return {
		sqlite,
		db,
		auth,
		ids,
		state,
		invitations,
		signIn,
		...actions,
		list: (query = '') =>
			loadStaffAccounts(
				{ locals: state.locals, url: new URL('http://localhost:3000/user/admins' + query) },
				roles.Role.ADMIN
			),
		input: (id, changes = {}) => {
			const row = db.select().from(schema.user).where(eq(schema.user.id, id)).get();
			const original = Object.fromEntries(
				['name', 'firstName', 'middleName', 'lastName', 'email'].map((key) => [key, row[key]])
			);
			return { userId: id, ...original, ...changes, original };
		}
	};
}

test('admin listing, invitation, edit and resend enforce role boundaries', async (t) => {
	const f = await fixture(t);
	assert.deepEqual(
		new Set((await f.list()).users.map((user) => user.id)),
		new Set([f.ids.owner, f.ids.other])
	);
	assert.equal((await f.list('?q=other')).total, 1);
	assert.equal((await f.list()).currentUserId, f.ids.owner);
	const data = {
		firstName: 'New',
		middleName: '',
		lastName: 'Admin',
		email: 'new-admin@example.com'
	};
	for (const role of [null, 'student', 'registrar']) {
		f.state.locals = role ? { user: { id: f.ids[role], role }, session: {} } : {};
		await assert.rejects(f.list(), status(role ? 403 : 401));
		await assert.rejects(f.createAdmin(data), status(role ? 403 : 401));
		assert.throws(() => f.updateAdmin(f.input(f.ids.other)), status(role ? 403 : 401));
		assert.throws(() => f.deleteAdmin({ userId: f.ids.other }), status(role ? 403 : 401));
		await assert.rejects(
			f.setAdminDisabled({ userId: f.ids.other, disabled: true }),
			status(role ? 403 : 401)
		);
		await assert.rejects(
			f.resendMagicLink({ email: 'other@example.com' }),
			status(role ? 403 : 401)
		);
	}
	f.state.locals = { user: { id: f.ids.owner, role: 'admin' }, session: {} };
	const created = await f.createAdmin(data);
	assert.equal(created.invitationSent, true);
	assert.equal(
		f.db.select().from(schema.user).where(eq(schema.user.id, created.userId)).get().role,
		'admin'
	);
	await assert.rejects(f.createAdmin(data), status(409));
	await f.resendMagicLink({ email: data.email });
	assert.deepEqual(f.invitations, [created.userId, created.userId]);
	const stale = f.input(f.ids.other);
	f.updateAdmin(f.input(f.ids.other, { firstName: 'Updated' }));
	assert.throws(() => f.updateAdmin(stale), status(409));
	assert.throws(
		() => f.updateAdmin(f.input(f.ids.other, { email: 'owner@example.com' })),
		status(409)
	);
	for (const id of [f.ids.registrar, f.ids.student]) {
		assert.throws(() => f.updateAdmin(f.input(id)), status(404));
		assert.throws(() => f.deleteAdmin({ userId: id }), status(404));
		await assert.rejects(f.setAdminDisabled({ userId: id, disabled: true }), status(404));
	}
	const otherHeaders = await f.signIn('other');
	f.updateAdmin(f.input(f.ids.other, { email: 'changed@example.com' }));
	assert.equal(await f.auth.api.getSession({ headers: otherHeaders }), null);
	assert.equal(
		f.db.select().from(schema.verification).where(eq(schema.verification.value, f.ids.other)).all()
			.length,
		0
	);
	// Editing your own account is allowed.
	assert.equal(f.updateAdmin(f.input(f.ids.owner, { firstName: 'Owner' })).success, true);
});

test('admin access controls prevent self-disable/delete and preserve authored records', async (t) => {
	const f = await fixture(t);
	const otherHeaders = await f.signIn('other');
	assert.throws(() => f.deleteAdmin({ userId: f.ids.owner }), status(403));
	await assert.rejects(f.setAdminDisabled({ userId: f.ids.owner, disabled: true }), status(403));
	// Direct Better Auth endpoints must uphold the same self-account restriction.
	for (const invoke of [
		() => f.auth.api.banUser({ headers: f.state.headers, body: { userId: f.ids.owner } }),
		() => f.auth.api.removeUser({ headers: f.state.headers, body: { userId: f.ids.owner } }),
		() =>
			f.auth.api.adminUpdateUser({
				headers: f.state.headers,
				body: { userId: f.ids.owner, data: { banned: true } }
			})
	])
		await assert.rejects(invoke, (cause) => isAPIError(cause) && cause.statusCode === 400);
	assert.ok(await f.auth.api.getSession({ headers: f.state.headers }));
	await f.revokeAccountSessions({ userId: f.ids.other });
	assert.equal(await f.auth.api.getSession({ headers: otherHeaders }), null);
	const nextHeaders = await f.signIn('other');
	await f.setAdminDisabled({ userId: f.ids.other, disabled: true });
	assert.equal(await f.auth.api.getSession({ headers: nextHeaders }), null);
	await assert.rejects(f.signIn('other'));
	await f.setAdminDisabled({ userId: f.ids.other, disabled: false });
	await f.signIn('other');
	f.db
		.insert(schema.notification)
		.values({
			id: 'history',
			recipientId: f.ids.student,
			actorId: f.ids.other,
			type: 'account_setup',
			title: 'Preserve',
			message: 'Preserve history'
		})
		.run();
	await f.resendMagicLink({ email: 'other@example.com' });
	f.sqlite.exec(
		`CREATE TRIGGER fail_admin_delete BEFORE DELETE ON user WHEN OLD.id='${f.ids.other}' BEGIN SELECT RAISE(ABORT,'PRIVATE'); END;`
	);
	assert.throws(() => f.deleteAdmin({ userId: f.ids.other }), status(500));
	assert.ok(
		f.db.select().from(schema.verification).where(eq(schema.verification.value, f.ids.other)).get()
	);
	f.sqlite.exec('DROP TRIGGER fail_admin_delete');
	f.deleteAdmin({ userId: f.ids.other });
	assert.equal(
		f.db.select().from(schema.user).where(eq(schema.user.id, f.ids.other)).get(),
		undefined
	);
	assert.equal(
		f.db.select().from(schema.session).where(eq(schema.session.userId, f.ids.other)).all().length,
		0
	);
	assert.equal(
		f.db.select().from(schema.account).where(eq(schema.account.userId, f.ids.other)).all().length,
		0
	);
	assert.equal(
		f.db.select().from(schema.verification).where(eq(schema.verification.value, f.ids.other)).all()
			.length,
		0
	);
	assert.equal(
		f.db.select().from(schema.notification).where(eq(schema.notification.id, 'history')).get()
			.actorId,
		null
	);
	assert.deepEqual(f.sqlite.pragma('foreign_key_check'), []);
});
