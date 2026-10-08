import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import z from 'zod';

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

const fields = loadModule('src/lib/components/Filter/fields.ts');
const filterHelpers = loadModule('src/lib/server/filters.ts', {
	'#lib/components/Filter/fields.js': fields,
	'@sveltejs/kit': { error }
});

test('filter controls infer optional and nullable field types and honor omitted keys', () => {
	assert.deepEqual(
		fields.filterFields(schema.filterSubjectSchema).map(({ key, type }) => [key, type]),
		[
			['code', 'text'],
			['name', 'text'],
			['description', 'text'],
			['isActive', 'boolean']
		]
	);
	const custom = z.object({
		name: z.string().nullable().optional().meta({ title: 'Display name' }),
		year: z.number().int().min(1).max(4).optional(),
		date: z.date().optional(),
		category: z.enum(['Core', 'Elective']).optional()
	});
	const inferred = fields.filterFields(custom);
	assert.equal(inferred[0].label, 'Display name');
	assert.deepEqual(inferred[1], {
		key: 'year',
		label: 'Year',
		type: 'number',
		min: 1,
		max: 4,
		step: 1
	});
	assert.equal(inferred[2].type, 'date');
	assert.deepEqual(inferred[3].options, ['Core', 'Elective']);
	assert.equal(fields.parseFilterValue(custom, inferred[3], 'Unknown').success, false);
});

test('date filters match the full Manila calendar day', async (t) => {
	const f = fixture(t, 'applicants');
	f.db
		.insert(schema.applicant)
		.values(
			[
				'2026-10-07T23:59:59.999+08:00',
				'2026-10-08T00:00:00+08:00',
				'2026-10-08T23:59:59.999+08:00',
				'2026-10-09T00:00:00+08:00',
				'2026-10-09T23:59:59.999+08:00',
				'2026-10-10T00:00:00+08:00'
			].map((date, index) => ({
				id: String(index),
				applicationId: String(index),
				name: 'Applicant',
				email: `${index}@example.com`,
				program: 'BSIS',
				yearLevel: 1,
				contactNumber: '123',
				address: 'Bulacan',
				dateApplied: new Date(date)
			}))
		)
		.run();
	const result = await f.load('?filter.dateApplied=2026-10-08');
	assert.equal(result.total, 2);
	assert.deepEqual(result.applicants.map(({ id }) => id).sort(), ['1', '2']);
	assert.deepEqual(result.filters, {
		'dateApplied.min': '2026-10-08',
		'dateApplied.max': '2026-10-08'
	});
	const range = await f.load(
		'?filter.dateApplied.min=2026-10-08&filter.dateApplied.max=2026-10-09'
	);
	assert.equal(range.total, 4);
	assert.deepEqual(range.applicants.map(({ id }) => id).sort(), ['1', '2', '3', '4']);
	assert.equal((await f.load('?filter.dateApplied.min=2026-10-09')).total, 3);
	assert.equal((await f.load('?filter.dateApplied.max=2026-10-08')).total, 3);
	assert.equal((await f.load('?filter.dateApplied.min=&filter.dateApplied.max=')).total, 6);
	await assert.rejects(
		f.load('?filter.dateApplied.min=2026-10-09&filter.dateApplied.max=2026-10-08'),
		{ status: 400 }
	);
	await assert.rejects(f.load('?filter.dateApplied.max=2026-02-30'), { status: 400 });
});

test('number ranges include endpoints, allow one bound, and validate both bounds', async (t) => {
	const f = fixture(t, 'applicants');
	f.db
		.insert(schema.applicant)
		.values(
			Array.from({ length: 4 }, (_, index) => ({
				id: String(index),
				applicationId: String(index),
				name: 'Applicant',
				email: `${index}@example.com`,
				program: 'BSIS',
				yearLevel: index + 1,
				contactNumber: '123',
				address: 'Bulacan',
				dateApplied: new Date(),
				hasPicture: index === 2
			}))
		)
		.run();
	const range = await f.load('?filter.yearLevel.min=2&filter.yearLevel.max=3');
	assert.equal(range.total, 2);
	assert.deepEqual(range.applicants.map(({ yearLevel }) => yearLevel).sort(), [2, 3]);
	assert.equal((await f.load('?filter.yearLevel.min=3')).total, 2);
	assert.equal((await f.load('?filter.yearLevel.max=2')).total, 2);
	assert.equal((await f.load('?filter.yearLevel.min=0&filter.yearLevel.max=2')).total, 2);
	assert.equal((await f.load('?filter.yearLevel.min=2&filter.yearLevel.max=2')).total, 1);
	assert.equal(
		(await f.load('?filter.yearLevel.min=2&filter.yearLevel.max=3&filter.hasPicture=true')).total,
		1
	);
	assert.equal((await f.load('?filter.yearLevel=1&filter.yearLevel.min=2')).total, 3);
	assert.equal((await f.load('?filter.yearLevel.min=&filter.yearLevel.max=')).total, 4);
	await assert.rejects(f.load('?filter.yearLevel.min=3&filter.yearLevel.max=2'), { status: 400 });
	await assert.rejects(f.load('?filter.yearLevel.max=invalid'), { status: 400 });
	await assert.rejects(f.load('?filter.yearLevel.min=1.5'), { status: 400 });
	assert.equal((await f.load('?filter.yearLevel.max=2', Role.REGISTRAR)).total, 2);
	await assert.rejects(f.load('?filter.yearLevel.max=2', Role.STUDENT), { status: 403 });
});
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
		'#lib/server/filters.js': filterHelpers,
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
	assert.equal(
		(await f.load('?filter.program=BSIS&filter.yearLevel=1&filter.hasPicture=false')).total,
		1
	);
	assert.equal((await f.load('?filter.name=Applicant%2012&filter.hasPicture=true')).total, 1);
	assert.equal((await f.load('?filter.yearLevel=2')).total, 0);
	assert.equal((await f.load('?filter.id=0')).total, 13);
	await assert.rejects(f.load('?filter.hasPicture=invalid'), { status: 400 });
	await assert.rejects(f.load('?filter.yearLevel=1.5'), { status: 400 });
	await assert.rejects(f.load('?filter.dateApplied=2026-02-30'), { status: 400 });
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
		assert.equal((await f.load('?filter.name=Account&filter.setupComplete=false')).total, 1);
		assert.equal((await f.load('?filter.email=account11&filter.setupComplete=true')).total, 1);
		assert.equal((await f.load('?filter.role=admin')).total, 12);
		await assert.rejects(f.load('?filter.setupComplete=0'), { status: 400 });
		await assert.rejects(f.load('?status=pending&page=99'), { status: 302 });
		await assert.rejects(f.load('', Role.STUDENT), { status: 403 });
		await assert.rejects(f.load('', null), { status: 401 });
		if (kind === 'students') assert.equal((await f.load('', Role.REGISTRAR)).total, 12);
		else await assert.rejects(f.load('', Role.REGISTRAR), { status: 403 });
	});
}
