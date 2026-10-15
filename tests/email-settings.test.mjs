import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { error } from '@sveltejs/kit';
import ts from 'typescript';
import { migrationConfigThrough } from './migration-config.mjs';

const require = createRequire(import.meta.url);
function loadTypeScript(file, dependencies = {}) {
	const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => dependencies[id] ?? require(id), exports);
	return exports;
}
const email = loadTypeScript('lib/email.ts');
const roles = loadTypeScript('lib/Roles.ts');
const schema = loadTypeScript('lib/schema.ts', {
	'#lib/Roles.js': roles,
	'./email': email
});

test('Resend reports API success, rejects failures, validates settings, and preserves email bodies', async () => {
	const settings = {
		emailApiType: 'resend',
		senderEmail: 'system@example.com',
		senderName: 'BPC',
		resendApiKey: 'test-key'
	};
	const sent = [];
	let response = { data: { id: 'email-id' }, error: null };
	let throws = false;
	const { sendEmail } = loadTypeScript('lib/server/email.ts', {
		'../email': email,
		'./settings': { getSystemSettings: async () => settings },
		'./email-html': loadTypeScript('lib/server/email-html.ts'),
		resend: {
			Resend: class {
				constructor(key) {
					assert.equal(key, settings.resendApiKey);
				}
				emails = {
					send: async (message) => {
						sent.push(message);
						if (throws) throw new Error('Network unavailable');
						return response;
					}
				};
			}
		}
	});
	assert.equal(await sendEmail('student@example.com', 'Subject', 'Plain', '<h1>HTML</h1>'), true);
	assert.deepEqual(sent[0], {
		from: '"BPC" <system@example.com>',
		to: 'student@example.com',
		subject: 'Subject',
		text: 'Plain',
		html: '<h1>HTML</h1>'
	});
	assert.equal(await sendEmail('student@example.com', 'Subject', '<unsafe>\nnext'), true);
	assert.equal(sent[1].html, '<p>&lt;unsafe&gt;<br />next</p>');
	response = { data: null, error: { message: 'Invalid API key' } };
	assert.equal(await sendEmail('student@example.com', 'Subject', 'Plain'), false);
	response = { data: null, error: null };
	assert.equal(await sendEmail('student@example.com', 'Subject', 'Plain'), false);
	throws = true;
	assert.equal(await sendEmail('student@example.com', 'Subject', 'Plain'), false);
	const count = sent.length;
	for (const field of ['senderName', 'senderEmail', 'resendApiKey']) {
		const original = settings[field];
		settings[field] = '';
		assert.equal(await sendEmail('student@example.com', 'Subject', 'Plain'), false);
		settings[field] = original;
	}
	settings.emailApiType = 'unsupported';
	assert.equal(await sendEmail('student@example.com', 'Subject', 'Plain'), false);
	assert.equal(sent.length, count);
});

function fixture(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	migrate(drizzle(sqlite), { migrationsFolder: 'drizzle' });
	const db = drizzle(sqlite, { schema });
	const settings = loadTypeScript('lib/server/settings.ts', {
		'../schema': schema,
		'./db': { db }
	});
	let admin = true;
	const validateUser = () => {
		if (!admin) error(403, 'Forbidden');
	};
	const { updateSystemSettings } = loadTypeScript('lib/actions/settings.remote.ts', {
		'#lib/Roles.js': roles,
		'#lib/email.js': email,
		'#lib/schema.js': schema,
		'#lib/server/auth.js': { validateUser },
		'../server/db': { db },
		'../server/settings': settings,
		'@sveltejs/kit': { error },
		'$app/server': {
			getRequestEvent: () => ({ locals: {} }),
			command: (validation, callback) => (input) => callback(validation.parse(input))
		}
	});
	const { load } = loadTypeScript('routes/user/settings/email/+page.server.ts', {
		'#lib/Roles.js': roles,
		'#lib/server/auth.js': { validateUser },
		'#lib/server/settings.js': settings
	});
	return {
		sqlite,
		...settings,
		updateSystemSettings,
		load,
		deny: () => {
			admin = false;
		}
	};
}

test('admin can switch providers, retain blank secrets, replace keys, and load only credential flags', async (t) => {
	const f = fixture(t);
	const sender = { senderName: 'BPC', senderEmail: 'system@example.com' };
	await f.updateSystemSettings({
		...sender,
		emailApiType: 'smtp',
		smtpHost: 'smtp.example.com',
		smtpPort: 587,
		senderPassword: 'smtp-secret'
	});
	await f.updateSystemSettings({ ...sender, emailApiType: 'resend', resendApiKey: 're_secret' });
	await f.updateSystemSettings({ ...sender, emailApiType: 'resend', resendApiKey: '  ' });
	let current = await f.getSystemSettings();
	assert.equal(current.resendApiKey, 're_secret');
	assert.equal(current.senderPassword, 'smtp-secret');
	assert.equal(current.smtpHost, 'smtp.example.com');
	await f.updateSystemSettings({
		...sender,
		emailApiType: 'resend',
		resendApiKey: ' re_replacement '
	});
	await f.updateSystemSettings({
		...sender,
		emailApiType: 'smtp',
		smtpHost: 'smtp.example.com',
		smtpPort: 465,
		senderPassword: ''
	});
	current = await f.getSystemSettings();
	assert.equal(current.emailApiType, 'smtp');
	assert.equal(current.senderPassword, 'smtp-secret');
	assert.equal(current.resendApiKey, 're_replacement');
	const loaded = await f.load({ locals: {} });
	assert.equal(loaded.settings.hasResendApiKey, true);
	assert.equal(loaded.settings.hasSenderPassword, true);
	assert.equal('senderPassword' in loaded.settings, false);
	assert.equal('resendApiKey' in loaded.settings, false);
	f.deny();
	await assert.rejects(() => f.load({ locals: {} }), { status: 403 });
	await assert.rejects(() => f.updateSystemSettings({ ...sender, emailApiType: 'resend' }), {
		status: 403
	});
});

test('server rejects incomplete credentials and invalid provider, sender, host, or port', async (t) => {
	const f = fixture(t);
	const resend = { emailApiType: 'resend', senderName: 'BPC', senderEmail: 'system@example.com' };
	await assert.rejects(() => f.updateSystemSettings(resend), { status: 400 });
	await assert.rejects(
		() =>
			f.updateSystemSettings({
				...resend,
				emailApiType: 'smtp',
				smtpHost: 'smtp.example.com',
				smtpPort: 465
			}),
		{ status: 400 }
	);
	for (const invalid of [
		{ emailApiType: 'unsupported' },
		{ senderEmail: 'invalid' },
		{ senderName: ' ' },
		{ senderName: 'BPC\r\nBcc: victim@example.com' },
		{ emailApiType: 'smtp' },
		{ smtpHost: 'https://smtp.example.com' },
		{ smtpPort: 0 },
		{ smtpPort: 65536 },
		{ smtpPort: 4.5 }
	]) {
		assert.throws(() => f.updateSystemSettings({ ...resend, ...invalid }));
	}
	assert.equal((await f.getSystemSettings()).resendApiKey, null);
});

test('email migration preserves SMTP, defaults to SMTP, supports retry, rollback, and reapply', (t) => {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	migrate(drizzle(sqlite), migrationConfigThrough(t, 18));
	sqlite.exec(
		"INSERT INTO system_settings (id, sender_email, sender_password) VALUES (1, 'system@example.com', 'smtp-secret')"
	);
	const before = sqlite.prepare('SELECT * FROM system_settings').get();
	const config = { migrationsFolder: 'drizzle' };
	migrate(drizzle(sqlite), config);
	const expanded = { ...before, email_api_type: 'smtp', resend_api_key: null };
	assert.deepEqual(sqlite.prepare('SELECT * FROM system_settings').get(), expanded);
	migrate(drizzle(sqlite), config);
	assert.deepEqual(sqlite.prepare('SELECT * FROM system_settings').get(), expanded);
	sqlite.exec(readFileSync('drizzle/rollback/0019_email_provider.sql', 'utf8'));
	assert.deepEqual(sqlite.prepare('SELECT * FROM system_settings').get(), before);
	migrate(drizzle(sqlite), config);
	assert.deepEqual(sqlite.prepare('SELECT * FROM system_settings').get(), expanded);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
});
