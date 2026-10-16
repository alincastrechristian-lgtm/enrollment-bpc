import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { isAPIError } from 'better-auth/api';
import { error, isHttpError } from '@sveltejs/kit';
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
const schema = load('src/lib/schema.ts', {
	'#lib/Roles.js': roles,
	'./email': load('src/lib/email.ts')
});
const permissions = load('src/lib/auth-permissions.ts');

test('account access actions enforce role boundaries, revoke sessions, and ban/unban through Better Auth', async (t) => {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	const baseURL = 'http://localhost:3000';
	const auth = betterAuth({
		baseURL,
		secret: 'test-secret-with-at-least-thirty-two-characters',
		database: drizzleAdapter(db, { provider: 'sqlite' }),
		emailAndPassword: { enabled: true },
		plugins: [
			admin({
				ac: permissions.ac,
				roles: {
					admin: permissions.adminRole,
					registrar: permissions.registrarRole,
					student: permissions.studentRole
				},
				defaultRole: 'student'
			})
		]
	});
	const password = 'TestPassword123!';
	const owner = await auth.api.signUpEmail({
		body: { name: 'Admin', email: 'admin@example.com', password }
	});
	const target = await auth.api.signUpEmail({
		body: { name: 'Registrar', email: 'registrar@example.com', password }
	});
	const student = await auth.api.signUpEmail({
		body: { name: 'Student', email: 'student@example.com', password }
	});
	db.update(schema.user).set({ role: 'admin' }).where(eq(schema.user.id, owner.user.id)).run();
	db.update(schema.user).set({ role: 'registrar' }).where(eq(schema.user.id, target.user.id)).run();
	async function signIn(email) {
		const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
		assert.equal(response.status, 200);
		const cookie = response.headers
			.getSetCookie()
			.map((value) => value.split(';')[0])
			.join('; ');
		return new Headers({ origin: baseURL, cookie });
	}
	const adminHeaders = await signIn('admin@example.com');
	let headers = adminHeaders;
	let registrarHeaders = await signIn('registrar@example.com');
	const studentHeaders = await signIn('student@example.com');
	let locals = { user: { id: owner.user.id, role: 'admin' }, session: {} };
	const guard = (value, allowed) => {
		if (!value.user || !value.session) error(401, 'Unauthorized');
		if (!allowed.includes(value.user.role)) error(403, 'Forbidden');
	};
	const dependencies = {
		'#lib/Roles.js': roles,
		'#lib/schema.js': schema,
		'#lib/students.js': load('src/lib/students.ts'),
		'#lib/server/auth.js': { auth, validateUser: guard },
		'../server/db': { db },
		'#lib/server/enrollment.js': { enrollStudentSchema: z.any() },
		'#lib/server/email.js': {},
		'#lib/server/email-templates.js': {},
		'#lib/server/notifications.js': {},
		'@sveltejs/kit': { error, isHttpError },
		'$app/env/private': { ORIGIN: baseURL },
		'$app/paths': { resolve: (path) => path },
		'$app/server': {
			getRequestEvent: () => ({ locals, request: { headers } }),
			command: (validation, fn) => (data) => fn(validation.parse(data))
		}
	};
	const { setRegistrarDisabled, revokeAccountSessions } = load(
		'src/lib/actions/user.remote.ts',
		dependencies
	);
	for (const role of [null, 'student']) {
		locals = role ? { user: { id: student.user.id, role }, session: {} } : {};
		await assert.rejects(
			revokeAccountSessions({ userId: student.user.id }),
			(cause) => isHttpError(cause) && cause.status === (role ? 403 : 401)
		);
	}
	headers = registrarHeaders;
	locals = { user: { id: target.user.id, role: 'registrar' }, session: {} };
	await assert.rejects(
		revokeAccountSessions({ userId: target.user.id }),
		(cause) => isHttpError(cause) && cause.status === 403
	);
	await assert.rejects(
		revokeAccountSessions({ userId: owner.user.id }),
		(cause) => isHttpError(cause) && cause.status === 404
	);
	await revokeAccountSessions({ userId: student.user.id });
	assert.equal(await auth.api.getSession({ headers: studentHeaders }), null);
	assert.equal(
		db.select().from(schema.session).where(eq(schema.session.userId, student.user.id)).all().length,
		0
	);
	assert.equal(
		db.select().from(schema.user).where(eq(schema.user.id, student.user.id)).get().banned,
		false
	);
	await signIn('student@example.com');
	headers = adminHeaders;
	locals = { user: { id: owner.user.id, role: 'admin' }, session: {} };
	await revokeAccountSessions({ userId: target.user.id });
	assert.equal(await auth.api.getSession({ headers: registrarHeaders }), null);
	registrarHeaders = await signIn('registrar@example.com');
	await revokeAccountSessions({ userId: student.user.id });
	assert.equal(
		db.select().from(schema.session).where(eq(schema.session.userId, student.user.id)).all().length,
		0
	);
	for (const userId of [owner.user.id, 'missing'])
		await assert.rejects(
			revokeAccountSessions({ userId }),
			(cause) => isHttpError(cause) && cause.status === 404
		);
	for (const role of [null, 'student', 'registrar']) {
		locals = role ? { user: { id: target.user.id, role }, session: {} } : {};
		await assert.rejects(
			setRegistrarDisabled({ userId: target.user.id, disabled: true }),
			(cause) => isHttpError(cause) && cause.status === (role ? 403 : 401)
		);
	}
	locals = { user: { id: owner.user.id, role: 'admin' }, session: {} };
	for (const userId of [owner.user.id, 'missing'])
		await assert.rejects(
			setRegistrarDisabled({ userId, disabled: true }),
			(cause) => isHttpError(cause) && cause.status === 404
		);
	await setRegistrarDisabled({ userId: target.user.id, disabled: true });
	const saved = db.select().from(schema.user).where(eq(schema.user.id, target.user.id)).get();
	assert.equal(saved.banned, true);
	assert.equal(saved.banExpires, null);
	assert.equal(
		db.select().from(schema.session).where(eq(schema.session.userId, target.user.id)).all().length,
		0
	);
	assert.equal(await auth.api.getSession({ headers: registrarHeaders }), null);
	await assert.rejects(
		auth.api.signInEmail({ body: { email: 'registrar@example.com', password } }),
		(cause) => isAPIError(cause) && cause.body.code === 'BANNED_USER'
	);
	await setRegistrarDisabled({ userId: target.user.id, disabled: false });
	assert.equal(
		db.select().from(schema.user).where(eq(schema.user.id, target.user.id)).get().banned,
		false
	);
	await signIn('registrar@example.com');
	assert.equal(await auth.api.getSession({ headers: registrarHeaders }), null);
	const { getAuthErrorMessage } = load('src/lib/errors.ts', { '@sveltejs/kit': { isHttpError } });
	assert.equal(
		getAuthErrorMessage({ code: 'BANNED_USER', message: 'PRIVATE ban reason' }, 'Failed'),
		'This account is disabled. Contact an administrator.'
	);
});
