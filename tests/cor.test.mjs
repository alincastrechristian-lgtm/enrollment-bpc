import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { error, isHttpError } from '@sveltejs/kit';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(file, dependencies = {}, source = readFileSync(file, 'utf8')) {
	const { outputText } = ts.transpileModule(
		source.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(resolve(file)).href)),
		{
			compilerOptions: {
				module: ts.ModuleKind.CommonJS,
				target: ts.ScriptTarget.ES2022,
				esModuleInterop: true
			}
		}
	);
	const exports = {};
	new Function('require', 'exports', outputText)((id) => dependencies[id] ?? require(id), exports);
	return exports;
}
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
const { validateUser } = load(
	'src/lib/server/auth.ts',
	{ '@sveltejs/kit': { error } },
	`import {error} from '@sveltejs/kit';\n${guard}`
);
const renderer = load('src/lib/server/cor-pdf.ts', {
	'#lib/student-demographics.js': load('src/lib/student-demographics.ts')
});
const locals = (role = 'student', id = 'a') => ({ user: { id, role }, session: {} });

function fixture(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	sqlite.pragma('foreign_keys=ON');
	const dependencies = {
		'#lib/Roles.js': roles,
		'#lib/schema.js': schema,
		'#lib/server/auth.js': { validateUser },
		'#lib/server/db/index.js': { db },
		'#lib/server/cor-pdf.js': renderer,
		'@sveltejs/kit': { error }
	};
	const backend = load('src/lib/server/cor.ts', dependencies);
	dependencies['#lib/server/cor.js'] = backend;
	const { GET } = load('src/routes/user/enrollment/[enrollmentId]/cor/+server.ts', dependencies);
	sqlite.exec(`
		INSERT INTO user(id,name,email,role,ban_reason) VALUES
		('a','Ana Muñoz','ana@example.com','student','PRIVATE AUTH VALUE'),
		('b','Bea','bea@example.com','student',NULL);
		INSERT INTO student(id,user_id,address,contact_number,birth_date,sex) VALUES
		('MA-202610-000001','a','Malolos, Bulacan','09123456789','2000-02-29','female'),('OTHER','b','','',NULL,NULL);
		INSERT INTO program(id,code,name) VALUES('p1','BSIS','Information Systems'),('p2','BSA','Accountancy');
		INSERT INTO curriculum(id,program_code,name) VALUES('c1','BSIS','Historical curriculum'),('c2','BSA','Current curriculum');
		INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level,status,finalized_grades) VALUES
		('old','MA-202610-000001','c1','A',2025,2,1,'completed',1),
		('current','MA-202610-000001','c2','B',2026,1,2,'enrolled',0),
		('dropped','MA-202610-000001','c1','A',2025,1,1,'dropped',0),
		('voided','MA-202610-000001','c1','A',2025,1,1,'voided',0),
		('empty','OTHER','c1','C',2026,1,1,'enrolled',0);
		UPDATE student SET enrollment_id='current' WHERE user_id='a';
		INSERT INTO subject(id,code,name) VALUES('s1','CHANGED','Catalog renamed subject'),('s2','NOW','Different catalog subject');
		INSERT INTO enrollment_subject(id,enrollment_id,subject_id,source,subject_code,subject_name,units,grade) VALUES
		('old-s1','old','s1','extra','IS101','Historical subject title',2.5,1.25),
		('old-s2','old','s2','extra','IS102','Practicum',4,NULL),
		('current-s1','current','s1','extra','AC101','Current enrollment subject',3,5);
	`);
	return {
		sqlite,
		get: (id = 'old', auth = locals()) => backend.getCertificateOfRegistration(db, auth, id),
		download: (id = 'old', auth = locals()) => GET({ locals: auth, params: { enrollmentId: id } })
	};
}

const httpStatus = (status) => (cause) => isHttpError(cause, status);
async function readPdf(bytes) {
	const task = getDocument({ data: new Uint8Array(bytes) });
	const pdf = await task.promise;
	try {
		const pages = [];
		for (let page = 1; page <= pdf.numPages; page++) {
			const content = await (await pdf.getPage(page)).getTextContent();
			pages.push(content.items.filter((item) => 'str' in item));
		}
		return pages;
	} finally {
		await task.destroy();
	}
}

test('COR access checks ownership before status and permits staff plus own historical records', (t) => {
	const f = fixture(t);
	for (const role of ['admin', 'registrar', 'student'])
		for (const id of ['old', 'current']) assert.equal(f.get(id, locals(role)).enrollment.id, id);
	for (const [auth, status] of [
		[{}, 401],
		[locals('unknown'), 403],
		[locals('student', 'b'), 404]
	])
		assert.throws(() => f.get('old', auth), httpStatus(status));
	for (const auth of [locals(), locals('admin')]) {
		assert.throws(() => f.get('missing', auth), httpStatus(404));
		for (const id of ['dropped', 'voided']) assert.throws(() => f.get(id, auth), httpStatus(409));
	}
	for (const id of ['dropped', 'voided'])
		assert.throws(() => f.get(id, locals('student', 'b')), httpStatus(404));
	assert.throws(() => f.get('empty', locals('student', 'b')), httpStatus(409));
});

test('COR data uses selected enrollment and subject snapshots with custom units, excludes grades/auth', (t) => {
	const f = fixture(t);
	const record = f.get();
	assert.deepEqual(record, {
		student: {
			studentId: 'MA-202610-000001',
			name: 'Ana Muñoz',
			email: 'ana@example.com',
			address: 'Malolos, Bulacan',
			contactNumber: '09123456789',
			birthDate: '2000-02-29',
			sex: 'female'
		},
		enrollment: {
			id: 'old',
			programCode: 'BSIS',
			programName: 'Information Systems',
			schoolYearStart: 2025,
			semester: 2,
			yearLevel: 1,
			section: 'A',
			status: 'completed'
		},
		subjects: [
			{ code: 'IS101', name: 'Historical subject title', units: 2.5 },
			{ code: 'IS102', name: 'Practicum', units: 4 }
		]
	});
	assert.doesNotMatch(
		JSON.stringify(record),
		/grade|finalized|clearance|fee|PRIVATE|Catalog|Accountancy/i
	);
});

test('COR download returns actual private PDF attachment with complete registration and no fees/signatures', async (t) => {
	const f = fixture(t);
	await assert.rejects(() => f.download('old', locals('student', 'b')), httpStatus(404));
	const response = await f.download();
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('content-type'), 'application/pdf');
	assert.equal(response.headers.get('cache-control'), 'private, no-store');
	assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
	assert.equal(
		response.headers.get('content-disposition'),
		'attachment; filename="COR-MA-202610-000001-2025-semester-2.pdf"'
	);
	const bytes = new Uint8Array(await response.arrayBuffer());
	assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-');
	const pages = await readPdf(bytes);
	assert.equal(pages.length, 1);
	const text = pages
		.flat()
		.map((item) => item.str)
		.join(' ');
	for (const value of [
		'Bulacan Polytechnic College',
		'CERTIFICATE OF REGISTRATION (COR)',
		'Ana Muñoz',
		'MA-202610-000001',
		'Information Systems (BSIS)',
		'Sex',
		'Female',
		'Birth date',
		'Feb 29, 2000',
		'IS101',
		'Historical subject title',
		'IS102',
		'Practicum',
		'2.5',
		'Total units',
		'6.5'
	])
		assert.ok(text.includes(value), value);
	assert.doesNotMatch(
		text,
		/fee|tuition|grade|signature|approved by|assessed by|PRIVATE AUTH|Catalog renamed/i
	);
	const missingDemographics = f.get();
	missingDemographics.student.birthDate = null;
	missingDemographics.student.sex = null;
	const missingText = (await readPdf(await renderer.createCORPdf(missingDemographics)))
		.flat()
		.map((item) => item.str)
		.join(' ');
	assert.equal(missingText.match(/Not recorded/g)?.length, 2);
	const stubbed = load('src/routes/user/enrollment/[enrollmentId]/cor/+server.ts', {
		'#lib/server/db/index.js': { db: {} },
		'#lib/server/cor.js': {
			getCertificateOfRegistration: () => ({
				...f.get(),
				student: { ...f.get().student, studentId: 'MA/"\r\nBAD' }
			})
		},
		'#lib/server/cor-pdf.js': renderer
	});
	const unsafe = await stubbed.GET({ locals: locals('admin'), params: { enrollmentId: 'old' } });
	assert.equal(
		unsafe.headers.get('content-disposition'),
		'attachment; filename="COR-MA____BAD-2025-semester-2.pdf"'
	);
});

test('COR paginates long details, subject lists, and oversized tokens without losing text or leaving bounds', async (t) => {
	const record = fixture(t).get();
	record.student.address = `${'Long address details '.repeat(100)}ADDRESS-END`;
	const token = 'ABCDEFGHIJ'.repeat(230);
	record.subjects = Array.from({ length: 75 }, (_, i) => ({
		code: `S${String(i).padStart(3, '0')}`,
		name: `Subject-${i}-END`,
		units: 1.5
	}));
	record.subjects.splice(12, 0, {
		code: 'LONGCODE'.repeat(18),
		name: `${token}TOKEN-END`,
		units: 2
	});
	const pages = await readPdf(
		await renderer.createCORPdf(record, new Date('2026-10-17T00:00:00Z'))
	);
	assert.ok(pages.length > 3 && pages.length < 20, `Unexpected page count: ${pages.length}`);
	const text = pages
		.flat()
		.map((item) => item.str)
		.join(' ');
	const compact = text.replace(/\s/g, '');
	// Repeated page/table headings interrupt text extraction within an oversized row.
	const tokenParts = pages
		.flat()
		.map((item) => item.str)
		.filter((value) => /^[A-J]+$|^[A-J]*TOKEN-END$/.test(value));
	assert.equal(tokenParts.join(''), `${token}TOKEN-END`);
	assert.ok(text.includes('ADDRESS-END'));
	for (const subject of record.subjects.filter((subject) => subject.name !== `${token}TOKEN-END`))
		assert.ok(compact.includes(subject.name.replace(/\s/g, '')), subject.code);
	assert.ok(text.includes('114.5'));
	for (const [index, items] of pages.entries()) {
		assert.ok(
			items.some((item) => item.str.includes('CERTIFICATE OF REGISTRATION')),
			`Header page ${index + 1}`
		);
		assert.ok(items.some((item) => item.str === `Page ${index + 1} of ${pages.length}`));
		if (items.some((item) => /^S\d{3}$/.test(item.str))) {
			assert.ok(items.some((item) => item.str === 'Subject code'));
			assert.ok(items.some((item) => item.str === 'Subject title'));
		}
		for (const item of items.filter((item) => item.str.trim())) {
			const [, , , , x, y] = item.transform;
			assert.ok(
				x >= 41 && x + item.width <= 571,
				`Horizontal clipping on page ${index + 1}: ${item.str}`
			);
			assert.ok(y >= 25 && y <= 751, `Vertical clipping on page ${index + 1}: ${item.str}`);
		}
	}
});
