import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import ts from 'typescript';
import { migrationConfigThrough } from './migration-config.mjs';
import { error, isHttpError, redirect } from '@sveltejs/kit';

const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
	const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => dependencies[id] ?? require(id), exports);
	return exports;
}
const prerequisites = load('src/lib/subject-prerequisites.ts', {
	'#lib/enrollment-grades.js': load('src/lib/enrollment-grades.ts')
});

const { getMissingPrerequisites } = prerequisites;

const roles = load('src/lib/Roles.ts');
const schema = load('src/lib/schema.ts', {
	'#lib/Roles.js': roles,
	'./email': load('src/lib/email.ts')
});
const guard = ts
	.createSourceFile(
		'auth.ts',
		readFileSync('src/lib/server/auth.ts', 'utf8'),
		ts.ScriptTarget.Latest,
		true
	)
	.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'validateUser')
	.getText();
const { outputText: guardCode } = ts.transpileModule(
	`import { error } from '@sveltejs/kit';\n${guard}`,
	{ compilerOptions: { module: ts.ModuleKind.CommonJS } }
);
const guardExports = {};
new Function('require', 'exports', guardCode)(() => ({ error }), guardExports);

function fixture(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	sqlite.pragma('foreign_keys=ON');
	const locals = { user: { role: 'admin' }, session: {} };
	const dependencies = {
		'@sveltejs/kit': { error, isHttpError, redirect },
		'#lib/Roles.js': roles,
		'#lib/subject-prerequisites.js': prerequisites,
		'#lib/schema.js': schema,
		'#lib/server/auth.js': guardExports,
		'../server/db': { db },
		'#lib/server/db/index.js': { db },
		'$app/server': {
			getRequestEvent: () => ({ locals }),
			command: (validator, handler) => async (input) => handler(validator.parse(input))
		},
		'#lib/components/Table/TableValues.js': { MAX_ITEMS_PER_PAGE: 10 },
		'#lib/server/filters.js': { schemaFilters: () => ({ filters: {}, where: undefined }) }
	};
	dependencies['#lib/server/curriculum.js'] = load('src/lib/server/curriculum.ts', dependencies);
	db.insert(schema.program).values({ id: 'p', code: 'BSIS', name: 'Information Systems' }).run();
	return {
		db,
		sqlite,
		locals,
		helpers: dependencies['#lib/server/curriculum.js'],
		curriculum: load('src/lib/actions/curriculum.remote.ts', dependencies),
		subject: load('src/lib/actions/subject.remote.ts', dependencies),
		loadSubject: load('src/routes/user/subjects/+page.server.ts', dependencies).load
	};
}

test('only admins can change curriculum prerequisite rules', async (t) => {
	const f = fixture(t);
	for (const role of ['registrar', 'student']) {
		f.locals.user.role = role;
		await assert.rejects(
			f.curriculum.createCurriculum({ name: 'Blocked', programCode: 'BSIS', subjects: [] }),
			{ status: 403 }
		);
	}
	assert.deepEqual(f.db.select().from(schema.curriculumPrerequisite).all(), []);
});

const placement = (subjectId, yearLevel, semester, prerequisiteIds = []) => ({
	subjectId,
	yearLevel,
	semester,
	units: 3,
	prerequisiteIds
});

test('curricula own independent rules; published versions stay frozen after catalog and draft edits', async (t) => {
	const f = fixture(t);
	const a = await f.subject.createSubject({ code: 'BASIC', name: 'Basic subject' });
	const b = await f.subject.createSubject({ code: 'ADV', name: 'Advanced subject' });
	const subjects = [placement(a.id, 1, 1), placement(b.id, 1, 2, [a.id])];
	const old = await f.curriculum.createCurriculum({
		name: 'Original',
		programCode: 'BSIS',
		subjects
	});
	await f.curriculum.activateCurriculum(old.id);
	const before = f.helpers.getCurriculum(old.id);
	const revision = await f.curriculum.createCurriculum({
		name: 'Revision',
		programCode: 'BSIS',
		subjects
	});
	await f.curriculum.updateCurriculum({
		id: revision.id,
		subjects: subjects.map((entry) => ({ ...entry, prerequisiteIds: [] }))
	});
	assert.deepEqual(
		f.helpers.getCurriculum(revision.id).entries.map((entry) => entry.prerequisiteIds),
		[[], []]
	);
	await f.subject.updateSubject({ id: a.id, name: 'Renamed catalog subject', code: 'RENAMED' });
	await f.curriculum.activateCurriculum(revision.id);
	await assert.rejects(f.curriculum.updateCurriculum({ id: old.id, subjects: [] }), {
		status: 409
	});
	assert.deepEqual(f.helpers.getCurriculum(old.id).entries, before.entries);
	assert.deepEqual(f.db.select().from(schema.curriculumPrerequisite).all(), [
		{ curriculumId: old.id, subjectId: b.id, prerequisiteId: a.id }
	]);
	await assert.rejects(f.subject.updateSubject({ id: a.id, prerequisiteIds: [b.id] }));
});

test('draft save rejects missing, duplicate, self, same-term, later and cyclic prerequisites atomically', async (t) => {
	const f = fixture(t);
	for (const [id, code] of [
		['a', 'BASIC'],
		['b', 'ADV'],
		['c', 'OTHER']
	])
		f.db.insert(schema.subject).values({ id, code, name: code }).run();
	const valid = [
		placement('a', 1, 1),
		placement('b', 1, 2, ['a']),
		placement('c', 2, 1, ['a', 'b'])
	];
	const draft = await f.curriculum.createCurriculum({
		name: 'Draft',
		programCode: 'BSIS',
		subjects: valid
	});
	const before = f.helpers.getCurriculum(draft.id);
	for (const subjects of [
		[placement('b', 1, 2, ['a'])],
		[placement('a', 1, 1), placement('b', 1, 2, ['a', 'a'])],
		[placement('a', 1, 1, ['a'])],
		[placement('a', 1, 1), placement('b', 1, 1, ['a'])],
		[placement('a', 2, 1), placement('b', 1, 2, ['a'])],
		[placement('a', 1, 1, ['c']), placement('b', 1, 2, ['a']), placement('c', 2, 1, ['b'])]
	]) {
		await assert.rejects(
			f.curriculum.updateCurriculum({ id: draft.id, name: 'Must roll back', subjects }),
			{ status: 400 }
		);
		assert.deepEqual(f.helpers.getCurriculum(draft.id), before);
		await assert.rejects(
			f.curriculum.createCurriculum({ name: 'Invalid', programCode: 'BSIS', subjects }),
			{ status: 400 }
		);
		assert.equal(f.db.select().from(schema.curriculum).all().length, 1);
	}
	await f.curriculum.updateCurriculum({
		id: draft.id,
		subjects: valid.map((entry) => ({ ...entry, prerequisiteIds: [] }))
	});
	assert.deepEqual(f.db.select().from(schema.curriculumPrerequisite).all(), []);
});

test('activation revalidates imported prerequisite placement before publishing or switching the program', async (t) => {
	const f = fixture(t);
	for (const id of ['a', 'b']) f.db.insert(schema.subject).values({ id, code: id, name: id }).run();
	const draft = await f.curriculum.createCurriculum({
		name: 'Imported',
		programCode: 'BSIS',
		subjects: [placement('a', 1, 1), placement('b', 1, 1)]
	});
	f.db
		.insert(schema.curriculumPrerequisite)
		.values({ curriculumId: draft.id, subjectId: 'b', prerequisiteId: 'a' })
		.run();
	await assert.rejects(f.curriculum.activateCurriculum(draft.id), { status: 400 });
	assert.equal(f.helpers.getCurriculum(draft.id).curriculum.publishedAt, null);
	assert.equal(f.db.select().from(schema.program).get().activeCurriculumId, null);
});

test('migration scopes existing global rules to every applicable curriculum and guards rollback', (t) => {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite);
	migrate(db, migrationConfigThrough(t, 38));
	sqlite.pragma('foreign_keys=ON');
	sqlite.exec(`
		INSERT INTO program(id,code,name) VALUES('p','BSIS','Information Systems');
		INSERT INTO curriculum(id,program_code,name) VALUES('c1','BSIS','Original'),('c2','BSIS','Revision');
		INSERT INTO subject(id,code,name) VALUES('a','BASIC','Basic'),('b','ADV','Advanced');
		INSERT INTO curriculum_subject(id,curriculum_id,subject_id,year_level,semester,units,subject_code,subject_name)
		VALUES('c1a','c1','a',1,1,3,'BASIC','Basic'),('c1b','c1','b',1,2,3,'ADV','Advanced'),
		('c2a','c2','a',1,1,3,'BASIC','Basic'),('c2b','c2','b',1,2,3,'ADV','Advanced');
		INSERT INTO subject_prerequisite VALUES('b','a');
	`);
	const before = sqlite.prepare('SELECT * FROM curriculum_subject ORDER BY id').all();
	migrate(db, { migrationsFolder: 'drizzle' });
	migrate(db, { migrationsFolder: 'drizzle' });
	assert.deepEqual(
		sqlite.prepare('SELECT * FROM curriculum_prerequisite ORDER BY curriculum_id').all(),
		[
			{ curriculum_id: 'c1', subject_id: 'b', prerequisite_id: 'a' },
			{ curriculum_id: 'c2', subject_id: 'b', prerequisite_id: 'a' }
		]
	);
	assert.deepEqual(sqlite.prepare('SELECT * FROM curriculum_subject ORDER BY id').all(), before);
	assert.throws(() => sqlite.exec("INSERT INTO curriculum_prerequisite VALUES('c1','b','a')"));
	assert.throws(() => sqlite.exec("INSERT INTO curriculum_prerequisite VALUES('c1','a','a')"));
	assert.throws(() => sqlite.exec("INSERT INTO curriculum_prerequisite VALUES('missing','b','a')"));
	const rollback = readFileSync('drizzle/rollback/0039_curriculum_prerequisites.sql', 'utf8');
	assert.throws(() => sqlite.exec(rollback));
	sqlite.exec('ROLLBACK');
	assert.equal(sqlite.prepare('SELECT count(*) AS n FROM curriculum_prerequisite').get().n, 2);
	sqlite.exec('DELETE FROM curriculum_prerequisite');
	sqlite.exec(rollback);
	migrate(db, { migrationsFolder: 'drizzle' });
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
});

test('only a finalized passing result from an earlier term satisfies a prerequisite', () => {
	const requirements = [
		{ subjectId: 'advanced', prerequisiteId: 'basic', code: 'BASIC', name: 'Basic subject' }
	];
	const term = { schoolYearStart: 2026, semester: 2 };
	const attempt = {
		subjectId: 'basic',
		schoolYearStart: 2026,
		semester: 1,
		grade: 3,
		finalizedGrades: true
	};
	for (const grade of [1, 2, 3])
		assert.deepEqual(getMissingPrerequisites(requirements, [{ ...attempt, grade }], term), []);
	for (const [overrides, status] of [
		[{ grade: 3.01 }, 'Failed'],
		[{ grade: null }, 'Incomplete'],
		[{ finalizedGrades: false }, 'Pending'],
		[{ semester: 2 }, 'Not completed'],
		[{ schoolYearStart: 2027 }, 'Not completed'],
		[{ subjectId: 'unrelated' }, 'Not completed']
	])
		assert.equal(
			getMissingPrerequisites(requirements, [{ ...attempt, ...overrides }], term)[0].status,
			status
		);
	assert.equal(getMissingPrerequisites(requirements, [], term)[0].status, 'Not completed');
	assert.deepEqual(getMissingPrerequisites([], [], term), []);
	const earlier = { ...attempt, schoolYearStart: 2025 };
	for (const attempts of [
		[earlier, { ...attempt, grade: null }],
		[{ ...attempt, grade: null }, earlier]
	]) {
		assert.equal(getMissingPrerequisites(requirements, attempts, term)[0].status, 'Incomplete');
	}
	assert.equal(
		getMissingPrerequisites(
			requirements,
			[earlier, { ...attempt, finalizedGrades: false }],
			term
		)[0].status,
		'Pending'
	);
	assert.deepEqual(
		getMissingPrerequisites(requirements, [{ ...earlier, grade: 4 }, attempt], term),
		[]
	);
});

test('prerequisite migration preserves populated catalogs and enrollment history; guarded rollback preserves rules', (t) => {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite);
	migrate(db, migrationConfigThrough(t, 37));
	sqlite.pragma('foreign_keys=ON');
	sqlite.exec(`
		INSERT INTO user(id,name,email,role,first_name,last_name) VALUES('u','Student','student@example.com','student','First','Last');
		INSERT INTO student(id,user_id,birth_date,sex) VALUES('s','u','2000-01-01','female');
		INSERT INTO program(id,code,name) VALUES('p','BSIS','Information Systems');
		INSERT INTO curriculum(id,program_code,name,published_at) VALUES('c','BSIS','Curriculum',1000);
		INSERT INTO subject(id,code,name) VALUES('basic','BASIC','Basic'),('advanced','ADV','Advanced');
		INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level) VALUES('e','s','c','A',2026,1,1);
		INSERT INTO enrollment_subject(id,enrollment_id,subject_id,source,subject_code,subject_name,units,grade,added_by) VALUES('es','e','basic','extra','BASIC','Basic',3,2,'u');
		UPDATE student SET enrollment_id='e' WHERE id='s';
	`);
	const snapshot = () =>
		Object.fromEntries(
			['subject', 'curriculum', 'program', 'enrollment', 'enrollment_subject', 'student'].map(
				(table) => [table, sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]
			)
		);
	const before = snapshot();
	migrate(db, migrationConfigThrough(t, 38));
	migrate(db, migrationConfigThrough(t, 38));
	assert.deepEqual(snapshot(), before);
	assert.deepEqual(sqlite.prepare('SELECT * FROM subject_prerequisite').all(), []);
	sqlite.exec("INSERT INTO subject_prerequisite VALUES('advanced','basic')");
	for (const sql of [
		"INSERT INTO subject_prerequisite VALUES('advanced','basic')",
		"INSERT INTO subject_prerequisite VALUES('advanced','advanced')",
		"INSERT INTO subject_prerequisite VALUES('advanced','missing')",
		"DELETE FROM subject WHERE id='basic'"
	])
		assert.throws(() => sqlite.exec(sql));
	const rollback = readFileSync('drizzle/rollback/0038_subject_prerequisites.sql', 'utf8');
	assert.throws(() => sqlite.exec(rollback));
	sqlite.exec('ROLLBACK');
	assert.equal(sqlite.prepare('SELECT count(*) AS n FROM subject_prerequisite').get().n, 1);
	sqlite.exec('DELETE FROM subject_prerequisite');
	sqlite.exec(rollback);
	assert.deepEqual(snapshot(), before);
	migrate(db, migrationConfigThrough(t, 38));
	assert.deepEqual(snapshot(), before);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
});
