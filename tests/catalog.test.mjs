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
function fixture(t, role = 'admin') {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	sqlite.pragma('foreign_keys = ON');
	const locals = { user: role ? { role } : null, session: role ? {} : null };
	const dependencies = {
		'#lib/Roles.js': { Role },
		'#lib/server/auth.js': { validateUser },
		'#lib/schema.js': schema,
		'#lib/server/filters.js': filterHelpers,
		'../server/db': { db },
		'#lib/server/db/index.js': { db },
		'#lib/components/Table/TableValues.js': { MAX_ITEMS_PER_PAGE: 10 },
		'$app/server': {
			command: (validation, handler) => async (input) => handler(validation.parse(input)),
			getRequestEvent: () => ({ locals })
		},
		'@sveltejs/kit': {
			error,
			isHttpError: (cause) => cause instanceof Error && Number.isInteger(cause.status),
			redirect: (status, location) => {
				throw Object.assign(new Error('redirect'), { status, location });
			}
		}
	};
	dependencies['#lib/server/curriculum.js'] = loadModule(
		'src/lib/server/curriculum.ts',
		dependencies
	);
	return {
		db,
		locals,
		program: loadModule('src/lib/actions/program.remote.ts', dependencies),
		curriculum: loadModule('src/lib/actions/curriculum.remote.ts', dependencies),
		curriculumHelpers: dependencies['#lib/server/curriculum.js'],
		applicant: loadModule('src/lib/actions/applicant.remote.ts', dependencies),
		subject: loadModule('src/lib/actions/subject.remote.ts', dependencies),
		loadApplicants: loadModule('src/routes/user/applicants/+page.server.ts', dependencies).load,
		loadApplicant: loadModule(
			'src/routes/user/applicants/[applicantId]/+page.server.ts',
			dependencies
		).load,
		loadProgram: loadModule('src/routes/user/programs/+page.server.ts', dependencies).load,
		loadSubject: loadModule('src/routes/user/subjects/+page.server.ts', dependencies).load
	};
}
for (const kind of ['program', 'subject']) {
	const label = kind[0].toUpperCase() + kind.slice(1);
	test(`${kind}: admin create/update/delete use persisted records`, async (t) => {
		const f = fixture(t);
		const api = f[kind];
		const table = schema[kind];
		const created = await api[`create${label}`]({
			code: ' TEST ',
			name: ' Test Record ',
			description: 'Details',
			isActive: true
		});
		const row = f.db.select().from(table).get();
		assert.equal(row.code, 'TEST');
		assert.equal(row.name, 'Test Record');
		assert.deepEqual(created, row);
		await api[`update${label}`]({
			id: row.id,
			name: 'Updated Record',
			description: null,
			isActive: false
		});
		assert.equal(f.db.select().from(table).get().name, 'Updated Record');
		await api[`set${label}Status`]({ id: row.id, isActive: true });
		assert.equal(f.db.select().from(table).get().isActive, true);
		await api[`delete${label}`](row.id);
		assert.equal(f.db.select().from(table).all().length, 0);
		await assert.rejects(api[`update${label}`]({ id: 'missing', name: 'Missing Record' }), {
			status: 404
		});
		await assert.rejects(api[`delete${label}`]('missing'), { status: 404 });
	});
	test(`${kind}: registrar may view but cannot mutate`, async (t) => {
		const f = fixture(t, 'registrar');
		const api = f[kind];
		const load = f[`load${label}`];
		const data = load({ locals: f.locals, url: new URL(`https://example.com/user/${kind}s`) });
		assert.equal(data.canManage, false);
		for (const [name, input] of [
			[`create${label}`, { name: 'Record Name', code: 'CODE' }],
			[`update${label}`, { id: 'record', name: 'Edited Record' }],
			[`delete${label}`, 'record'],
			[`set${label}Status`, { id: 'record', isActive: false }]
		])
			await assert.rejects(api[name](input), { status: 403 });
		assert.equal(f.db.select().from(schema[kind]).all().length, 0);
	});
	test(`${kind}: student and anonymous cannot load page`, (t) => {
		for (const role of ['student', null]) {
			const f = fixture(t, role);
			assert.throws(
				() => f[`load${label}`]({ locals: f.locals, url: new URL('https://example.com/') }),
				{ status: role ? 403 : 401 }
			);
		}
	});
	test(`${kind}: search, status and pagination return matching data`, (t) => {
		const f = fixture(t);
		const table = schema[kind];
		f.db
			.insert(table)
			.values(
				Array.from({ length: 12 }, (_, i) => ({
					id: String(i),
					code: `CODE-${i}`,
					name: `Record ${String(i).padStart(2, '0')}`,
					isActive: i !== 0
				}))
			)
			.run();
		const load = (query) =>
			f[`load${label}`]({
				locals: f.locals,
				url: new URL(`https://example.com/user/${kind}s${query}`)
			});
		assert.equal(load('?page=2').records.length, 2);
		assert.equal(load('?page=2').total, 12);
		assert.equal(load('?status=inactive').records.length, 1);
		assert.equal(load('?status=active').total, 11);
		assert.equal(load('?q=CODE-11').records[0].id, '11');
		assert.equal(load('?q=Record%2005').total, 1);
		assert.equal(load('?filter.code=CODE-1&filter.isActive=true').total, 3);
		assert.equal(load('?filter.name=Record%2005&filter.isActive=false').total, 0);
		assert.equal(load('?filter.code=CODE-11&filter.name=Record').records[0].id, '11');
		assert.equal(load('?filter.id=0').total, 12);
		assert.deepEqual(load('?status=inactive').filters, { isActive: 'false' });
		assert.throws(() => load('?filter.isActive=invalid'), { status: 400 });
		assert.equal(load('?page=invalid&status=invalid').records.length, 10);
		assert.throws(
			() => load('?page=999&q=CODE-11'),
			(err) =>
				err.status === 302 && err.location.includes('page=1') && err.location.includes('q=CODE-11')
		);
	});
	test(`${kind}: duplicate code is rejected`, async (t) => {
		const f = fixture(t);
		const api = f[kind];
		await api[`create${label}`]({ code: 'CODE', name: 'First Record' });
		await assert.rejects(api[`create${label}`]({ code: 'CODE', name: 'Second Record' }));
		assert.equal(f.db.select().from(schema[kind]).all().length, 1);
	});
}
test('catalog deletion preserves existing curriculum references', async (t) => {
	const f = fixture(t);
	f.db.insert(schema.program).values({ id: 'p', code: 'P', name: 'Program' }).run();
	f.db.insert(schema.subject).values({ id: 's', code: 'S', name: 'Subject' }).run();
	f.db
		.insert(schema.curriculum)
		.values({ id: 'c', programId: 'p', name: 'Existing Curriculum' })
		.run();
	f.db
		.insert(schema.curriculumSubject)
		.values({
			id: 'cs',
			curriculumId: 'c',
			subjectId: 's',
			yearLevel: 1,
			semester: 1,
			units: 3,
			subjectCode: 'S',
			subjectName: 'Subject'
		})
		.run();
	await assert.rejects(f.program.deleteProgram('p'), { status: 400 });
	await assert.rejects(f.subject.deleteSubject('s'), { status: 400 });
	assert.equal(f.db.select().from(schema.program).all().length, 1);
	assert.equal(f.db.select().from(schema.subject).all().length, 1);
});

test('applicants use catalog programs and keep program edits linked', async (t) => {
	const f = fixture(t);
	await f.program.createProgram({ code: 'BSIS', name: 'Information Systems' });
	await f.program.createProgram({ code: 'ACT', name: 'Computer Technology' });
	const owner = f.db
		.select()
		.from(schema.program)
		.all()
		.find((record) => record.code === 'BSIS');
	await assert.rejects(
		f.program.updateProgram({ id: owner.id, activeCurriculumId: 'forged-pointer' }),
		{ status: 404 }
	);
	assert.equal(
		f.db
			.select()
			.from(schema.program)
			.all()
			.find((record) => record.id === owner.id).activeCurriculumId,
		null
	);
	const details = {
		applicationId: '2026-000001',
		name: 'Applicant',
		program: 'BSIS',
		yearLevel: 1,
		dateApplied: new Date(),
		email: 'applicant@example.com',
		contactNumber: '09123456789',
		address: 'Bulacan'
	};
	await assert.rejects(f.applicant.createApplicant({ ...details, program: 'Made up' }), {
		status: 400
	});
	assert.equal(f.db.select().from(schema.applicant).all().length, 0);
	f.locals.user.role = 'registrar';
	await f.applicant.createApplicant(details);
	const record = f.db.select().from(schema.applicant).get();
	const options = await f.loadApplicants({
		locals: f.locals,
		url: new URL('https://example.com/user/applicants')
	});
	assert.deepEqual(
		options.programs.map(({ code }) => code),
		['ACT', 'BSIS']
	);
	const view = await f.loadApplicant({ locals: f.locals, params: { applicantId: record.id } });
	assert.deepEqual(view.programs, options.programs);
	await assert.rejects(f.applicant.updateApplicant({ id: record.id, program: 'Missing' }), {
		status: 400
	});
	assert.equal(f.db.select().from(schema.applicant).get().program, 'BSIS');
	await f.applicant.updateApplicant({ id: record.id, name: 'Updated Applicant' });
	f.locals.user.role = 'student';
	await assert.rejects(f.applicant.createApplicant({ ...details, applicationId: '2026-000002' }), {
		status: 403
	});
	f.locals.user.role = 'admin';
	const selected = f.db
		.select()
		.from(schema.program)
		.all()
		.find((record) => record.code === 'BSIS');
	await assert.rejects(f.program.deleteProgram(selected.id), {
		status: 400,
		message: 'Cannot delete program because it is in use by an applicant.'
	});
	await f.program.updateProgram({ id: selected.id, code: 'IS', name: 'Renamed Program' });
	assert.equal(f.db.select().from(schema.applicant).get().program, 'IS');
	await f.applicant.updateApplicant({ id: record.id, program: 'ACT' });
	await f.program.deleteProgram(selected.id);
	assert.equal(f.db.select().from(schema.applicant).get().program, 'ACT');
});

test('applicant catalog migration clears seed applicants and preserves other records', (t) => {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const migrations = readMigrationFiles({ migrationsFolder: 'drizzle' });
	for (const migration of migrations.slice(0, 10)) {
		for (const statement of migration.sql) sqlite.exec(statement);
	}
	sqlite.exec(`
		INSERT INTO user (id, name, email, updated_at) VALUES ('u', 'Student', 'student@example.com', 0);
		INSERT INTO student (id, user_id, student_number) VALUES ('student', 'u', '2026-1');
		INSERT INTO program (id, code, name) VALUES ('p', 'BSIS', 'Information Systems');
		INSERT INTO applicant (id, user_id, application_id, name, program, year_level, date_applied, email, contact_number, address)
		VALUES ('seed', 'u', '2026-1', 'Seed Applicant', 'Random seed program', 1, 0, 'seed@example.com', '09', 'Bulacan');
	`);
	const users = sqlite.prepare('SELECT * FROM user').all();
	const students = sqlite.prepare('SELECT * FROM student').all();
	const programs = sqlite.prepare('SELECT * FROM program').all();
	for (const statement of migrations[10].sql) sqlite.exec(statement);
	assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM applicant').get().count, 0);
	assert.deepEqual(sqlite.prepare('SELECT * FROM user').all(), users);
	assert.deepEqual(sqlite.prepare('SELECT * FROM student').all(), students);
	assert.deepEqual(sqlite.prepare('SELECT * FROM program').all(), programs);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
	const insert =
		sqlite.prepare(`INSERT INTO applicant (id, application_id, name, program, year_level, date_applied, email, contact_number, address)
		VALUES ('new', '2026-2', 'Applicant', ?, 1, 0, 'new@example.com', '09', 'Bulacan')`);
	assert.throws(() => insert.run('Missing'), /FOREIGN KEY/);
	insert.run('BSIS');
	assert.throws(() => sqlite.prepare("DELETE FROM program WHERE id = 'p'").run(), /FOREIGN KEY/);
	sqlite.prepare("UPDATE program SET code = 'IS' WHERE id = 'p'").run();
	assert.equal(sqlite.prepare('SELECT program FROM applicant').get().program, 'IS');
});

test('program edits change the active curriculum atomically, support None, and reject foreign curricula', async (t) => {
	const f = fixture(t);
	const p = await f.program.createProgram({ code: 'BSIS', name: 'Information Systems' });
	const other = await f.program.createProgram({ code: 'ACT', name: 'Computer Technology' });
	f.db.insert(schema.subject).values({ id: 's', code: 'IS101', name: 'Introduction' }).run();
	const subjects = [{ subjectId: 's', yearLevel: 1, semester: 1, units: 3 }];
	const a = await f.curriculum.createCurriculum({
		programId: p.id,
		name: 'Original Curriculum',
		subjects
	});
	const b = await f.curriculum.createCurriculum({
		programId: p.id,
		name: 'Replacement Curriculum',
		subjects
	});
	const foreign = await f.curriculum.createCurriculum({
		programId: other.id,
		name: 'Other Curriculum',
		subjects
	});
	await f.program.updateProgram({ id: p.id, name: 'Updated Program', activeCurriculumId: a.id });
	const original = f.curriculumHelpers.getCurriculum(a.id);
	assert.equal(original.curriculum.status, 'active');
	assert.equal(original.curriculum.programName, 'Updated Program');
	assert.ok(original.curriculum.publishedAt);
	const catalogs = f.loadProgram({
		locals: f.locals,
		url: new URL('https://example.com/user/programs')
	});
	assert.deepEqual(
		catalogs.curricula
			.filter((record) => record.programId === p.id)
			.map(({ id }) => id)
			.sort(),
		[a.id, b.id].sort()
	);
	await assert.rejects(
		f.program.updateProgram({ id: p.id, name: 'Invalid change', activeCurriculumId: foreign.id }),
		{ status: 400 }
	);
	assert.deepEqual(f.curriculumHelpers.getCurriculum(a.id), original);
	await f.program.updateProgram({ id: p.id, activeCurriculumId: b.id });
	assert.equal(f.curriculumHelpers.getCurriculum(a.id).curriculum.status, 'archived');
	assert.equal(f.curriculumHelpers.getCurriculum(b.id).curriculum.status, 'active');
	await f.program.updateProgram({ id: p.id, name: 'Metadata only' });
	assert.equal(f.curriculumHelpers.getCurriculum(b.id).curriculum.status, 'active');
	await f.program.updateProgram({ id: p.id, activeCurriculumId: null });
	assert.equal(f.curriculumHelpers.getCurriculum(b.id).curriculum.status, 'inactive');
	assert.equal(
		f
			.loadProgram({ locals: f.locals, url: new URL('https://example.com/user/programs') })
			.records.find((row) => row.id === p.id).activeCurriculumId,
		null
	);
	await f.program.updateProgram({ id: p.id, activeCurriculumId: a.id });
	assert.deepEqual(f.curriculumHelpers.getCurriculum(a.id).entries, original.entries);
	assert.equal(
		f.curriculumHelpers.getCurriculum(a.id).curriculum.publishedAt.getTime(),
		original.curriculum.publishedAt.getTime()
	);
	f.locals.user.role = 'registrar';
	await assert.rejects(f.program.updateProgram({ id: p.id, activeCurriculumId: null }), {
		status: 403
	});
	f.locals.user.role = 'admin';
	t.mock.method(console, 'error', () => {});
	const before = [f.curriculumHelpers.getCurriculum(a.id), f.curriculumHelpers.getCurriculum(b.id)];
	f.db.run(
		require('drizzle-orm').sql.raw(
			"CREATE TRIGGER reject_switch BEFORE UPDATE OF active_curriculum_id ON program BEGIN SELECT RAISE(ABORT, 'test failure'); END;"
		)
	);
	await assert.rejects(
		f.program.updateProgram({ id: p.id, name: 'Failed metadata', activeCurriculumId: b.id }),
		{ status: 500 }
	);
	assert.deepEqual(
		[f.curriculumHelpers.getCurriculum(a.id), f.curriculumHelpers.getCurriculum(b.id)],
		before
	);
});
