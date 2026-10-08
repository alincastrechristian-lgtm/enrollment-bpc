import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function loadNavigation(base = '') {
	const source = readFileSync(
		new URL('../src/lib/components/Sidebar/navigation.ts', import.meta.url),
		'utf8'
	);
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	const dependencies = {
		'$app/paths': { resolve: (route) => base + route },
		'#lib/Roles.js': { Role: { ADMIN: 'admin', REGISTRAR: 'registrar', STUDENT: 'student' } },
		'@lucide/svelte': {}
	};
	new Function('require', 'exports', outputText)((id) => dependencies[id], exports);
	return exports;
}

const { getSidebarItems, isActiveLink, isActiveItem } = loadNavigation();

for (const [role, expected] of [
	[
		'admin',
		[
			'Dashboard',
			'Registrars',
			'Applicants',
			'Students',
			'Enrollment',
			'Subjects',
			'Programs',
			'Curriculum',
			'Notifications',
			'Reports',
			'Settings'
		]
	],
	[
		'registrar',
		[
			'Dashboard',
			'Applicants',
			'Students',
			'Enrollment',
			'Subjects',
			'Programs',
			'Curriculum',
			'Notifications',
			'Reports',
			'Settings'
		]
	],
	['student', ['Dashboard', 'Enrollment', 'Notifications', 'Settings']]
]) {
	test(`${role} keeps existing navigation and receives the correct settings links`, () => {
		const items = getSidebarItems(role);
		assert.deepEqual(
			items.map((item) => item.label),
			expected
		);
		const settings = items.find((item) => item.id === 'settings');
		assert.deepEqual(
			settings.children.map((item) => item.label),
			role === 'admin' ? ['Email', 'Profile'] : ['Profile']
		);
		assert.equal(isActiveItem(settings, '/user/settings/profile/'), true);
		assert.equal(isActiveItem(settings, '/user/settings/email'), role === 'admin');
	});
}

test('missing or unknown sessions receive no links', () => {
	for (const role of [undefined, null, '', 'unknown']) {
		assert.deepEqual(getSidebarItems(role), []);
	}
});

test('role changes do not mutate the shared menu', () => {
	getSidebarItems('student');
	getSidebarItems('registrar');
	assert.equal(getSidebarItems('admin').find((item) => item.id === 'settings').children.length, 2);
});

test('active links match route boundaries and trailing slashes', () => {
	assert.equal(isActiveLink('/user/applicants', '/user/applicants/123'), true);
	assert.equal(isActiveLink('/user/applicants/', '/user/applicants/'), true);
	assert.equal(isActiveLink('/user/applicants', '/user/applicants-other'), false);
	assert.equal(isActiveLink('/user/settings/profile', '/user/dashboard'), false);
});

test('resolved links and group highlighting support a deployment base path', () => {
	const navigation = loadNavigation('/portal');
	const settings = navigation.getSidebarItems('admin').find((item) => item.id === 'settings');
	assert.equal(
		settings.children.find((child) => child.label === 'Profile').href,
		'/portal/user/settings/profile'
	);
	assert.equal(navigation.isActiveItem(settings, '/portal/user/settings/email'), true);
});
