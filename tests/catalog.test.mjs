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
function fixture(t, role = 'admin') {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	sqlite.exec(
		readFileSync(new URL('../drizzle/0007_right_wallflower.sql', import.meta.url), 'utf8').split(
			'PRAGMA foreign_keys=OFF'
		)[0]
	);
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	const locals = { user: role ? { role } : null, session: role ? {} : null };
	const dependencies = {
		'#lib/Roles.js': { Role },
		'#lib/server/auth.js': { validateUser },
		'#lib/schema.js': schema,
		'../server/db': { db },
		'#lib/server/db/index.js': { db },
		'#lib/components/Table/TableValues.js': { MAX_ITEMS_PER_PAGE: 10 },
		'$app/server': {
			command: (validation, handler) => async (input) => handler(validation.parse(input)),
			getRequestEvent: () => ({ locals })
		},
		'@sveltejs/kit': {
			error,
			redirect: (status, location) => {
				throw Object.assign(new Error('redirect'), { status, location });
			}
		}
	};
	return {
		db,
		locals,
		program: loadModule('src/lib/actions/program.remote.ts', dependencies),
		subject: loadModule('src/lib/actions/subject.remote.ts', dependencies),
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
		await api[`create${label}`]({
			code: ' TEST ',
			name: ' Test Record ',
			description: 'Details',
			isActive: true
		});
		const row = f.db.select().from(table).get();
		assert.equal(row.code, 'TEST');
		assert.equal(row.name, 'Test Record');
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
