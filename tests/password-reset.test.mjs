import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadTypeScript(file, dependencies = {}) {
	const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2022,
			esModuleInterop: false
		}
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => dependencies[id] ?? require(id), exports);
	return exports;
}
const { Role } = loadTypeScript('src/lib/Roles.ts');
const schema = loadTypeScript('src/lib/server/db/schema.ts', { '#lib/Roles.js': { Role } });
const permissions = loadTypeScript('src/lib/auth-permissions.ts');

function fixture(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	sqlite.exec(`
CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
 email_verified INTEGER DEFAULT 0, image TEXT, created_at INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0,
 role TEXT DEFAULT 'student', setup_complete INTEGER DEFAULT 0, banned INTEGER DEFAULT 0,
 ban_reason TEXT, ban_expires INTEGER, two_factor_enabled INTEGER DEFAULT 0);
CREATE TABLE account (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, provider_id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES user(id), access_token TEXT, refresh_token TEXT, id_token TEXT,
 access_token_expires_at INTEGER, refresh_token_expires_at INTEGER, scope TEXT, password TEXT,
 created_at INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0);
CREATE TABLE session (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, token TEXT UNIQUE NOT NULL,
 created_at INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0, ip_address TEXT, user_agent TEXT,
 user_id TEXT NOT NULL REFERENCES user(id), impersonated_by TEXT);
CREATE TABLE verification (id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL,
 expires_at INTEGER NOT NULL, created_at INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0);
CREATE TABLE two_factor (id TEXT PRIMARY KEY, secret TEXT NOT NULL, backup_codes TEXT NOT NULL,
 user_id TEXT NOT NULL, verified INTEGER DEFAULT 1, failed_verification_count INTEGER DEFAULT 0, locked_until INTEGER);
`);
	const db = drizzle(sqlite, { schema });
	const cookies = new Map();
	const base = 'http://localhost:3000';
	const cookieHeader = () => [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
	const event = {
		locals: {},
		request: new Request(base, { headers: { origin: base } }),
		cookies: { set: (key, value) => cookies.set(key, value) }
	};
	const getRequestEvent = () => event;
	const { auth, validateUser } = loadTypeScript('src/lib/server/auth.ts', {
		'#lib/Roles.js': { Role },
		'#lib/server/db/index.js': { db },
		'$app/env/private': {
			ORIGIN: base,
			BETTER_AUTH_SECRET: 'test-only-secret-with-at-least-thirty-two-characters'
		},
		'$app/server': { getRequestEvent },
		'@sveltejs/kit': { error },
		'better-auth/minimal': { betterAuth },
		'better-auth/adapters/drizzle': { drizzleAdapter },
		'better-auth/plugins/admin': { admin },
		'better-auth/plugins/two-factor': { twoFactor },
		'better-auth/svelte-kit': { sveltekitCookies },
		'../auth-permissions': permissions,
		'./email': { sendEmail: async () => true },
		'./email-templates': {
			createFirstLoginEmail: () => ({ subject: 'Setup', text: 'Setup', html: '<p>Setup</p>' }),
			createResetPasswordEmail: () => ({ subject: 'Reset', text: 'Reset', html: '<p>Reset</p>' })
		}
	});
	function commands(usingAuth = auth) {
		return loadTypeScript('src/lib/actions/password.remote.ts', {
			'#lib/server/auth.js': { auth: usingAuth, validateUser },
			'#lib/server/db/index.js': { db },
			'@sveltejs/kit': { error },
			'$app/server': {
				getRequestEvent,
				command: (validation, callback) =>
					typeof validation === 'function'
						? validation
						: (input) => callback(validation.parse(input))
			}
		});
	}
	async function refreshSession() {
		event.request = new Request(base, { headers: { origin: base, cookie: cookieHeader() } });
		const session = await auth.api.getSession({ headers: event.request.headers });
		event.locals = session ? { user: session.user, session: session.session } : {};
		return session;
	}
	async function issueToken(id = 'student') {
		const user = await db.query.user.findFirst({ where: eq(schema.user.id, id) });
		await auth.api.requestPasswordReset({
			body: { email: user.email, redirectTo: '/first-login' }
		});
		const verification = await db.query.verification.findFirst({
			where: eq(schema.verification.value, id)
		});
		return verification.identifier.slice('reset-password:'.length);
	}
	db.insert(schema.user)
		.values({ id: 'student', name: 'Student', email: 'student@example.com' })
		.run();
	db.insert(schema.user).values({ id: 'other', name: 'Other', email: 'other@example.com' }).run();
	return { db, auth, commands, refreshSession, issueToken, event, cookieHeader, ...commands() };
}

test('first reset creates a credential, sets the browser session, and completes only that account', async (t) => {
	const f = fixture(t);
	const token = await f.issueToken();
	assert.deepEqual(
		await f.resetPasswordAndSignIn({
			token,
			newPassword: 'new-password-123',
			email: 'other@example.com'
		}),
		{ status: 'signed-in' }
	);
	const session = await f.refreshSession();
	assert.equal(session.user.id, 'student');
	assert.equal((await f.db.query.account.findFirst()).providerId, 'credential');
	await f.completeFirstLogin();
	assert.equal(
		(await f.db.query.user.findFirst({ where: eq(schema.user.id, 'student') })).setupComplete,
		true
	);
	assert.equal(
		(await f.db.query.user.findFirst({ where: eq(schema.user.id, 'other') })).setupComplete,
		false
	);
	await f.refreshSession();
	await f.completeFirstLogin();
	await assert.rejects(f.resetPasswordAndSignIn({ token, newPassword: 'replayed-password' }), {
		status: 400
	});
});

test('regular reset revokes the old session before establishing the new session', async (t) => {
	const f = fixture(t);
	await f.resetPasswordAndSignIn({ token: await f.issueToken(), newPassword: 'initial-password' });
	const oldSession = await f.refreshSession();
	await f.resetPasswordAndSignIn({
		token: await f.issueToken(),
		newPassword: 'replacement-password'
	});
	assert.equal(
		await f.db.query.session.findFirst({
			where: eq(schema.session.token, oldSession.session.token)
		}),
		undefined
	);
	assert.equal((await f.refreshSession()).user.id, 'student');
	await f.completeFirstLogin();
});

test('unknown, expired, or invalid-password requests never establish a session', async (t) => {
	const f = fixture(t);
	await assert.rejects(
		f.resetPasswordAndSignIn({ token: 'unknown', newPassword: 'new-password-123' }),
		{ status: 400 }
	);
	const token = await f.issueToken();
	await assert.rejects(f.resetPasswordAndSignIn({ token, newPassword: 'short' }));
	assert.equal(await f.refreshSession(), null);
	f.db
		.update(schema.verification)
		.set({ expiresAt: new Date(0) })
		.run();
	await assert.rejects(f.resetPasswordAndSignIn({ token, newPassword: 'new-password-123' }), {
		status: 400
	});
	assert.equal(await f.db.query.account.findFirst(), undefined);
});

test('a sign-in failure reports that the reset succeeded without reusing the token', async (t) => {
	const f = fixture(t);
	const commands = f.commands({
		...f.auth,
		api: {
			...f.auth.api,
			signInEmail: async () => {
				throw new Error('Sign-in unavailable');
			}
		}
	});
	const token = await f.issueToken();
	assert.equal(
		(await commands.resetPasswordAndSignIn({ token, newPassword: 'new-password-123' })).status,
		'sign-in-required'
	);
	assert.ok((await f.db.query.account.findFirst()).password);
	assert.equal(await f.refreshSession(), null);
	await assert.rejects(f.resetPasswordAndSignIn({ token, newPassword: 'new-password-123' }), {
		status: 400
	});
});

test('automatic sign-in respects two-factor authentication and cannot complete setup early', async (t) => {
	const f = fixture(t);
	f.db
		.update(schema.user)
		.set({ twoFactorEnabled: true })
		.where(eq(schema.user.id, 'student'))
		.run();
	const result = await f.resetPasswordAndSignIn({
		token: await f.issueToken(),
		newPassword: 'new-password-123'
	});
	assert.equal(result.status, 'sign-in-required');
	assert.match(result.message, /two-factor/);
	assert.equal(await f.refreshSession(), null);
	await assert.rejects(f.completeFirstLogin(), { status: 401 });
	assert.equal(
		(await f.db.query.user.findFirst({ where: eq(schema.user.id, 'student') })).setupComplete,
		false
	);
});

test('completion requires an authenticated account with a saved credential password', async (t) => {
	const f = fixture(t);
	await assert.rejects(f.completeFirstLogin(), { status: 401 });
	f.event.locals = { user: { id: 'student', setupComplete: false }, session: {} };
	await assert.rejects(f.completeFirstLogin(), { status: 400 });
});

test('failed completion can be retried with the signed-in session after the token is consumed', async (t) => {
	const f = fixture(t);
	const token = await f.issueToken();
	await f.resetPasswordAndSignIn({ token, newPassword: 'new-password-123' });
	await f.refreshSession();
	let attempts = 0;
	const commands = f.commands({
		...f.auth,
		api: {
			...f.auth.api,
			updateUser: async (input) => {
				if (++attempts === 1) throw new Error('Temporary failure');
				return f.auth.api.updateUser(input);
			}
		}
	});
	await assert.rejects(commands.completeFirstLogin(), /Temporary failure/);
	assert.equal(
		(await f.db.query.user.findFirst({ where: eq(schema.user.id, 'student') })).setupComplete,
		false
	);
	await commands.completeFirstLogin();
	assert.equal(
		(await f.db.query.user.findFirst({ where: eq(schema.user.id, 'student') })).setupComplete,
		true
	);
	assert.equal(
		await f.db.query.verification.findFirst({
			where: eq(schema.verification.identifier, `reset-password:${token}`)
		}),
		undefined
	);
});
