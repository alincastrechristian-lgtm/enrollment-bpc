import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { error, isHttpError, json } from '@sveltejs/kit';
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
		'./csv': load('src/lib/server/csv.ts'),
		'#lib/Roles.js': roles,
		'#lib/schema.js': schema,
		'#lib/server/db/index.js': { db },
		'#lib/server/auth.js': { validateUser },
		'@sveltejs/kit': { error, json }
	};
	dependencies['#lib/server/masterlist.js'] = load('src/lib/server/masterlist.ts', dependencies);
	const { load: masterlist } = load('src/routes/user/masterlist/+page.server.ts', dependencies);
	const { GET } = load('src/routes/user/masterlist/rows/+server.ts', dependencies);
	const { GET: exportCsv } = load('src/routes/user/masterlist/export/+server.ts', dependencies);
	const event = (query, role) => ({
		url: new URL(`http://localhost/user/masterlist?${query}`),
		locals: role ? { user: { id: 'staff', role }, session: {} } : {}
	});
	return {
		sqlite,
		get: (query = '', role = 'admin') => masterlist(event(query, role)),
		csv: (query = '', role = 'admin') => exportCsv(event(query, role)),
		batch: (query = '', role = 'admin') => GET(event(query, role))
	};
}

function seed(sqlite) {
	sqlite.exec(`
		INSERT INTO user(id,name,email,role,first_name,last_name) VALUES ('u1','Alice','alice@example.com','student','Alice',''),('u2','Bea','bea@example.com','student','Bea',''),('u3','Unenrolled','new@example.com','student','Unenrolled','');
		INSERT INTO student(id,user_id,birth_date,sex) VALUES ('MA-001','u1','2000-01-01','female'),('MA-002','u2','2000-01-01','female'),('MA-003','u3','2000-01-01','female');
		INSERT INTO program(id,code,name,is_active) VALUES ('p1','BSIS','Information Systems',0),('p2','BSA','Accountancy',1);
		INSERT INTO curriculum(id,program_code,name) VALUES ('c1','BSIS','Old Curriculum'),('c2','BSA','New Curriculum');
		INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level,status) VALUES
		('old','MA-001','c1','A',2026,2,1,'completed'),
		('dropped','MA-001','c1','A',2026,2,1,'dropped'),
		('voided','MA-001','c1','A',2026,2,1,'voided'),
		('voided-future','MA-003','c1','Z',2099,9,9,'voided'),
		('current','MA-001','c2','B',2027,1,2,'enrolled'),
		('other','MA-002','c1','B',2026,2,2,'enrolled');
		UPDATE student SET enrollment_id='current' WHERE user_id='u1';
		UPDATE student SET enrollment_id='other' WHERE user_id='u2';
	`);
}

test('masterlist scopes access, validates filters, and excludes dropped or voided attempts from historical rosters', (t) => {
	const f = fixture(t);
	assert.equal(f.get().total, 0);
	seed(f.sqlite);
	for (const [role, status] of [
		[null, 401],
		['student', 403]
	])
		assert.throws(
			() => f.get('', role),
			(cause) => isHttpError(cause) && cause.status === status
		);
	assert.equal(f.get().filters.schoolYearStart, 2027);
	assert.equal(f.get().filters.semester, 1);
	assert.equal(f.get().students[0].enrollmentId, 'current');
	assert.equal(f.get().options.schoolYears.includes(2099), false);
	assert.equal(f.get().options.semesters.includes(9), false);
	assert.equal(f.get().options.yearLevels.includes(9), false);
	assert.equal(f.get().options.sections.includes('Z'), false);
	assert.equal(f.get('schoolYearStart=2099&semester=9').total, 0);
	const query = 'schoolYearStart=2026&semester=2&programCode=BSIS&yearLevel=1&section=A';
	for (const role of ['admin', 'registrar']) {
		const result = f.get(query, role);
		assert.equal(result.total, 1);
		assert.deepEqual(result.students[0], {
			enrollmentId: 'old',
			userId: 'u1',
			studentId: 'MA-001',
			name: 'Alice',
			firstName: 'Alice',
			middleName: '',
			lastName: '',
			email: 'alice@example.com',
			programCode: 'BSIS',
			programName: 'Information Systems',
			yearLevel: 1,
			section: 'A',
			status: 'completed'
		});
	}
	assert.equal(f.get('schoolYearStart=2026&semester=2').total, 2);
	assert.equal(f.get(`${query}&q=Bea`).total, 1); // Old search parameters no longer restrict the list.
	assert.equal(f.get('schoolYearStart=2027&semester=1&section=A').total, 0);
	for (const query of [
		'schoolYearStart=no',
		'semester=0',
		'yearLevel=1.5',
		'programCode=missing',
		'section=unknown'
	])
		assert.throws(
			() => f.get(query),
			(cause) => isHttpError(cause) && cause.status === 400
		);
});

test('masterlist loads all matching students in bounded batches and protects every request', async (t) => {
	const f = fixture(t);
	seed(f.sqlite);
	for (let i = 0; i < 61; i++) {
		const suffix = String(i).padStart(2, '0');
		f.sqlite.exec(`
			INSERT INTO user(id,name,email,role,first_name,last_name) VALUES ('r${suffix}','Roster ${suffix}','r${suffix}@example.com','student','Roster','${suffix}');
			INSERT INTO student(id,user_id,birth_date,sex) VALUES ('R-${suffix}','r${suffix}','2000-01-01','female');
			INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level)
			VALUES('e${suffix}','R-${suffix}','c1','C',2026,2,1);
		`);
	}
	const query = 'schoolYearStart=2026&semester=2&programCode=BSIS&yearLevel=1&section=C';
	const first = f.get(query);
	const response = f.batch(`${query}&page=2`, 'registrar');
	const second = await response.json();
	assert.equal(response.headers.get('cache-control'), 'private, no-store');
	assert.equal(first.total, 61);
	assert.equal(first.students.length, 50);
	assert.equal(first.nextPage, 2);
	assert.equal(second.students.length, 11);
	assert.equal(second.nextPage, null);
	assert.equal(first.students[0].name, 'Roster 00');
	assert.equal(second.students[0].name, 'Roster 50');
	assert.equal(
		new Set([...first.students, ...second.students].map((row) => row.studentId)).size,
		61
	);
	for (const role of ['admin', 'registrar']) {
		const exported = f.csv(`${query}&page=999`, role);
		assert.equal(exported.headers.get('content-type'), 'text/csv; charset=utf-8');
		assert.equal(exported.headers.get('cache-control'), 'private, no-store');
		assert.match(
			exported.headers.get('content-disposition'),
			/attachment; filename="masterlist-2026-2027-semester-2.csv"/
		);
		const csv = await exported.text();
		const lines = csv.trimEnd().split('\r\n');
		assert.equal(lines.length, 64); // title, blank row, column headings, all 61 students
		assert.match(lines[0], /BSIS 1C ENROLLEES - SEMESTER 2 SY 2026-2027/);
		assert.equal(lines[2], '"No.","Student ID","Surname","Given Name","Middle Name"');
		assert.equal(lines.at(-1), '"61","R-60","60","Roster",""');
		assert.ok(!csv.includes('MA-001'));
		assert.ok(!csv.includes('MA-002'));
	}
	assert.deepEqual(f.get(`${query}&page=2`).students, first.students);
	assert.equal((await f.batch(`${query}&page=999999999999999`).json()).students.length, 0);
	assert.equal((await f.batch(`${query}&page=999`).json()).nextPage, null);
	assert.equal((await f.batch('schoolYearStart=2027&semester=1&page=2').json()).students.length, 0);
	for (const [role, status] of [
		[null, 401],
		['student', 403]
	]) {
		assert.throws(
			() => f.batch(`${query}&page=2`, role),
			(cause) => isHttpError(cause) && cause.status === status
		);
		assert.throws(
			() => f.csv(query, role),
			(cause) => isHttpError(cause) && cause.status === status
		);
	}
	for (const parameter of ['page=-1', 'page=bad', 'semester=0', 'section=unknown'])
		assert.throws(
			() => f.batch(parameter),
			(cause) => isHttpError(cause) && cause.status === 400
		);
});

test('CSV uses saved name parts, surname order, safe cells, and the same validated filters', async (t) => {
	const f = fixture(t);
	seed(f.sqlite);
	f.sqlite
		.prepare('UPDATE user SET first_name=?,middle_name=?,last_name=? WHERE id=?')
		.run('Ána, "Luz"', '', 'Santos', 'u1');
	f.sqlite
		.prepare('UPDATE user SET first_name=?,middle_name=?,last_name=? WHERE id=?')
		.run('=1+1', 'Muñoz', 'Alba', 'u2');
	const csv = await f.csv('schoolYearStart=2026&semester=2').text();
	const lines = csv.trimEnd().split('\r\n');
	assert.equal(lines.length, 5);
	assert.equal(lines[3], '"1","MA-002","Alba","\'=1+1","Muñoz"');
	assert.equal(lines[4], '"2","MA-001","Santos","Ána, ""Luz""",""');
	assert.ok(!csv.includes('alice@example.com'));
	assert.ok(!csv.includes('dropped'));
	for (const query of [
		'schoolYearStart=bad',
		'semester=0',
		'yearLevel=1.5',
		'programCode=missing',
		'section=unknown'
	]) {
		assert.throws(
			() => f.csv(query),
			(cause) => isHttpError(cause) && cause.status === 400
		);
	}
	const empty = await f.csv('schoolYearStart=2099&semester=9').text();
	assert.equal(empty.trimEnd().split('\r\n').length, 3);
});
