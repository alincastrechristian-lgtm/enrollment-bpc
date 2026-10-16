import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { error, isHttpError } from '@sveltejs/kit';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(file, dependencies = {}, source = readFileSync(file, 'utf8')) {
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => dependencies[id] ?? require(id), exports);
	return exports;
}
const roles = load('src/lib/Roles.ts');
const schema = load('src/lib/schema.ts', {
	'#lib/Roles.js': roles,
	'./email': load('src/lib/email.ts')
});
const authSource = readFileSync('src/lib/server/auth.ts', 'utf8');
const guard = ts
	.createSourceFile('auth.ts', authSource, ts.ScriptTarget.Latest, true)
	.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'validateUser')
	.getText();
const { validateUser } = load(
	'',
	{ '@sveltejs/kit': { error } },
	`import {error} from '@sveltejs/kit';\n${guard}`
);

function fixture(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	sqlite.pragma('foreign_keys=ON');
	const dependencies = {
		'#lib/Roles.js': roles,
		'#lib/schema.js': schema,
		'#lib/reports.js': load('src/lib/reports.ts'),
		'#lib/enrollment-grades.js': load('src/lib/enrollment-grades.ts'),
		'#lib/server/auth.js': { validateUser },
		'#lib/server/db/index.js': { db },
		'@sveltejs/kit': { error }
	};
	const reports = load('src/lib/server/reports.ts', dependencies);
	dependencies['#lib/server/reports.js'] = reports;
	const { load: page } = load('src/routes/user/reports/+page.server.ts', dependencies);
	const { GET } = load('src/routes/user/reports/export/+server.ts', dependencies);
	const event = (query, role) => ({
		url: new URL(`http://localhost/user/reports?${query}`),
		locals: role ? { user: { id: 'staff', role }, session: {} } : {}
	});
	return {
		sqlite,
		...reports,
		get: (query = '', role = 'admin') => page(event(query, role)),
		csv: (query = '', role = 'admin') => GET(event(query, role))
	};
}

function seed(sqlite) {
	sqlite.exec(`
		INSERT INTO user(id,name,email,role) VALUES('a','Alice','a@example.com','student'),('b','Bea','b@example.com','student'),('c','Cara','c@example.com','student'),('d','=2+2','d@example.com','student');
		INSERT INTO student(id,user_id) VALUES('A','a'),('B','b'),('C','c'),('D','d');
		INSERT INTO program(id,code,name) VALUES('p1','BSIS','Information Systems'),('p2','BSA','Accountancy');
		INSERT INTO curriculum(id,program_code,name) VALUES('c1','BSIS','Original'),('c2','BSA','Other');
		INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level,status,finalized_grades,submitted_clearance) VALUES
		('e1','A','c1','A',2026,1,1,'completed',1,1),('dropped','A','c1','A',2026,1,1,'dropped',1,0),
		('e2','B','c1','A',2026,1,1,'enrolled',0,0),('e3','C','c2','B',2026,1,2,'completed',1,1),
		('e4','D','c1','A',2026,1,1,'completed',1,1),('old','A','c1','C',2025,2,1,'completed',1,1);
		UPDATE student SET enrollment_id=CASE id WHEN 'A' THEN 'e1' WHEN 'B' THEN 'e2' WHEN 'C' THEN 'e3' ELSE 'e4' END;
		INSERT INTO subject(id,code,name) VALUES('s1','IS101','Subject 1'),('s2','IS102','Subject 2'),('s3','IS103','Subject 3'),('s4','IS104','Subject 4');
	`);
	for (const [enrollmentId, grades] of [
		['e1', [1, 3, 4, null]],
		['e2', [5, null]],
		['e3', [3]],
		['e4', [null]],
		['dropped', [5]],
		['old', [2]]
	]) {
		grades.forEach((grade, i) =>
			sqlite
				.prepare(
					`INSERT INTO enrollment_subject(id,enrollment_id,subject_id,source,subject_code,subject_name,units,grade) VALUES(?,?,?,'extra',?,?,3,?)`
				)
				.run(
					`${enrollmentId}-${i}`,
					enrollmentId,
					`s${i + 1}`,
					`IS10${i + 1}`,
					`Subject ${i + 1}`,
					grade
				)
		);
	}
}

test('reports distinguish students from attempts and honor historical academic filters', (t) => {
	const f = fixture(t);
	assert.equal(f.get().rows.length, 0);
	seed(f.sqlite);
	const report = f.get();
	assert.deepEqual(report.overview, { students: 4, enrolled: 1, completed: 3, dropped: 1 });
	assert.deepEqual(report.rows.find((row) => row.cells[0] === 'BSIS').cells, [
		'BSIS',
		1,
		'A',
		1,
		2,
		1,
		4,
		3
	]);
	assert.equal(f.get('programCode=BSA&yearLevel=2&section=B').rows.length, 1);
	assert.equal(f.get('programCode=BSIS&section=B').rows.length, 0);
	const historical = f.get('report=completion&schoolYearStart=2025&semester=2&section=C');
	assert.equal(historical.rows[0].enrollmentId, 'old');
	assert.equal(historical.rows[0].cells.at(-1), 'Historical enrollment');
	assert.equal(f.get('report=dropped').rows[0].cells.at(-2), 'Not recorded');
	for (const kind of ['summary', 'grades', 'attention', 'completion', 'dropped']) {
		const result = f.get(`report=${kind}`);
		assert.ok(result.rows.every((row) => row.cells.length === result.columns.length));
	}
});

test('reports use finalized grade boundaries and the actual reenrollment rule', (t) => {
	const f = fixture(t);
	seed(f.sqlite);
	const grades = f.get('report=grades');
	assert.equal(grades.rows.length, 8);
	for (const [id, outcome] of [
		['e1-0', 'Passed'],
		['e1-1', 'Passed'],
		['e1-2', 'Failed'],
		['e1-3', 'Incomplete'],
		['e2-0', 'Pending'],
		['e2-1', 'Pending']
	])
		assert.equal(grades.rows.find((row) => row.id === id).cells.at(-2), outcome);
	assert.equal(grades.rows.find((row) => row.id === 'e2-1').cells.at(-3), 'Not entered');
	const attention = f.get('report=attention');
	assert.deepEqual(attention.rows.map((row) => row.id).sort(), ['e1', 'e2', 'e4']);
	const draft = attention.rows.find((row) => row.id === 'e2');
	assert.deepEqual(draft.cells.slice(5, 7), [0, 0]);
	assert.match(draft.cells.at(-1), /Grades not finalized/);
	const completion = f.get('report=completion');
	assert.equal(completion.rows.find((row) => row.id === 'e1').cells.at(-1), 'Requirements pending');
	assert.equal(completion.rows.find((row) => row.id === 'e3').cells.at(-1), 'Ready');
	// INC prompts follow-up but only failed grades require a completed meeting to reenroll.
	assert.equal(completion.rows.find((row) => row.id === 'e4').cells.at(-1), 'Ready');
	f.sqlite.exec("UPDATE enrollment SET follow_up_completed_at=1000 WHERE id='e1'");
	assert.equal(
		f
			.get('report=completion')
			.rows.find((row) => row.id === 'e1')
			.cells.at(-1),
		'Ready'
	);
});

test('page and full CSV export enforce staff access, validate filters, and neutralize formulas', async (t) => {
	const f = fixture(t);
	seed(f.sqlite);
	for (const role of ['admin', 'registrar']) {
		assert.equal(f.get('report=grades', role).rows.length, 8);
		const response = f.csv('report=grades&programCode=BSIS', role);
		assert.equal(response.status, 200);
		assert.equal(response.headers.get('cache-control'), 'private, no-store');
		assert.match(response.headers.get('content-disposition'), /grades-2026-2027-semester-1.csv/);
		const csv = await response.text();
		assert.equal(csv.trim().split('\r\n').length, 8); // header plus all seven BSIS subject attempts
		assert.match(csv, /"'=2\+2"/);
		assert.ok(!csv.includes('Cara'));
	}
	for (const [role, status] of [
		[null, 401],
		['student', 403]
	])
		for (const action of [f.get, f.csv])
			assert.throws(
				() => action('', role),
				(cause) => isHttpError(cause) && cause.status === status
			);
	for (const query of [
		'report=other',
		'semester=0',
		'schoolYearStart=no',
		'yearLevel=1.5',
		'programCode=missing',
		'section=missing'
	])
		assert.throws(
			() => f.csv(query),
			(cause) => isHttpError(cause) && cause.status === 400
		);
	const csv = f.createReportCsv({
		columns: ['Value'],
		rows: [
			{ id: 'x', cells: ['Alice, "R"\r\nReyes'] },
			{ id: 'y', cells: [' @SUM(1,2)'] }
		]
	});
	assert.ok(csv.startsWith('\uFEFF'));
	assert.ok(csv.includes('"Alice, ""R""\r\nReyes"'));
	assert.ok(csv.includes('"\' @SUM(1,2)"'));
});
