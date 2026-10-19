import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function loadRoute(file) {
	const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	const dependencies = {
		'$app/paths': { resolve: (route) => `/portal${route}` },
		'#lib/server/db/index.js': { db: {} },
		'#lib/server/notifications.js': { getNotificationCounts: () => ({ unread: 2 }) },
		'@sveltejs/kit': {
			redirect(status, location) {
				throw Object.assign(new Error('Redirect'), { status, location });
			}
		}
	};
	new Function('require', 'exports', outputText)((id) => dependencies[id], exports);
	return exports.load;
}

test('homepage stays public; login and protected routes redirect with the configured base path', () => {
	const home = loadRoute('src/routes/+page.server.ts');
	const login = loadRoute('src/routes/login/+page.server.ts');
	const protectedLayout = loadRoute('src/routes/user/+layout.server.ts');
	const anonymous = { locals: {} };
	const signedIn = {
		locals: {
			user: { id: 'staff', name: 'Staff', email: 'private@example.com', setupComplete: true },
			session: {}
		}
	};
	assert.deepEqual(home(anonymous), { signedIn: false });
	assert.deepEqual(home(signedIn), { signedIn: true });
	assert.deepEqual(login(anonymous), {});
	assert.throws(() => login(signedIn), { status: 302, location: '/portal/user/dashboard' });
	assert.throws(() => protectedLayout(anonymous), { status: 302, location: '/portal/login' });
	assert.deepEqual(protectedLayout(signedIn), { unreadNotifications: 2 });
});

test('unfinished authenticated accounts resume setup without a reset token', () => {
	const protectedLayout = loadRoute('src/routes/user/+layout.server.ts');
	const firstLogin = loadRoute('src/routes/first-login/+page.server.ts');
	const locals = { user: { id: 'student', setupComplete: false }, session: {} };
	assert.throws(() => protectedLayout({ locals }), {
		status: 302,
		location: '/portal/first-login'
	});
	const url = new URL('http://localhost/portal/first-login');
	assert.deepEqual(firstLogin({ locals, url }), { resumeSetup: true });
	for (const viewer of [{}, { user: locals.user }, { ...locals, user: { setupComplete: true } }]) {
		assert.deepEqual(firstLogin({ locals: viewer, url }), { resumeSetup: false });
	}
	for (const query of ['?token=new-reset-token', '?error=expired']) {
		assert.deepEqual(firstLogin({ locals, url: new URL(query, url) }), { resumeSetup: false });
	}
});
