import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { error, isHttpError } from '@sveltejs/kit';
import ts from 'typescript';
import { migrationConfigThrough } from './migration-config.mjs';

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
const email = load('src/lib/email.ts');
const schema = load('src/lib/schema.ts', { '#lib/Roles.js': roles, './email': email });
const notifications = load('src/lib/server/notifications.ts', {
	'#lib/Roles.js': roles,
	'#lib/schema.js': schema,
	'@sveltejs/kit': { error }
});
const viewer = (id, role) => ({ id, role });
const admin = viewer('a', 'admin');
const registrar = viewer('r1', 'registrar');
const student = viewer('s1', 'student');
function fixture(t, lastMigration) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(
		db,
		lastMigration === undefined
			? { migrationsFolder: 'drizzle' }
			: migrationConfigThrough(t, lastMigration)
	);
	sqlite.pragma('foreign_keys=ON');
	for (const [id, role] of [
		['a', 'admin'],
		['r1', 'registrar'],
		['r2', 'registrar'],
		['s1', 'student'],
		['s2', 'student']
	]) {
		db.insert(schema.user)
			.values({ id, name: id, email: `${id}@example.com`, role })
			.run();
	}
	const record = (recipientId, actorId, type, title) =>
		notifications.recordNotification(db, {
			recipientId,
			actorId,
			type,
			title,
			message: `Event ${title}`
		}).id;
	const own = record('s1', 'r1', 'enrollment_confirmed', 'Own enrollment');
	const other = record('s2', 'r2', 'grades_finalized', 'Other grades');
	const security = record('s1', null, 'password_reset', 'Reset requested');
	return { db, sqlite, own, other, security };
}

test('notification visibility, filters and read commands enforce actor/recipient boundaries', async (t) => {
	const f = fixture(t);
	const list = (user, options) => notifications.getNotifications(f.db, user, options);
	assert.deepEqual(
		list(registrar).items.map((n) => n.id),
		[f.own]
	);
	assert.equal(list(student).total, 2);
	assert.equal(list(admin).total, 3);
	assert.equal(list(registrar, { search: 'Other' }).total, 0);
	assert.equal(list(admin, { type: 'grades_finalized' }).items[0].id, f.other);
	assert.equal(list(admin, { pageSize: 2, page: 2 }).items.length, 1);
	assert.throws(
		() => list(viewer('s1', null)),
		(cause) => isHttpError(cause) && cause.status === 403
	);

	assert.throws(
		() => notifications.markNotificationsRead(f.db, student, f.other),
		(cause) => isHttpError(cause) && cause.status === 404
	);
	for (const sender of [registrar, admin])
		assert.throws(
			() => notifications.markNotificationsRead(f.db, sender, f.own),
			(cause) => isHttpError(cause) && cause.status === 403
		);
	assert.equal(notifications.getNotificationCounts(f.db, admin).unread, 0);
	assert.equal(notifications.getNotificationCounts(f.db, registrar).unread, 0);
	notifications.markNotificationsRead(f.db, student, f.own);
	const firstRead = list(student).items.find((n) => n.id === f.own).readAt;
	notifications.markNotificationsRead(f.db, student, f.own);
	assert.deepEqual(list(student).items.find((n) => n.id === f.own).readAt, firstRead);
	assert.equal(list(student, { unreadOnly: true }).total, 1);
	assert.equal(list(admin).items.find((n) => n.id === f.own).readAt, null);

	let locals = { user: student, session: {} };
	const { readNotifications } = load('src/lib/actions/notifications.remote.ts', {
		'#lib/Roles.js': roles,
		'#lib/server/notifications.js': notifications,
		'#lib/server/db/index.js': { db: f.db },
		'#lib/server/auth.js': {
			validateUser: (value, allowed) => {
				if (!value.user || !value.session) error(401, 'Unauthorized');
				if (!allowed.includes(value.user.role)) error(403, 'Forbidden');
			}
		},
		'$app/server': {
			getRequestEvent: () => ({ locals }),
			command: (schema, fn) => (data) => fn(schema.parse(data))
		}
	});
	await readNotifications({ userId: 'a', role: 'admin' });
	assert.equal(notifications.getNotificationCounts(f.db, registrar).unread, 0);
	assert.equal(notifications.getNotificationCounts(f.db, student).unread, 0);
	assert.equal(notifications.getNotificationCounts(f.db, admin).unread, 0);
	locals = { user: registrar, session: {} };
	assert.throws(
		() => readNotifications({}),
		(cause) => isHttpError(cause) && cause.status === 403
	);
	locals = {};
	assert.throws(
		() => readNotifications({}),
		(cause) => isHttpError(cause) && cause.status === 401
	);
});

test('email metadata covers all notification types and never contains password reset tokens', () => {
	const templates = load('src/lib/server/email-templates.ts', {
		'./email-html': load('src/lib/server/email-html.ts'),
		'./email-theme': load('src/lib/server/email-theme.ts', {
			'../../routes/layout.css?raw': readFileSync('src/routes/layout.css', 'utf8')
		})
	});
	const url = 'https://example.com/reset-password?token=SECRET_ONE_TIME_TOKEN';
	const messages = [
		templates.createFirstLoginEmail(url, 86400, 'Student'),
		templates.createResetPasswordEmail(url, 86400, 'Student'),
		templates.createEnrollmentConfirmationEmail({
			name: 'Student',
			schoolYearStart: 2026,
			semester: 1,
			programCode: 'BSIS',
			yearLevel: 1,
			section: 'A'
		}),
		templates.createGradesFinalizedEmail('Student', 2026, 1, undefined, {
			name: 'Information Systems',
			code: 'BSIS'
		}),
		templates.createMeetingRequestEmail('Student', 2026, 1),
		templates.createEnrollmentDroppedEmail('Student', 2026, 1),
		...['corrected', 'voided', 'reopened'].map((kind) =>
			templates.createEnrollmentChangeEmail({
				kind,
				name: 'Student',
				schoolYearStart: 2026,
				semester: 1,
				programCode: 'BSIS',
				yearLevel: 1,
				section: 'A',
				reason: 'Incorrect program selected'
			})
		)
	];
	assert.deepEqual(
		messages.map((m) => m.notification.type),
		email.emailEventTypes
	);
	for (const message of messages) {
		assert.ok(message.notification.title);
		assert.ok(message.notification.message);
		assert.doesNotMatch(
			JSON.stringify(message.notification),
			/SECRET_ONE_TIME_TOKEN|https?:|<html/
		);
	}
	assert.match(messages[3].notification.message, /Information Systems \(BSIS\)/);
});

test('auth email events persist safe notifications with the authenticated staff actor', async (t) => {
	const f = fixture(t);
	const templates = load('src/lib/server/email-templates.ts', {
		'./email-html': load('src/lib/server/email-html.ts'),
		'./email-theme': load('src/lib/server/email-theme.ts', {
			'../../routes/layout.css?raw': readFileSync('src/routes/layout.css', 'utf8')
		})
	});
	let actor = registrar;
	const plugin = (options) => options;
	const { auth } = load('src/lib/server/auth.ts', {
		'#lib/Roles.js': roles,
		'#lib/server/db/index.js': { db: f.db },
		'./notifications': notifications,
		'$app/env/private': { ORIGIN: 'https://example.com', BETTER_AUTH_SECRET: 'test-only' },
		'$app/server': { getRequestEvent: () => ({ locals: { user: actor } }) },
		'@sveltejs/kit': { error },
		'better-auth/adapters/drizzle': { drizzleAdapter: plugin },
		'better-auth/minimal': { betterAuth: plugin },
		'better-auth/plugins/admin': { admin: plugin },
		'better-auth/plugins/two-factor': { twoFactor: plugin },
		'better-auth/svelte-kit': { sveltekitCookies: plugin },
		'../auth-permissions': {},
		'./email': { sendEmail: async () => false },
		'./email-templates': templates
	});
	const request = {
		user: { id: 's2', name: 'Student', email: 's2@example.com' },
		url: 'https://example.com/reset?token=PRIVATE_TOKEN'
	};
	await auth.emailAndPassword.sendResetPassword(request);
	assert.equal(notifications.getNotifications(f.db, registrar, { type: 'account_setup' }).total, 1);
	f.db
		.insert(schema.account)
		.values({
			id: 'credential',
			accountId: 's2',
			providerId: 'credential',
			userId: 's2',
			password: 'private-hash'
		})
		.run();
	actor = viewer('s2', 'student');
	await auth.emailAndPassword.sendResetPassword(request);
	const messages = notifications.getNotifications(f.db, actor).items;
	assert.equal(messages.filter((n) => n.type === 'password_reset').length, 1);
	assert.doesNotMatch(JSON.stringify(messages), /PRIVATE_TOKEN|private-hash/);
	assert.equal(
		notifications.getNotifications(f.db, registrar, { type: 'password_reset' }).total,
		0
	);
});

test('notification migration rolls back and reapplies without changing accounts', (t) => {
	const f = fixture(t, 28);
	const before = f.db.select().from(schema.user).all();
	f.sqlite.exec(readFileSync('drizzle/rollback/0028_notifications.sql', 'utf8'));
	assert.deepEqual(f.db.select().from(schema.user).all(), before);
	migrate(f.db, { migrationsFolder: 'drizzle' });
	assert.equal(notifications.getNotificationCounts(f.db, admin).total, 0);
	assert.deepEqual(f.sqlite.pragma('foreign_key_check'), []);
});
