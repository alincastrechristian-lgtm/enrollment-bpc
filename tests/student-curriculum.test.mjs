import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { error, isHttpError, redirect } from '@sveltejs/kit';

const require = createRequire(import.meta.url);
function loadModule(filename, dependencies = {}, sourceOverride) {
	const { outputText } = ts.transpileModule(sourceOverride ?? readFileSync(filename, 'utf8'), {
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
const { validateUser } = loadModule(
	'',
	{ '@sveltejs/kit': { error } },
	"import {error} from '@sveltejs/kit';\n" + guard
);
const hasStatus = (status) => (cause) => isHttpError(cause) && cause.status === status;

function fixture(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	sqlite.pragma('foreign_keys = ON');
	sqlite.exec(`
		INSERT INTO user (id,name,email,role) VALUES ('u','Student','u@example.com','student'),('other','Other','other@example.com','student');
		INSERT INTO program (id,code,name) VALUES ('p','BSIS','Information Systems');
		INSERT INTO curriculum (id,program_code,name,published_at,archived_at) VALUES
		('assigned','BSIS','Original Curriculum',1000,2000),('new','BSIS','New Curriculum',2000,null),('draft','BSIS','Draft Curriculum',null,null);
		UPDATE program SET active_curriculum_id='new';
		INSERT INTO subject (id,code,name) VALUES ('s1','IS101','Introduction'),('s2','IS201','Programming');
		INSERT INTO curriculum_subject (id,curriculum_id,subject_id,subject_code,subject_name,year_level,semester,units) VALUES
		('cs2','assigned','s2','IS201','Programming',2,2,4),('cs1','assigned','s1','IS101','Introduction',1,1,3);
		INSERT INTO student (id,user_id) VALUES ('MA-001','u'),('MA-002','other');
		INSERT INTO enrollment (id,student_id,curriculum_id,section,school_year_start,semester,year_level) VALUES
		('own','MA-001','assigned','A',2026,1,1),('foreign','MA-002','new','B',2026,1,1);
		UPDATE student SET enrollment_id='own' WHERE user_id='u';
		UPDATE student SET enrollment_id='foreign' WHERE user_id='other';
	`);
	const dependencies = {
		'#lib/Roles.js': { Role },
		'#lib/schema.js': schema,
		'#lib/server/db/index.js': { db },
		'#lib/server/auth.js': { validateUser },
		'@sveltejs/kit': { error, redirect },
		'#lib/components/Table/TableValues.js': { MAX_ITEMS_PER_PAGE: 20 },
		'#lib/server/filters.js': { schemaFilters: () => ({ filters: {}, where: undefined }) }
	};
	dependencies['#lib/server/curriculum.js'] = loadModule(
		'src/lib/server/curriculum.ts',
		dependencies
	);
	const index = loadModule('src/routes/user/curriculum/+page.server.ts', dependencies).load;
	const detail = loadModule(
		'src/routes/user/curriculum/[curriculumId]/+page.server.ts',
		dependencies
	).load;
	const event = (role = Role.STUDENT, id = 'u') => ({
		locals: { user: role ? { id, role } : null, session: role ? {} : null },
		url: new URL('https://example.com/user/curriculum?userId=other&q=Draft&status=draft'),
		params: { curriculumId: 'assigned' }
	});
	return { sqlite, index, detail, event, dependencies };
}

test('student sees full assigned curriculum even after a newer revision becomes active', (t) => {
	const f = fixture(t);
	const result = f.index(f.event());
	assert.equal(result.isStudent, true);
	assert.equal(result.canManage, false);
	assert.equal(result.studentCurriculum.curriculum.id, 'assigned');
	assert.equal(result.studentCurriculum.curriculum.status, 'archived');
	assert.deepEqual(
		result.studentCurriculum.entries.map((entry) => [
			entry.subjectCode,
			entry.yearLevel,
			entry.semester,
			entry.units
		]),
		[
			['IS101', 1, 1, 3],
			['IS201', 2, 2, 4]
		]
	);
	assert.deepEqual(result.records, []);
	const detail = f.detail(f.event());
	assert.equal(detail.curriculum.id, 'assigned');
	assert.equal(detail.canManage, false);
});

test('student cannot open other curricula, unpublished drafts, or missing records directly', (t) => {
	const f = fixture(t);
	for (const curriculumId of ['new', 'draft', 'missing']) {
		assert.throws(() => f.detail({ ...f.event(), params: { curriculumId } }), hasStatus(404));
	}
	assert.throws(() => f.detail(f.event(Role.STUDENT, 'other')), hasStatus(404));
});

for (const [name, sql] of [
	['no student record', "DELETE FROM student WHERE user_id='u'"],
	['no current enrollment', "UPDATE student SET enrollment_id=null WHERE user_id='u'"],
	[
		'another student enrollment linked',
		"UPDATE student SET enrollment_id=null WHERE user_id='other'; UPDATE student SET enrollment_id='foreign' WHERE user_id='u'"
	],
	['an unpublished curriculum linked', "UPDATE enrollment SET curriculum_id='draft' WHERE id='own'"]
]) {
	test(`${name} returns an empty student view without falling back to the program curriculum`, (t) => {
		const f = fixture(t);
		if (name === 'no student record')
			f.sqlite.exec(
				"UPDATE student SET enrollment_id=null WHERE user_id='u'; DELETE FROM enrollment WHERE student_id='MA-001';"
			);
		f.sqlite.exec(sql);
		assert.equal(f.index(f.event()).studentCurriculum, null);
		assert.throws(() => f.detail(f.event()), hasStatus(404));
	});
}

test('staff retain catalog access and only admin can manage curricula', (t) => {
	const f = fixture(t);
	for (const role of [Role.ADMIN, Role.REGISTRAR]) {
		const event = f.event(role);
		event.url = new URL('https://example.com/user/curriculum');
		const result = f.index(event);
		assert.equal(result.total, 3);
		assert.equal(result.canManage, role === Role.ADMIN);
		assert.equal(result.isStudent, false);
		assert.equal(f.detail({ ...event, params: { curriculumId: 'draft' } }).curriculum.id, 'draft');
	}
});

test('student cannot use curriculum create/edit pages', (t) => {
	const f = fixture(t);
	for (const file of ['new/+page.server.ts', '[curriculumId]/edit/+page.server.ts']) {
		const { load } = loadModule('src/routes/user/curriculum/' + file, {
			...f.dependencies,
			'$app/paths': { resolve: (path) => path }
		});
		assert.throws(() => load(f.event()), hasStatus(403));
	}
});

test('anonymous and unsupported roles cannot load curriculum pages', (t) => {
	const f = fixture(t);
	for (const role of [null, 'unknown'])
		for (const load of [f.index, f.detail]) {
			assert.throws(() => load(f.event(role)), hasStatus(role ? 403 : 401));
		}
});
