import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const css = readFileSync(new URL('../src/routes/layout.css', import.meta.url), 'utf8');

function loadTypeScript(file, dependencies = {}) {
	const source = readFileSync(new URL('../src/lib/server/' + file, import.meta.url), 'utf8');
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

const htmlHelpers = loadTypeScript('email-html.ts');
function templatesFor(styles = css) {
	const theme = loadTypeScript('email-theme.ts', {
		'../../routes/layout.css?raw': { default: styles }
	});
	const templates = loadTypeScript('email-templates.ts', {
		'./email-theme': theme,
		'./email-html': htmlHelpers
	});
	return { ...templates, ...theme };
}
const templates = templatesFor();
const url = 'https://enrollment.example.com/auth?token=test-token&callbackURL=%2Fuser';

test('both templates contain the correct action, original link, and plain text alternative', () => {
	const magic = templates.createMagicLinkEmail(url, 7 * 24 * 60 * 60);
	const reset = templates.createResetPasswordEmail(url, 3600, 'Student');
	assert.match(magic.html, /ACCOUNT ACCESS/);
	assert.match(magic.text, /expires in 7 days/);
	assert.match(reset.html, /ACCOUNT SECURITY/);
	assert.match(reset.text, /expires in 1 hour/);
	assert.match(reset.text, /Hello Student,/);
	for (const message of [magic, reset]) {
		assert.ok(message.text.includes(url));
		assert.ok(message.html.includes(`href="${htmlHelpers.escapeHtml(url)}"`));
		assert.match(message.subject, /BPC Enrollment System/);
		assert.doesNotMatch(message.html, /<script|var\(--|oklch\(/);
	}
});

test('light-theme colors become hex and update when CSS declarations change', () => {
	assert.equal(templates.emailTheme.surface, '#ffffff');
	for (const color of Object.values(templates.emailTheme)) assert.match(color, /^#[a-f0-9]{6}$/);
	const changed = templatesFor(css.replace(/--color-primary:[^;]+;/, '--color-primary: #123456;'));
	assert.equal(changed.emailTheme.primary, '#123456');
	assert.match(changed.createMagicLinkEmail(url, 300).html, /background-color:#123456/);
	const darkChanged = templatesFor(css.replace('oklch(58% 0.233 277.117)', '#ff0000'));
	assert.deepEqual(darkChanged.emailTheme, templates.emailTheme);
});

test('malformed, missing, or transparent theme colors fail clearly', () => {
	assert.throws(() => templates.readEmailTheme(''), /require the light theme/);
	for (const value of ['not-a-color', 'rgba(0,0,0,0.5)']) {
		assert.throws(
			() =>
				templates.readEmailTheme(
					css.replace(/--color-primary:[^;]+;/, `--color-primary: ${value};`)
				),
			/opaque CSS color for --color-primary/
		);
	}
});

test('personalized names and link attributes are HTML escaped', () => {
	const unsafeName = '<img src=x onerror="alert(1)">';
	const quotedUrl = 'https://enrollment.example.com/reset?token="quoted"&next=/user';
	const message = templates.createResetPasswordEmail(quotedUrl, 3600, unsafeName);
	assert.doesNotMatch(message.html, /<img/);
	assert.ok(message.html.includes(htmlHelpers.escapeHtml(unsafeName)));
	assert.ok(message.html.includes(`href="${htmlHelpers.escapeHtml(quotedUrl)}"`));
});

test('unsafe URL protocols and invalid expiration values are rejected', () => {
	for (const link of [
		'javascript:alert(1)',
		'data:text/html,test',
		'https://user:pass@example.com/'
	]) {
		assert.throws(() => templates.createMagicLinkEmail(link, 300), /HTTP or HTTPS/);
	}
	for (const seconds of [0, -1, 1.5, NaN, Infinity]) {
		assert.throws(() => templates.createMagicLinkEmail(url, seconds), /Invalid email link expiry/);
	}
});

test('auth callbacks send templates with the expiration configured in Better Auth', async () => {
	const sent = [];
	const plugin = (options) => options;
	const { auth } = loadTypeScript('auth.ts', {
		'#lib/Roles.js': { Role: { ADMIN: 'admin', REGISTRAR: 'registrar', STUDENT: 'student' } },
		'#lib/server/db/index.js': { db: {} },
		'$app/env/private': {
			ORIGIN: 'https://enrollment.example.com',
			BETTER_AUTH_SECRET: 'test-secret'
		},
		'$app/server': { getRequestEvent: () => ({}) },
		'@sveltejs/kit': { error: () => {} },
		'better-auth/adapters/drizzle': { drizzleAdapter: plugin },
		'better-auth/minimal': { betterAuth: plugin },
		'better-auth/plugins/admin': { admin: plugin },
		'better-auth/plugins/magic-link': { magicLink: plugin },
		'better-auth/plugins/two-factor': { twoFactor: () => ({}) },
		'better-auth/svelte-kit': { sveltekitCookies: () => ({}) },
		'../auth-permissions': {},
		'./email': {
			sendEmail: async (...message) => {
				sent.push(message);
				return true;
			}
		},
		'./email-templates': templates
	});
	const magic = auth.plugins[1];
	await magic.sendMagicLink({ email: 'student@example.com', url });
	await auth.emailAndPassword.sendResetPassword({
		user: { email: 'student@example.com', name: 'Student' },
		url
	});
	assert.equal(magic.expiresIn, 604800);
	assert.equal(auth.emailAndPassword.resetPasswordTokenExpiresIn, 3600);
	assert.match(sent[0][2], /expires in 7 days/);
	assert.match(sent[1][2], /expires in 1 hour/);
	for (const message of sent) {
		assert.equal(message[0], 'student@example.com');
		assert.match(message[3], /<!doctype html>/);
	}
});

test('SMTP sends supplied HTML and preserves plain email compatibility', async () => {
	const sent = [];
	const { sendEmail } = loadTypeScript('email.ts', {
		nodemailer: {
			default: {
				createTransport: () => ({
					sendMail: async (message) => {
						sent.push(message);
						return { accepted: ['student@example.com'] };
					}
				}),
				getTestMessageUrl: () => false
			}
		},
		'./email-html': htmlHelpers,
		'./settings': {
			getSystemSettings: async () => ({
				smtpHost: 'smtp.example.com',
				smtpPort: 465,
				senderEmail: 'system@example.com',
				senderName: 'BPC',
				senderPassword: 'test-password'
			})
		}
	});
	const message = templates.createMagicLinkEmail(url, 300);
	assert.equal(
		await sendEmail('student@example.com', message.subject, message.text, message.html),
		true
	);
	assert.equal(sent[0].html, message.html);
	assert.equal(sent[0].text, message.text);
	assert.equal(await sendEmail('student@example.com', 'Plain', '<unsafe>\nsecond line'), true);
	assert.equal(sent[1].html, '<p>&lt;unsafe&gt;<br />second line</p>');
});
