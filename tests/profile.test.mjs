import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

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

function fixture(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	sqlite.pragma('foreign_keys = ON');
	sqlite.exec(`
		INSERT INTO user (id, name, email, role, email_verified, setup_complete, created_at, updated_at) VALUES
		('u', 'Maria Cruz', 'maria@example.com', 'student', 1, 1, 1000, 2000),
		('other', 'Other User', 'other@example.com', 'registrar', 0, 0, 1000, 2000);
		INSERT INTO program (id, code, name) VALUES ('p', 'BSIS', 'Information Systems');
		INSERT INTO curriculum (id, program_code, name) VALUES ('c', 'BSIS', 'Curriculum');
		INSERT INTO student (id, user_id, address,contact_number) VALUES ('MA-001', 'u', 'Malolos, Bulacan','09123456789');
		INSERT INTO enrollment (id, student_id, curriculum_id, section, school_year_start, semester, year_level, status)
		VALUES ('e', 'MA-001', 'c', 'A', 2026, 1, 2, 'enrolled');
		UPDATE student SET enrollment_id = 'e' WHERE user_id = 'u';
		INSERT INTO account (id, account_id, provider_id, user_id, password, access_token, created_at, updated_at)
		VALUES ('credential', 'u', 'credential', 'u', 'SECRET_PASSWORD', 'SECRET_TOKEN', 1000, 2000);
	`);
	const { load } = loadModule('src/routes/user/settings/profile/+page.server.ts', {
		'#lib/Roles.js': { Role },
		'#lib/schema.js': schema,
		'#lib/server/db/index.js': { db },
		'#lib/server/auth.js': { validateUser },
		'@sveltejs/kit': { error }
	});
	return {
		sqlite,
		load: (id = 'u', role = Role.STUDENT) =>
			load({
				locals: { user: role ? { id, role } : null, session: role ? {} : null },
				params: { userId: 'other' },
				url: new URL('https://example.com/user/settings/profile?userId=other')
			})
	};
}

test('profile returns only the signed-in account and public profile fields', async (t) => {
	const f = fixture(t);
	const { profile } = await f.load();
	assert.equal(profile.name, 'Maria Cruz');
	assert.equal(profile.email, 'maria@example.com');
	assert.equal(profile.contactNumber, '09123456789');
	assert.equal(profile.address, 'Malolos, Bulacan');
	assert.equal(profile.emailVerified, true);
	assert.equal(profile.setupComplete, true);
	assert.ok(profile.createdAt instanceof Date);
	assert.equal(profile.student.studentId, 'MA-001');
	assert.equal(profile.student.enrollment.section, 'A');
	assert.equal(profile.student.enrollment.curriculum.program.name, 'Information Systems');
	assert.deepEqual(
		Object.keys(profile).sort(),
		[
			'address',
			'contactNumber',
			'createdAt',
			'email',
			'emailVerified',
			'image',
			'name',
			'role',
			'setupComplete',
			'student',
			'updatedAt'
		].sort()
	);
	assert.equal(JSON.stringify(profile).includes('SECRET'), false);
	assert.equal(JSON.stringify(profile).includes('other@example.com'), false);
});

for (const role of [Role.ADMIN, Role.REGISTRAR, Role.STUDENT]) {
	test(`${role} can view their own profile without student or applicant records`, async (t) => {
		const f = fixture(t);
		f.sqlite.prepare("UPDATE user SET role = ? WHERE id = 'other'").run(role);
		const { profile } = await f.load('other', role);
		assert.equal(profile.name, 'Other User');
		assert.equal(profile.email, 'other@example.com');
		assert.equal(profile.student, null);
		assert.equal(profile.contactNumber, null);
		assert.equal(profile.address, null);
	});
}

test('profile supports student records without a current enrollment', async (t) => {
	const f = fixture(t);
	f.sqlite.exec("UPDATE student SET enrollment_id = NULL WHERE user_id = 'u'");
	assert.equal((await f.load()).profile.student.enrollment, null);
});

test('profile reports missing accounts and rejects unauthenticated or unsupported roles', async (t) => {
	const f = fixture(t);
	await assert.rejects(f.load('missing'), { status: 404 });
	await assert.rejects(f.load('u', null), { status: 401 });
	await assert.rejects(f.load('u', 'unknown'), { status: 403 });
});
