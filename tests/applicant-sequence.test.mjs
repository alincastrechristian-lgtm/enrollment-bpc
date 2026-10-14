import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadModule(filename, dependencies = {}, clockDate = Date) {
	const { outputText } = ts.transpileModule(
		readFileSync(new URL('../' + filename, import.meta.url), 'utf8'),
		{ compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
	);
	const exports = {};
	new Function('require', 'exports', 'Date', outputText)(
		(id) => dependencies[id] ?? require(id),
		exports,
		clockDate
	);
	return exports;
}
const { Role } = loadModule('src/lib/Roles.ts');
const schema = loadModule('src/lib/schema.ts', { '#lib/Roles.js': { Role } });
const config = { migrationsFolder: 'drizzle' };
const details = {
	name: 'Test Applicant',
	programCode: 'BSIS',
	yearLevel: 1,
	dateApplied: new Date('2020-01-01T00:00:00+08:00'),
	email: 'test@example.com',
	contactNumber: '09123456789',
	address: 'Bulacan'
};
function fixture(t, role = Role.REGISTRAR) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(db, config);
	db.insert(schema.program).values({ id: 'p', code: 'BSIS', name: 'Information Systems' }).run();
	const clock = { now: '2026-10-14T00:00:00Z' };
	class ClockDate extends Date {
		constructor(...args) {
			super(...(args.length ? args : [clock.now]));
		}
	}
	const error = (status, message) => {
		throw Object.assign(new Error(message), { status });
	};
	const commands = loadModule(
		'src/lib/actions/applicant.remote.ts',
		{
			'#lib/Roles.js': { Role },
			'#lib/schema.js': schema,
			'#lib/server/db/index.js': { db },
			'#lib/server/auth.js': {
				validateUser: (_locals, allowed) => {
					if (!allowed.includes(role)) error(role ? 403 : 401, 'Unauthorized');
				}
			},
			'$app/server': {
				command: (validation, handler) => async (input) => handler(validation.parse(input)),
				getRequestEvent: () => ({ locals: {} })
			},
			'@sveltejs/kit': { error }
		},
		ClockDate
	);
	return { ...commands, db, sqlite, clock };
}
test('generates padded IDs, ignores supplied ID and keeps UUID separate', async (t) => {
	const f = fixture(t);
	assert.deepEqual(await f.createApplicant({ ...details, applicationId: 'forged' }), {
		applicationId: 'MA-202610-000001'
	});
	await f.createApplicant(details);
	const rows = f.db.select().from(schema.applicant).all();
	assert.deepEqual(
		rows.map((row) => row.applicationId),
		['MA-202610-000001', 'MA-202610-000002']
	);
	assert.match(rows[0].id, /^[0-9a-f-]{36}$/);
	assert.equal(f.db.select().from(schema.applicantSequence).get().lastNumber, 2);
});
test('resets at Manila month and year boundaries, using creation date', async (t) => {
	const f = fixture(t);
	for (const [now, expected] of [
		['2026-10-31T15:59:59Z', 'MA-202610-000001'],
		['2026-10-31T16:00:00Z', 'MA-202611-000001'],
		['2026-12-31T15:59:59Z', 'MA-202612-000001'],
		['2026-12-31T16:00:00Z', 'MA-202701-000001']
	]) {
		f.clock.now = now;
		assert.equal((await f.createApplicant(details)).applicationId, expected);
	}
});
test('failed applicant insert rolls back counter', async (t) => {
	const f = fixture(t);
	f.db
		.insert(schema.applicant)
		.values({ ...details, applicationId: 'MA-202610-000001' })
		.run();
	await assert.rejects(f.createApplicant(details), /UNIQUE constraint/);
	assert.deepEqual(f.db.select().from(schema.applicantSequence).all(), []);
	f.db.delete(schema.applicant).run();
	assert.equal((await f.createApplicant(details)).applicationId, 'MA-202610-000001');
});
test('deleting or updating applicants never reuses or changes allocated IDs', async (t) => {
	const f = fixture(t);
	await f.createApplicant(details);
	const row = f.db.select().from(schema.applicant).get();
	await f.updateApplicant({ id: row.id, name: 'Updated Name', applicationId: 'forged' });
	assert.equal(f.db.select().from(schema.applicant).get().applicationId, 'MA-202610-000001');
	await f.deleteApplicant(row.id);
	assert.equal((await f.createApplicant(details)).applicationId, 'MA-202610-000002');
});
test('simultaneous creates receive distinct consecutive IDs', async (t) => {
	const f = fixture(t);
	const results = await Promise.all(Array.from({ length: 20 }, () => f.createApplicant(details)));
	assert.equal(new Set(results.map((result) => result.applicationId)).size, 20);
	assert.equal(f.db.select().from(schema.applicantSequence).get().lastNumber, 20);
});
test('rejects monthly overflow without inserting applicant or changing counter', async (t) => {
	const f = fixture(t);
	f.db.insert(schema.applicantSequence).values({ year: 2026, month: 10, lastNumber: 999998 }).run();
	assert.equal((await f.createApplicant(details)).applicationId, 'MA-202610-999999');
	await assert.rejects(f.createApplicant(details), { status: 409 });
	assert.equal(f.db.select().from(schema.applicantSequence).get().lastNumber, 999999);
	assert.equal(f.db.select().from(schema.applicant).all().length, 1);
});
test('invalid programs and unauthorized roles do not allocate numbers', async (t) => {
	const f = fixture(t);
	await assert.rejects(f.createApplicant({ ...details, programCode: 'Missing' }), { status: 400 });
	assert.deepEqual(f.db.select().from(schema.applicantSequence).all(), []);
	for (const role of [Role.STUDENT, null]) {
		const denied = fixture(t, role);
		await assert.rejects(denied.createApplicant(details), { status: role ? 403 : 401 });
		assert.deepEqual(denied.db.select().from(schema.applicantSequence).all(), []);
	}
});
test('migration archives annual counters, preserves applicants, seeds monthly maximum and retries safely', (t) => {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const migrations = readMigrationFiles(config);
	sqlite.exec(
		'CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)'
	);
	sqlite.transaction(() => {
		for (const migration of migrations.slice(0, 15)) {
			for (const statement of migration.sql) sqlite.exec(statement);
			sqlite
				.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
				.run(migration.hash, migration.folderMillis);
		}
	})();
	sqlite.exec('INSERT INTO applicant_sequence VALUES (2026, 123456)');
	const db = drizzle(sqlite, { schema });
	db.insert(schema.program).values({ id: 'p', code: 'BSIS', name: 'Information Systems' }).run();
	for (const applicationId of [
		'2026-000123',
		'MA-202610-000010',
		'MA-202610-123456',
		'MA-202611-000003'
	]) {
		db.insert(schema.applicant)
			.values({ ...details, applicationId })
			.run();
	}
	const before = db.select().from(schema.applicant).all();
	migrate(db, config);
	assert.deepEqual(sqlite.prepare('SELECT * FROM applicant_sequence_annual_backup').all(), [
		{ year: 2026, last_number: 123456 }
	]);
	assert.deepEqual(db.select().from(schema.applicant).all(), before);
	const counters = db.select().from(schema.applicantSequence).all();
	assert.deepEqual(counters, [
		{ year: 2026, month: 10, lastNumber: 123456 },
		{ year: 2026, month: 11, lastNumber: 3 }
	]);
	migrate(db, config);
	assert.deepEqual(db.select().from(schema.applicantSequence).all(), counters);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
	assert.throws(
		() => sqlite.exec('INSERT INTO applicant_sequence VALUES (2026, 0, 0)'),
		/CHECK constraint/
	);
	assert.throws(
		() => sqlite.exec('INSERT INTO applicant_sequence VALUES (2026, 10, 1)'),
		/UNIQUE constraint/
	);
});
