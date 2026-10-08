import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadModule(filename, dependencies = {}, override) {
	const source = override ?? readFileSync(new URL('../' + filename, import.meta.url), 'utf8');
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => dependencies[id] ?? require(id), exports);
	return exports;
}
const { Role } = loadModule('src/lib/Roles.ts');
const schema = loadModule('src/lib/schema.ts', { '#lib/Roles.js': { Role } });
const error = (status, message) => {
	throw Object.assign(new Error(message), { status });
};
const kit = {
	error,
	isHttpError: (cause) => cause instanceof Error && Number.isInteger(cause.status),
	redirect: (status, location) => {
		throw Object.assign(new Error('redirect'), { status, location });
	}
};
const auth = readFileSync(new URL('../src/lib/server/auth.ts', import.meta.url), 'utf8');
const guard = ts
	.createSourceFile('auth.ts', auth, ts.ScriptTarget.Latest, true)
	.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'validateUser')
	.getText();
const { validateUser } = loadModule(
	'',
	{ '@sveltejs/kit': kit },
	"import {error} from '@sveltejs/kit';\n" + guard
);
const fields = loadModule('src/lib/components/Filter/fields.ts');
const filters = loadModule('src/lib/server/filters.ts', {
	'#lib/components/Filter/fields.js': fields,
	'@sveltejs/kit': kit
});
function fixture(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	sqlite.exec(
		readFileSync(new URL('../drizzle/0007_right_wallflower.sql', import.meta.url), 'utf8').split(
			'PRAGMA foreign_keys=OFF'
		)[0]
	);
	sqlite.exec('CREATE TABLE user (id TEXT PRIMARY KEY);');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	db.insert(schema.program).values({ id: 'p', code: 'BSIS', name: 'Information Systems' }).run();
	db.insert(schema.subject)
		.values([
			{ id: 's1', code: 'IS101', name: 'Introduction' },
			{ id: 's2', code: 'IS102', name: 'Programming' },
			{ id: 's3', code: 'IS103', name: 'Databases', isActive: false }
		])
		.run();
	const locals = { user: { role: Role.ADMIN }, session: {} };
	const dependencies = {
		'#lib/Roles.js': { Role },
		'#lib/schema.js': schema,
		'#lib/server/auth.js': { validateUser },
		'#lib/server/db/index.js': { db },
		'../server/db': { db },
		'#lib/server/filters.js': filters,
		'#lib/components/Table/TableValues.js': { MAX_ITEMS_PER_PAGE: 10 },
		'@sveltejs/kit': kit,
		'$app/paths': {
			resolve: (route, params) => route.replace('[curriculumId]', params?.curriculumId)
		},
		'$app/server': {
			command: (validation, handler) => async (input) => handler(validation.parse(input)),
			getRequestEvent: () => ({ locals })
		}
	};
	const helpers = loadModule('src/lib/server/curriculum.ts', dependencies);
	dependencies['#lib/server/curriculum.js'] = helpers;
	const pages = Object.fromEntries(
		['', '/new', '/[curriculumId]', '/[curriculumId]/edit'].map((route) => [
			route,
			loadModule(`src/routes/user/curriculum${route}/+page.server.ts`, dependencies).load
		])
	);
	return {
		db,
		sqlite,
		locals,
		helpers,
		...loadModule('src/lib/actions/curriculum.remote.ts', dependencies),
		page: (route, query = '', curriculumId = 'c') =>
			pages[route]({
				locals,
				params: { curriculumId },
				url: new URL('https://example.com/user/curriculum' + query)
			})
	};
}
const entry = (subjectId, extra = {}) => ({
	subjectId,
	yearLevel: 1,
	semester: 1,
	units: 3,
	...extra
});

test('curriculum create/update preserve entries and server-owned subject snapshots', async (t) => {
	const f = fixture(t);
	const created = await f.createCurriculum({
		programId: 'p',
		name: ' 2026 Curriculum ',
		publishedAt: new Date(),
		isActive: false,
		subjects: [entry('s1', { subjectCode: 'Forged', subjectName: 'Forged' })]
	});
	let data = f.helpers.getCurriculum(created.id);
	assert.equal(data.curriculum.name, '2026 Curriculum');
	assert.equal(data.curriculum.publishedAt, null);
	assert.equal(data.curriculum.isActive, true);
	assert.equal(data.entries[0].subjectCode, 'IS101');
	const previousId = data.entries[0].id;
	await f.updateCurriculum({
		id: created.id,
		name: 'Updated Curriculum',
		programId: 'p',
		subjects: [entry('s1', { id: previousId, yearLevel: 2, semester: 2, units: 4 }), entry('s2')]
	});
	data = f.helpers.getCurriculum(created.id);
	assert.equal(data.entries.length, 2);
	assert.equal(data.entries.find((row) => row.subjectId === 's1').id, previousId);
	assert.equal(data.entries.find((row) => row.subjectId === 's1').units, 4);
	await f.updateCurriculum({ id: created.id, subjects: [entry('s3')] });
	data = f.helpers.getCurriculum(created.id);
	assert.equal(data.entries.length, 1);
	assert.equal(data.entries[0].subjectCode, 'IS103');
	assert.notEqual(data.entries[0].id, previousId);
	await f.updateCurriculum({ id: created.id, subjects: [] });
	assert.equal(f.helpers.getCurriculum(created.id).entries.length, 0);
});

test('curriculum invalid subjects and foreign entry IDs roll back changes', async (t) => {
	const f = fixture(t);
	await assert.rejects(
		f.createCurriculum({
			name: 'Bad draft',
			programId: 'p',
			subjects: [entry('s1'), entry('missing')]
		}),
		{ status: 400 }
	);
	assert.equal(f.db.select().from(schema.curriculum).all().length, 0);
	await assert.rejects(
		f.createCurriculum({ name: 'Bad draft', programId: 'p', subjects: [entry('s1'), entry('s1')] }),
		{ status: 400 }
	);
	const a = await f.createCurriculum({ name: 'Draft A', programId: 'p', subjects: [entry('s1')] });
	const b = await f.createCurriculum({ name: 'Draft B', programId: 'p', subjects: [entry('s2')] });
	const foreign = f.helpers.getCurriculum(b.id).entries[0];
	await assert.rejects(
		f.updateCurriculum({ id: a.id, name: 'Changed', subjects: [entry('s2', { id: foreign.id })] }),
		{ status: 400 }
	);
	const original = f.helpers.getCurriculum(a.id);
	assert.equal(original.curriculum.name, 'Draft A');
	assert.equal(original.entries[0].subjectId, 's1');
	await assert.rejects(
		f.updateCurriculum({ id: a.id, subjects: [entry('s2', { id: original.entries[0].id })] }),
		{ status: 400 }
	);
});

test('curriculum list searches, filters, totals and pagination use persisted records', (t) => {
	const f = fixture(t);
	f.db
		.insert(schema.curriculum)
		.values(
			Array.from({ length: 12 }, (_, index) => ({
				id: `c${index}`,
				name: `Curriculum ${String(index).padStart(2, '0')}`,
				programId: 'p',
				publishedAt: index === 0 ? new Date('2026-10-08T12:00:00+08:00') : null
			}))
		)
		.run();
	f.db
		.insert(schema.curriculumSubject)
		.values({
			...entry('s1'),
			id: 'e1',
			curriculumId: 'c0',
			subjectCode: 'IS101',
			subjectName: 'Introduction'
		})
		.run();
	assert.equal(f.page('', '?page=2').records.length, 2);
	assert.equal(f.page('', '?q=BSIS').total, 12);
	assert.equal(f.page('', '?q=Information').total, 12);
	assert.equal(f.page('', '?q=Curriculum%2000').records[0].subjectCount, 1);
	assert.equal(f.page('', '?q=Curriculum%2000').records[0].totalUnits, 3);
	assert.equal(f.page('', '?status=draft').total, 11);
	assert.equal(f.page('', '?status=published&filter.publishedAt.min=2026-10-08').total, 1);
	assert.equal(f.page('', '?filter.name=00&filter.isActive=false').total, 0);
	assert.throws(() => f.page('', '?page=999&q=Curriculum%2000'), { status: 302 });
	assert.equal(f.page('', '?q=missing').total, 0);
});

test('registrars can view; only admins can create/edit/delete; published curricula are immutable', async (t) => {
	const f = fixture(t);
	f.db
		.insert(schema.curriculum)
		.values({ id: 'c', name: 'Published Curriculum', programId: 'p', publishedAt: new Date() })
		.run();
	assert.throws(() => f.page('/[curriculumId]/edit'), {
		status: 302,
		location: '/user/curriculum/c'
	});
	await assert.rejects(f.updateCurriculum({ id: 'c', subjects: [] }), { status: 409 });
	assert.throws(() => f.page('/[curriculumId]', '', 'missing'), { status: 404 });
	f.locals.user.role = Role.REGISTRAR;
	assert.equal(f.page('').canManage, false);
	assert.equal(f.page('/[curriculumId]').canManage, false);
	assert.throws(() => f.page('/new'), { status: 403 });
	assert.throws(() => f.page('/[curriculumId]/edit'), { status: 403 });
	await assert.rejects(f.createCurriculum({ name: 'Forbidden', programId: 'p', subjects: [] }), {
		status: 403
	});
	await assert.rejects(f.updateCurriculum({ id: 'c', subjects: [] }), { status: 403 });
	await assert.rejects(f.deleteCurriculum('c'), { status: 403 });
	f.locals.user.role = Role.STUDENT;
	assert.throws(() => f.page(''), { status: 403 });
	assert.throws(() => f.page('/[curriculumId]'), { status: 403 });
	f.locals.user = null;
	f.locals.session = null;
	assert.throws(() => f.page(''), { status: 401 });
});

test('curriculum deletion cascades subject entries but preserves enrollment references', async (t) => {
	const f = fixture(t);
	const draft = await f.createCurriculum({
		name: 'Draft Curriculum',
		programId: 'p',
		subjects: [entry('s1')]
	});
	await f.deleteCurriculum(draft.id);
	assert.equal(f.db.select().from(schema.curriculumSubject).all().length, 0);
	const used = await f.createCurriculum({
		name: 'Used Curriculum',
		programId: 'p',
		subjects: [entry('s1')]
	});
	f.sqlite.exec("INSERT INTO user (id) VALUES ('u')");
	f.db
		.insert(schema.studentData)
		.values({ id: 'student', userId: 'u', studentNumber: '2026-1' })
		.run();
	f.db
		.insert(schema.academicTerm)
		.values({
			id: 'term',
			startYear: 2026,
			semester: 1,
			enrollmentOpensAt: new Date(0),
			enrollmentClosesAt: new Date(1000)
		})
		.run();
	f.db
		.insert(schema.enrollment)
		.values({
			id: 'enrollment',
			studentId: 'student',
			termId: 'term',
			curriculumId: used.id,
			yearLevel: 1
		})
		.run();
	await assert.rejects(f.deleteCurriculum(used.id), { status: 400 });
	assert.equal(f.helpers.getCurriculum(used.id).entries.length, 1);
});
