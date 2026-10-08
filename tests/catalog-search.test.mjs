import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
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
const schema = loadModule('src/lib/schema.ts', { '#lib/Roles.js': { Role } });
const authSource = readFileSync(new URL('../src/lib/server/auth.ts', import.meta.url), 'utf8');
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

function fixture(t, kind) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	sqlite.exec(`
		CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, email_verified INTEGER DEFAULT 0,
		 image TEXT, created_at INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0, role TEXT,
		 setup_complete INTEGER DEFAULT 0, banned INTEGER DEFAULT 0, ban_reason TEXT, ban_expires INTEGER,
		 two_factor_enabled INTEGER DEFAULT 0);
		CREATE TABLE applicant (id TEXT PRIMARY KEY, user_id TEXT UNIQUE, application_id TEXT UNIQUE,
		 name TEXT, program TEXT, year_level INTEGER, date_applied INTEGER, email TEXT, contact_number TEXT,
		 address TEXT, has_birth_certificate INTEGER DEFAULT 0, has_form_138 INTEGER DEFAULT 0,
		 has_good_moral INTEGER DEFAULT 0, has_picture INTEGER DEFAULT 0, created_at INTEGER DEFAULT 0,
		 updated_at INTEGER DEFAULT 0);
	`);
	const db = drizzle(sqlite, { schema });
	const load = loadModule(`src/routes/user/${kind}/+page.server.ts`, {
		'#lib/Roles.js': { Role },
		'#lib/schema.js': schema,
		'#lib/server/db/index.js': { db },
		'#lib/server/auth.js': { validateUser },
		'#lib/components/Table/TableValues.js': { MAX_ITEMS_PER_PAGE: 10 },
		'@sveltejs/kit': {
			redirect: (status, location) => {
				throw Object.assign(new Error('redirect'), { status, location });
			}
		}
	}).load;
	return {
		db,
		load: (query = '', role = Role.ADMIN) =>
			load({
				locals: { user: role ? { role } : null, session: role ? {} : null },
				url: new URL(`https://example.com/user/${kind}${query}`)
			})
	};
}

test('applicant search and document status filter share counts and pagination', async (t) => {
	const f = fixture(t, 'applicants');
	f.db
		.insert(schema.applicant)
		.values(
			Array.from({ length: 13 }, (_, index) => ({
				id: String(index),
				applicationId: `2026-${index}`,
				name: `Applicant ${index}`,
				email: `applicant${index}@example.com`,
				program: 'BSIS',
				yearLevel: 1,
				dateApplied: new Date(2026, 0, index + 1),
				contactNumber: '123',
				address: 'Bulacan',
				hasBirthCertificate: true,
				hasForm138: true,
				hasGoodMoral: true,
				hasPicture: index !== 0,
				userId: index < 2 ? `student-${index}` : null
			}))
		)
		.run();
	assert.equal((await f.load('?page=2')).applicants.length, 3);
	assert.equal((await f.load('?q=2026-12')).applicants[0].id, '12');
	assert.equal((await f.load('?q=applicant12@example.com')).total, 1);
	assert.equal((await f.load('?q=Applicant%2012')).total, 1);
	assert.equal((await f.load('?status=incomplete')).total, 1);
	assert.equal((await f.load('?status=approved')).total, 1);
	assert.equal((await f.load('?status=under-review')).total, 11);
	assert.equal((await f.load('?status=under-review&page=2')).applicants.length, 1);
	assert.equal((await f.load('?q=missing')).total, 0);
	assert.equal((await f.load('?status=invalid&page=invalid')).total, 13);
	await assert.rejects(f.load('?q=2026-12&page=99'), {
		status: 302,
		location: '/user/applicants?q=2026-12&page=1'
	});
	await assert.rejects(f.load('', Role.STUDENT), { status: 403 });
	await assert.rejects(f.load('', null), { status: 401 });
});

for (const kind of ['students', 'registrars']) {
	test(`${kind}: search and verification filter preserve role boundaries`, async (t) => {
		const f = fixture(t, kind);
		const role = kind === 'students' ? Role.STUDENT : Role.REGISTRAR;
		f.db
			.insert(schema.user)
			.values([
				...Array.from({ length: 12 }, (_, index) => ({
					id: `account-${index}`,
					name: `Account ${index}`,
					email: `account${index}@example.com`,
					role,
					setupComplete: index !== 0
				})),
				{ id: 'admin', name: 'Account admin', email: 'admin@example.com', role: Role.ADMIN }
			])
			.run();
		assert.equal((await f.load('?page=2')).users.length, 2);
		assert.equal((await f.load('?q=account-11')).users[0].id, 'account-11');
		assert.equal((await f.load('?q=account11@example.com')).total, 1);
		assert.equal((await f.load('?q=Account%2011')).total, 1);
		assert.equal((await f.load('?status=verified')).total, 11);
		assert.equal((await f.load('?status=pending')).total, 1);
		assert.equal((await f.load('?q=account-11&status=pending')).total, 0);
		assert.equal((await f.load('?q=Account')).total, 12);
		assert.equal((await f.load('?status=invalid&page=invalid')).total, 12);
		await assert.rejects(f.load('?status=pending&page=99'), { status: 302 });
		await assert.rejects(f.load('', Role.STUDENT), { status: 403 });
		await assert.rejects(f.load('', null), { status: 401 });
		if (kind === 'students') assert.equal((await f.load('', Role.REGISTRAR)).total, 12);
		else await assert.rejects(f.load('', Role.REGISTRAR), { status: 403 });
	});
}
