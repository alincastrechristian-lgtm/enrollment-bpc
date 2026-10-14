import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
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
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
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
		programCode: 'BSIS',
		name: ' 2026 Curriculum ',
		publishedAt: new Date(),
		isActive: false,
		subjects: [entry('s1', { subjectCode: 'Forged', subjectName: 'Forged' })]
	});
	let data = f.helpers.getCurriculum(created.id);
	assert.equal(data.curriculum.name, '2026 Curriculum');
	assert.equal(data.curriculum.publishedAt, null);
	assert.equal(data.curriculum.isActive, true);
	assert.equal(data.curriculum.yearLevels, 4);
	assert.equal(data.curriculum.semesters, 2);
	assert.equal(data.entries[0].subjectCode, 'IS101');
	const previousId = data.entries[0].id;
	await f.updateCurriculum({
		id: created.id,
		name: 'Updated Curriculum',
		programCode: 'BSIS',
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

test('curriculum migration preserves existing records and adds default limits', (t) => {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	sqlite.exec(
		readFileSync(new URL('../drizzle/0007_right_wallflower.sql', import.meta.url), 'utf8').split(
			'PRAGMA foreign_keys=OFF'
		)[0]
	);
	sqlite.exec(`
		INSERT INTO program (id, code, name) VALUES ('p', 'P', 'Program');
		INSERT INTO subject (id, code, name) VALUES ('s', 'S', 'Subject');
		INSERT INTO curriculum (id, program_id, name, published_at) VALUES ('c', 'p', 'Published', 1234);
		INSERT INTO curriculum_subject (id, curriculum_id, subject_id, year_level, semester, units, subject_code, subject_name)
		VALUES ('entry', 'c', 's', 4, 3, 3, 'Original S', 'Original Subject');
	`);
	const original = sqlite.prepare('SELECT * FROM curriculum_subject').get();
	sqlite.transaction(() => {
		sqlite.exec(
			readFileSync(new URL('../drizzle/0008_curriculum_limits.sql', import.meta.url), 'utf8')
		);
	})();
	const migrated = sqlite.prepare('SELECT * FROM curriculum').get();
	assert.equal(migrated.year_levels, 4);
	assert.equal(migrated.regular_semesters, 2);
	assert.equal(migrated.published_at, 1234);
	assert.equal(migrated.name, 'Published');
	assert.deepEqual(sqlite.prepare('SELECT * FROM curriculum_subject').get(), original);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
});

test('semester rename preserves values, subjects, defaults and supports rollback', (t) => {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	sqlite.exec(
		readFileSync(new URL('../drizzle/0007_right_wallflower.sql', import.meta.url), 'utf8').split(
			'PRAGMA foreign_keys=OFF'
		)[0]
	);
	sqlite.exec(
		readFileSync(new URL('../drizzle/0008_curriculum_limits.sql', import.meta.url), 'utf8')
	);
	sqlite.pragma('foreign_keys = ON');
	sqlite.exec(`
		INSERT INTO program (id, code, name) VALUES ('p', 'P', 'Program');
		INSERT INTO subject (id, code, name) VALUES ('s', 'S', 'Subject');
		INSERT INTO curriculum (id, program_id, name, year_levels, regular_semesters, published_at)
		VALUES ('c', 'p', 'Published', 5, 3, 1234);
		INSERT INTO curriculum_subject (id, curriculum_id, subject_id, year_level, semester, units, subject_code, subject_name)
		VALUES ('entry', 'c', 's', 5, 3, 3, 'Original S', 'Original Subject');
	`);
	const original = sqlite.prepare('SELECT * FROM curriculum').get();
	const subjects = sqlite.prepare('SELECT * FROM curriculum_subject').all();
	const migration = readFileSync(
		new URL('../drizzle/0009_rename_curriculum_semesters.sql', import.meta.url),
		'utf8'
	);
	sqlite.transaction(() => sqlite.exec(migration))();
	const { regular_semesters, ...remaining } = original;
	assert.deepEqual(sqlite.prepare('SELECT * FROM curriculum').get(), {
		...remaining,
		semesters: regular_semesters
	});
	assert.deepEqual(sqlite.prepare('SELECT * FROM curriculum_subject').all(), subjects);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
	assert.ok(
		!sqlite.pragma('table_info(curriculum)').some((column) => column.name === 'regular_semesters')
	);
	sqlite.exec("INSERT INTO curriculum (id, program_id, name) VALUES ('default', 'p', 'Default')");
	assert.equal(
		sqlite.prepare("SELECT semesters FROM curriculum WHERE id = 'default'").get().semesters,
		2
	);
	sqlite.transaction(() =>
		sqlite.exec('ALTER TABLE curriculum RENAME COLUMN semesters TO regular_semesters')
	)();
	assert.deepEqual(sqlite.prepare("SELECT * FROM curriculum WHERE id = 'c'").get(), original);
	sqlite.transaction(() => sqlite.exec(migration))();
	assert.equal(
		sqlite.prepare("SELECT semesters FROM curriculum WHERE id = 'c'").get().semesters,
		3
	);
	assert.deepEqual(sqlite.prepare('SELECT * FROM curriculum_subject').all(), subjects);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
});

test('curriculum limits reject malformed counts and out-of-range subject placements', async (t) => {
	const f = fixture(t);
	for (const field of ['yearLevels', 'semesters']) {
		for (const value of [0, -1, 1.5, null, '2', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			await assert.rejects(
				f.createCurriculum({
					name: 'Invalid limits',
					programCode: 'BSIS',
					subjects: [],
					[field]: value
				})
			);
		}
	}
	for (const placement of [{ yearLevel: 5 }, { semester: 3 }, { semester: 4 }]) {
		await assert.rejects(
			f.createCurriculum({
				name: 'Out of bounds',
				programCode: 'BSIS',
				subjects: [entry('s1', placement)]
			}),
			{ status: 400 }
		);
	}
	assert.equal(f.db.select().from(schema.curriculum).all().length, 0);
	const standard = await f.createCurriculum({
		name: 'Default Semesters',
		programCode: 'BSIS',
		subjects: [entry('s1', { yearLevel: 4, semester: 2 })]
	});
	assert.equal(f.helpers.getCurriculum(standard.id).entries[0].semester, 2);
	await assert.rejects(
		f.createCurriculum({
			name: 'Extra Semester',
			programCode: 'BSIS',
			yearLevels: 3,
			semesters: 3,
			subjects: [entry('s2', { yearLevel: 3, semester: 4 })]
		}),
		{ status: 400 }
	);
	const custom = await f.createCurriculum({
		name: 'Custom Semesters',
		programCode: 'BSIS',
		yearLevels: 3,
		semesters: 3,
		subjects: [entry('s2', { yearLevel: 3, semester: 3 })]
	});
	const original = f.helpers.getCurriculum(custom.id);
	const row = original.entries[0];
	const subjects = [entry('s2', { id: row.id, yearLevel: 3, semester: 3 })];
	await f.updateCurriculum({ id: custom.id, name: 'Renamed', subjects });
	assert.equal(f.helpers.getCurriculum(custom.id).curriculum.semesters, 3);
	for (const change of [
		{ yearLevels: 2 },
		{ semesters: 2 },
		{ subjects: [entry('s2', { id: row.id, yearLevel: 4, semester: 3 })] },
		{ subjects: [entry('s2', { id: row.id, yearLevel: 3, semester: 4 })] }
	]) {
		await assert.rejects(
			f.updateCurriculum({ id: custom.id, name: 'Rejected', subjects, ...change }),
			{ status: 400 }
		);
		const current = f.helpers.getCurriculum(custom.id);
		assert.equal(current.curriculum.name, 'Renamed');
		assert.equal(current.curriculum.yearLevels, 3);
		assert.equal(current.curriculum.semesters, 3);
		assert.deepEqual(current.entries, original.entries);
	}
	await assert.rejects(f.updateCurriculum({ id: custom.id, semesters: 0, subjects }));
	await f.updateCurriculum({
		id: custom.id,
		yearLevels: 2,
		semesters: 1,
		subjects: [entry('s2', { id: row.id, yearLevel: 2, semester: 1 })]
	});
	const revised = f.helpers.getCurriculum(custom.id);
	assert.equal(revised.curriculum.yearLevels, 2);
	assert.equal(revised.curriculum.semesters, 1);
	assert.equal(revised.entries[0].semester, 1);
});

test('curriculum invalid subjects and foreign entry IDs roll back changes', async (t) => {
	const f = fixture(t);
	await assert.rejects(
		f.createCurriculum({
			name: 'Bad draft',
			programCode: 'BSIS',
			subjects: [entry('s1'), entry('missing')]
		}),
		{ status: 400 }
	);
	assert.equal(f.db.select().from(schema.curriculum).all().length, 0);
	await assert.rejects(
		f.createCurriculum({
			name: 'Bad draft',
			programCode: 'BSIS',
			subjects: [entry('s1'), entry('s1')]
		}),
		{ status: 400 }
	);
	const a = await f.createCurriculum({
		name: 'Draft A',
		programCode: 'BSIS',
		subjects: [entry('s1')]
	});
	const b = await f.createCurriculum({
		name: 'Draft B',
		programCode: 'BSIS',
		subjects: [entry('s2')]
	});
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
				programCode: 'BSIS',
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
	f.db.update(schema.program).set({ activeCurriculumId: 'c0' }).run();
	assert.equal(f.page('', '?status=active&filter.publishedAt.min=2026-10-08').total, 1);
	assert.equal(f.page('', '?status=archived').total, 0);
	assert.equal(f.page('', '?filter.name=00&status=draft').total, 0);
	assert.throws(() => f.page('', '?page=999&q=Curriculum%2000'), { status: 302 });
	assert.equal(f.page('', '?q=missing').total, 0);
});

test('registrars can view; only admins can create/edit/delete; published curricula are immutable', async (t) => {
	const f = fixture(t);
	f.db
		.insert(schema.curriculum)
		.values({ id: 'c', name: 'Published Curriculum', programCode: 'BSIS', publishedAt: new Date() })
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
	await assert.rejects(
		f.createCurriculum({ name: 'Forbidden', programCode: 'BSIS', subjects: [] }),
		{
			status: 403
		}
	);
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
		programCode: 'BSIS',
		subjects: [entry('s1')]
	});
	await f.deleteCurriculum(draft.id);
	assert.equal(f.db.select().from(schema.curriculumSubject).all().length, 0);
	const used = await f.createCurriculum({
		name: 'Used Curriculum',
		programCode: 'BSIS',
		subjects: [entry('s1')]
	});
	f.sqlite.exec(
		"INSERT INTO user (id, name, email) VALUES ('u', 'Student', 'student@example.com'); INSERT INTO student (id, user_id) VALUES ('student', 'u')"
	);
	f.db
		.insert(schema.enrollment)
		.values({
			id: 'enrollment',
			studentId: 'student',
			schoolYearStart: 2026,
			semester: 1,
			section: 'A',
			curriculumId: used.id,
			yearLevel: 1
		})
		.run();
	await assert.rejects(f.deleteCurriculum(used.id), { status: 400 });
	assert.equal(f.helpers.getCurriculum(used.id).entries.length, 1);
});

test('activation archives the previous version without moving existing enrollments', async (t) => {
	const f = fixture(t);
	const a = await f.createCurriculum({
		name: 'First Curriculum',
		programCode: 'BSIS',
		subjects: [entry('s1')]
	});
	const b = await f.createCurriculum({
		name: 'Replacement Curriculum',
		programCode: 'BSIS',
		subjects: [entry('s2')]
	});
	f.db
		.update(schema.subject)
		.set({ name: 'Published snapshot' })
		.where(eq(schema.subject.id, 's1'))
		.run();
	assert.equal(f.helpers.getCurriculum(a.id).curriculum.status, 'draft');
	await f.activateCurriculum(a.id);
	const original = f.helpers.getCurriculum(a.id);
	assert.equal(original.curriculum.status, 'active');
	assert.equal(original.curriculum.activeCurriculumId, a.id);
	assert.equal(original.entries[0].subjectName, 'Published snapshot');
	await assert.rejects(f.updateCurriculum({ id: a.id, subjects: [] }), { status: 409 });
	await assert.rejects(f.deleteCurriculum(a.id), { status: 400 });
	f.sqlite.exec(
		"INSERT INTO user (id, name, email) VALUES ('u', 'Student', 'student@example.com'); INSERT INTO student (id, user_id) VALUES ('student', 'u')"
	);
	f.db
		.insert(schema.enrollment)
		.values({
			id: 'enrolled',
			studentId: 'student',
			schoolYearStart: 2026,
			semester: 1,
			section: 'A',
			curriculumId: a.id,
			yearLevel: 1
		})
		.run();
	const enrolled = f.db.select().from(schema.enrollment).all();
	await f.activateCurriculum(b.id);
	assert.equal(f.helpers.getCurriculum(a.id).curriculum.status, 'archived');
	assert.equal(f.helpers.getCurriculum(b.id).curriculum.status, 'active');
	assert.deepEqual(f.db.select().from(schema.enrollment).all(), enrolled);
	assert.deepEqual(f.helpers.getCurriculum(a.id).entries, original.entries);
	await assert.rejects(f.deleteCurriculum(a.id), { status: 400 });
	await assert.rejects(f.updateCurriculum({ id: a.id, subjects: [] }), { status: 409 });
	f.db.update(schema.subject).set({ name: 'Changed catalog name' }).run();
	await f.activateCurriculum(a.id);
	assert.equal(f.helpers.getCurriculum(a.id).curriculum.status, 'active');
	assert.equal(f.helpers.getCurriculum(b.id).curriculum.status, 'archived');
	assert.deepEqual(f.helpers.getCurriculum(a.id).entries, original.entries);
	assert.equal(
		f.helpers.getCurriculum(a.id).curriculum.publishedAt.getTime(),
		original.curriculum.publishedAt.getTime()
	);
	await f.activateCurriculum(a.id);
	assert.equal(f.page('', '?status=active').total, 1);
	assert.equal(f.page('', '?status=archived').total, 1);
	assert.deepEqual(f.db.select().from(schema.enrollment).all(), enrolled);
	await f.changeCurriculumState({ id: a.id, action: 'deactivate' });
	assert.equal(f.helpers.getCurriculum(a.id).curriculum.status, 'inactive');
	assert.equal(f.db.select().from(schema.program).get().activeCurriculumId, null);
	await f.changeCurriculumState({ id: b.id, action: 'restore' });
	assert.equal(f.helpers.getCurriculum(b.id).curriculum.status, 'inactive');
	assert.equal(f.page('', '?status=inactive').total, 2);
	await f.activateCurriculum(b.id);
	await f.changeCurriculumState({ id: a.id, action: 'deactivate' });
	assert.equal(f.helpers.getCurriculum(b.id).curriculum.status, 'active');
	await f.changeCurriculumState({ id: a.id, action: 'archive' });
	const archivedAt = f.helpers.getCurriculum(a.id).curriculum.archivedAt.getTime();
	await f.changeCurriculumState({ id: a.id, action: 'archive' });
	assert.equal(f.helpers.getCurriculum(a.id).curriculum.archivedAt.getTime(), archivedAt);
	assert.equal(f.helpers.getCurriculum(b.id).curriculum.status, 'active');
	await f.changeCurriculumState({ id: a.id, action: 'restore' });
	assert.equal(f.helpers.getCurriculum(a.id).curriculum.status, 'inactive');
	assert.equal(f.helpers.getCurriculum(b.id).curriculum.status, 'active');
	await f.changeCurriculumState({ id: b.id, action: 'archive' });
	assert.equal(f.helpers.getCurriculum(b.id).curriculum.status, 'archived');
	assert.equal(f.db.select().from(schema.program).get().activeCurriculumId, null);
	assert.equal(f.page('', '?status=active').total, 0);
	await f.changeCurriculumState({ id: b.id, action: 'restore' });
	assert.equal(f.helpers.getCurriculum(b.id).curriculum.status, 'inactive');
	assert.equal(f.db.select().from(schema.program).get().activeCurriculumId, null);
	assert.deepEqual(f.db.select().from(schema.enrollment).all(), enrolled);
	assert.deepEqual(f.helpers.getCurriculum(a.id).entries, original.entries);
	assert.equal(
		f.helpers.getCurriculum(a.id).curriculum.publishedAt.getTime(),
		original.curriculum.publishedAt.getTime()
	);
	await assert.rejects(f.updateCurriculum({ id: a.id, subjects: [] }), { status: 409 });
});

test('archived drafts must be restored before editing; manual state changes are admin-only', async (t) => {
	const f = fixture(t);
	const draft = await f.createCurriculum({
		name: 'Draft Curriculum',
		programCode: 'BSIS',
		subjects: []
	});
	await f.changeCurriculumState({ id: draft.id, action: 'archive' });
	assert.equal(f.helpers.getCurriculum(draft.id).curriculum.status, 'archived');
	assert.equal(f.helpers.getCurriculum(draft.id).curriculum.publishedAt, null);
	assert.throws(() => f.page('/[curriculumId]/edit', '', draft.id), { status: 302 });
	await assert.rejects(f.updateCurriculum({ id: draft.id, name: 'Invalid edit', subjects: [] }), {
		status: 409
	});
	await f.changeCurriculumState({ id: draft.id, action: 'restore' });
	assert.equal(f.helpers.getCurriculum(draft.id).curriculum.status, 'draft');
	await f.updateCurriculum({ id: draft.id, name: 'Restored Draft', subjects: [] });
	const before = f.helpers.getCurriculum(draft.id);
	for (const role of [Role.REGISTRAR, Role.STUDENT, null]) {
		f.locals.user = role ? { role } : null;
		for (const action of ['archive', 'restore', 'deactivate']) {
			await assert.rejects(f.changeCurriculumState({ id: draft.id, action }), {
				status: role ? 403 : 401
			});
		}
	}
	f.locals.user = { role: Role.ADMIN };
	assert.deepEqual(f.helpers.getCurriculum(draft.id), before);
	await assert.rejects(f.changeCurriculumState({ id: 'missing', action: 'archive' }), {
		status: 404
	});
	await assert.rejects(f.changeCurriculumState({ id: draft.id, action: 'invalid' }));
});

test('failed manual archive rolls back the program pointer and curriculum state together', async (t) => {
	const f = fixture(t);
	const a = await f.createCurriculum({
		name: 'Active Curriculum',
		programCode: 'BSIS',
		subjects: [entry('s1')]
	});
	await f.activateCurriculum(a.id);
	const before = f.helpers.getCurriculum(a.id);
	t.mock.method(console, 'error', () => {});
	f.sqlite.exec(
		"CREATE TRIGGER fail_archive BEFORE UPDATE OF archived_at ON curriculum WHEN NEW.archived_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'test failure'); END;"
	);
	await assert.rejects(f.changeCurriculumState({ id: a.id, action: 'archive' }), { status: 500 });
	assert.deepEqual(f.helpers.getCurriculum(a.id), before);
});

test('manual archive migration preserves prior statuses and enrollment history', (t) => {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	sqlite.exec(`CREATE TABLE curriculum (id TEXT PRIMARY KEY, published_at INTEGER);
		CREATE TABLE program (id TEXT PRIMARY KEY, active_curriculum_id TEXT REFERENCES curriculum(id));
		CREATE TABLE enrollment (id TEXT PRIMARY KEY, curriculum_id TEXT REFERENCES curriculum(id));
		INSERT INTO curriculum VALUES ('current', 10), ('old', 20), ('draft', NULL);
		INSERT INTO program VALUES ('p', 'current'); INSERT INTO enrollment VALUES ('student', 'old');`);
	const curricula = sqlite.prepare('SELECT * FROM curriculum').all();
	const enrollments = sqlite.prepare('SELECT * FROM enrollment').all();
	sqlite.exec(
		readFileSync(new URL('../drizzle/0012_manual_curriculum_archive.sql', import.meta.url), 'utf8')
	);
	const migrated = sqlite.prepare('SELECT * FROM curriculum').all();
	assert.deepEqual(
		migrated.map(({ id, published_at }) => ({ id, published_at })),
		curricula
	);
	assert.equal(migrated.find((record) => record.id === 'current').archived_at, null);
	assert.equal(migrated.find((record) => record.id === 'old').archived_at, 20);
	assert.equal(migrated.find((record) => record.id === 'draft').archived_at, null);
	assert.deepEqual(sqlite.prepare('SELECT * FROM enrollment').all(), enrollments);
	sqlite.exec('ALTER TABLE curriculum DROP COLUMN archived_at');
	assert.deepEqual(sqlite.prepare('SELECT * FROM curriculum').all(), curricula);
});

test('activation validates drafts, rejects non-admins, and rolls back a failed switch', async (t) => {
	const f = fixture(t);
	const empty = await f.createCurriculum({
		name: 'Empty Curriculum',
		programCode: 'BSIS',
		subjects: []
	});
	await assert.rejects(f.activateCurriculum(empty.id), { status: 400 });
	await assert.rejects(f.activateCurriculum('missing'), { status: 404 });
	const a = await f.createCurriculum({
		name: 'First Curriculum',
		programCode: 'BSIS',
		subjects: [entry('s1')]
	});
	const b = await f.createCurriculum({
		name: 'Second Curriculum',
		programCode: 'BSIS',
		subjects: [entry('s2')]
	});
	for (const role of [Role.REGISTRAR, Role.STUDENT]) {
		f.locals.user.role = role;
		await assert.rejects(f.activateCurriculum(a.id), { status: 403 });
	}
	f.locals.user.role = Role.ADMIN;
	f.db.update(schema.program).set({ isActive: false }).run();
	await assert.rejects(f.activateCurriculum(a.id), { status: 400 });
	f.db.update(schema.program).set({ isActive: true }).run();
	await f.activateCurriculum(a.id);
	const before = f.helpers.getCurriculum(b.id);
	f.sqlite.exec(`CREATE TRIGGER fail_activation BEFORE UPDATE OF active_curriculum_id ON program
		WHEN NEW.active_curriculum_id != OLD.active_curriculum_id BEGIN SELECT RAISE(ABORT, 'test failure'); END;`);
	await assert.rejects(f.activateCurriculum(b.id), { status: 500 });
	assert.deepEqual(f.helpers.getCurriculum(b.id), before);
	assert.equal(f.helpers.getCurriculum(a.id).curriculum.status, 'active');
	f.sqlite.exec(
		"DROP TRIGGER fail_activation; UPDATE curriculum_subject SET semester = 3 WHERE subject_id = 's2';"
	);
	await assert.rejects(f.activateCurriculum(b.id), { status: 400 });
	assert.equal(f.helpers.getCurriculum(b.id).curriculum.publishedAt, null);
	f.sqlite.exec("UPDATE curriculum_subject SET semester = 1, units = 1.5 WHERE subject_id = 's2';");
	await assert.rejects(f.activateCurriculum(b.id), { status: 400 });
	assert.equal(f.helpers.getCurriculum(a.id).curriculum.status, 'active');
});

test('independent programs keep their own active curriculum during repeated switches', async (t) => {
	const f = fixture(t);
	f.db.insert(schema.program).values({ id: 'p2', code: 'ACT', name: 'Computer Technology' }).run();
	const a = await f.createCurriculum({
		name: 'First Curriculum',
		programCode: 'BSIS',
		subjects: [entry('s1')]
	});
	const b = await f.createCurriculum({
		name: 'Second Curriculum',
		programCode: 'BSIS',
		subjects: [entry('s2')]
	});
	const c = await f.createCurriculum({
		name: 'Other Program',
		programCode: 'ACT',
		subjects: [entry('s1')]
	});
	await f.activateCurriculum(c.id);
	await Promise.all([f.activateCurriculum(a.id), f.activateCurriculum(b.id)]);
	assert.equal(f.helpers.getCurriculum(c.id).curriculum.status, 'active');
	assert.equal(f.helpers.getCurriculum(a.id).curriculum.status, 'archived');
	assert.equal(f.helpers.getCurriculum(b.id).curriculum.status, 'active');
	assert.equal(f.page('', '?status=active').total, 2);
	assert.deepEqual(f.sqlite.pragma('foreign_key_check'), []);
});

test('active curriculum migration preserves records and chooses one published version per program', (t) => {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	sqlite.exec(`CREATE TABLE program (id TEXT PRIMARY KEY, is_active INTEGER NOT NULL DEFAULT 1);
		CREATE TABLE curriculum (id TEXT PRIMARY KEY, program_id TEXT, published_at INTEGER, is_active INTEGER DEFAULT 1);
		CREATE TABLE enrollment (id TEXT PRIMARY KEY, curriculum_id TEXT REFERENCES curriculum(id));
		INSERT INTO program (id) VALUES ('p'), ('draft-only');
		INSERT INTO curriculum (id, program_id, published_at, is_active) VALUES
		('old', 'p', 1, 1), ('current', 'p', 2, 1), ('inactive', 'p', 3, 0), ('draft', 'p', NULL, 1), ('other', 'draft-only', NULL, 1);
		INSERT INTO enrollment VALUES ('student', 'old');`);
	sqlite.pragma('foreign_keys = ON');
	const curricula = sqlite.prepare('SELECT * FROM curriculum').all();
	const enrollments = sqlite.prepare('SELECT * FROM enrollment').all();
	sqlite.exec(
		readFileSync(new URL('../drizzle/0011_program_active_curriculum.sql', import.meta.url), 'utf8')
	);
	assert.equal(
		sqlite.prepare("SELECT active_curriculum_id FROM program WHERE id = 'p'").get()
			.active_curriculum_id,
		'current'
	);
	assert.equal(
		sqlite.prepare("SELECT active_curriculum_id FROM program WHERE id = 'draft-only'").get()
			.active_curriculum_id,
		null
	);
	assert.deepEqual(sqlite.prepare('SELECT * FROM curriculum').all(), curricula);
	assert.deepEqual(sqlite.prepare('SELECT * FROM enrollment').all(), enrollments);
	assert.throws(
		() => sqlite.prepare("DELETE FROM curriculum WHERE id = 'current'").run(),
		/FOREIGN KEY/
	);
	sqlite.exec('ALTER TABLE program DROP COLUMN active_curriculum_id');
	assert.deepEqual(sqlite.prepare('SELECT * FROM curriculum').all(), curricula);
	assert.deepEqual(sqlite.prepare('SELECT * FROM enrollment').all(), enrollments);
});
