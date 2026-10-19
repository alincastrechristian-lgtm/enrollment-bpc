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
const { getMissingPrerequisites } = load('src/lib/subject-prerequisites.ts', {
	'#lib/enrollment-grades.js': load('src/lib/enrollment-grades.ts')
});

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
		'@sveltejs/kit': { error, redirect },
		'#lib/Roles.js': roles,
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
	return {
		db,
		locals,
		subject: load('src/lib/actions/subject.remote.ts', dependencies),
		loadSubject: load('src/routes/user/subjects/+page.server.ts', dependencies).load
	};
}

test('only admins can change prerequisite rules', async (t) => {
	const f = fixture(t);
	const created = await f.subject.createSubject({ code: 'BASIC', name: 'Basic subject' });
	for (const role of ['registrar', 'student']) {
		f.locals.user.role = role;
		for (const [operation, input] of [
			['createSubject', { code: 'ADV', name: 'Advanced', prerequisiteIds: [created.id] }],
			['updateSubject', { id: created.id, prerequisiteIds: [] }],
			['deleteSubject', created.id]
		])
			await assert.rejects(
				f.subject[operation](input),
				(cause) => isHttpError(cause) && cause.status === 403
			);
	}
	assert.equal(f.db.select().from(schema.subject).all().length, 1);
	assert.deepEqual(f.db.select().from(schema.subjectPrerequisite).all(), []);
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
	migrate(db, { migrationsFolder: 'drizzle' });
	migrate(db, { migrationsFolder: 'drizzle' });
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
	migrate(db, { migrationsFolder: 'drizzle' });
	assert.deepEqual(snapshot(), before);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
});

test('subject prerequisites save atomically, remain on partial edits, and reject invalid graphs', async (t) => {
	const f = fixture(t);
	const first = await f.subject.createSubject({ code: 'PRE1', name: 'First prerequisite' });
	const second = await f.subject.createSubject({
		code: 'PRE2',
		name: 'Second prerequisite',
		prerequisiteIds: [first.id]
	});
	const third = await f.subject.createSubject({
		code: 'ADV',
		name: 'Advanced subject',
		prerequisiteIds: [first.id, second.id]
	});
	const edges = () => f.db.select().from(schema.subjectPrerequisite).all();
	const before = edges();
	await f.subject.updateSubject({ id: third.id, name: 'Advanced renamed' });
	assert.deepEqual(edges(), before);
	for (const prerequisiteIds of [
		[first.id],
		[third.id],
		[second.id],
		['missing'],
		[third.id, third.id]
	]) {
		await assert.rejects(
			f.subject.updateSubject({ id: first.id, name: 'Must roll back', prerequisiteIds }),
			{ status: 400 }
		);
		assert.deepEqual(edges(), before);
		assert.equal(
			f.db
				.select()
				.from(schema.subject)
				.all()
				.find((entry) => entry.id === first.id).name,
			'First prerequisite'
		);
	}
	await assert.rejects(
		f.subject.createSubject({
			code: 'BAD',
			name: 'Invalid prerequisite',
			prerequisiteIds: ['missing']
		}),
		{ status: 400 }
	);
	assert.equal(f.db.select().from(schema.subject).all().length, 3);
	await assert.rejects(f.subject.deleteSubject(first.id), { status: 400 });
	const page = f.loadSubject({
		locals: f.locals,
		url: new URL('https://example.com/user/subjects?q=ADV')
	});
	assert.equal(page.records.length, 1);
	assert.equal(page.subjectOptions.length, 3);
	assert.deepEqual(page.prerequisites, before);
	await f.subject.updateSubject({ id: third.id, prerequisiteIds: [] });
	await f.subject.updateSubject({ id: second.id, prerequisiteIds: [] });
	assert.deepEqual(edges(), []);
	await f.subject.deleteSubject(first.id);
});
