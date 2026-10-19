import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as kit from '@sveltejs/kit';
import { migrationConfigThrough } from './migration-config.mjs';

const require = createRequire(import.meta.url);
function load(file, deps = {}, source) {
	const { outputText } = ts.transpileModule(source ?? readFileSync(file, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => deps[id] ?? require(id), exports);
	return exports;
}
const roles = load('src/lib/Roles.ts');
const kinds = load('src/lib/documents.ts');
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
	.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'validateUser')
	.getText();
const { validateUser } = load(
	'',
	{ '@sveltejs/kit': kit },
	"import {error} from '@sveltejs/kit';\n" + guard
);
const status = (n) => (cause) => kit.isHttpError(cause) && cause.status === n;
const pdf = () =>
	new File(['%PDF-1.7\nTest document\n%%EOF'], 'record.pdf', { type: 'application/pdf' });

function fixture(t, through = 37) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(db, migrationConfigThrough(t, through));
	sqlite.exec(`INSERT INTO user(id,name,first_name,last_name,email,role,setup_complete) VALUES
	('s','Student','Student','','s@example.invalid','student',1),
	('other','Other','Other','','other@example.invalid','student',1),
	('staff','Registrar','Registrar','','r@example.invalid','registrar',1),
	('admin','Admin','Admin','','a@example.invalid','admin',1);
	INSERT INTO student(id,user_id,birth_date,sex) VALUES ('MA-001','s','2000-01-01','female'),('MA-002','other','2000-01-01','female');
	INSERT INTO program(id,code,name) VALUES ('p','BSIS','Information Systems');
	INSERT INTO curriculum(id,program_code,name,year_levels,semesters,published_at) VALUES ('c','BSIS','Published',4,2,1);
	UPDATE program SET active_curriculum_id='c';
	INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level,finalized_grades,submitted_clearance)
	VALUES ('e','MA-001','c','A',2026,1,4,1,1);
	UPDATE student SET enrollment_id='e' WHERE user_id='s';
	INSERT INTO subject(id,code,name) VALUES ('sub','IS101','Information Systems');
	INSERT INTO enrollment_subject(id,enrollment_id,subject_id,source,subject_code,subject_name,units,grade) VALUES ('es','e','sub','extra','IS101','Information Systems',3,1.5);`);
	const state = {
		role: 'registrar',
		userId: 'staff',
		configured: true,
		failPut: false,
		onPut: null
	};
	const objects = new Map();
	const files = {
		MAX_FILE_BYTES: 10 * 1024 * 1024,
		fileStorageConfigured: () => state.configured,
		safeUploadName: (name) => name.replace(/[/\\]/g, ''),
		downloadObject: async (key) =>
			new Response(objects.get(key), { headers: { 'Cache-Control': 'private, no-store' } }),
		getGarageS3Client: () => ({
			send: async (command) => {
				if (command.constructor.name === 'PutObjectCommand') {
					if (state.failPut) throw Error('Private storage failure');
					objects.set(command.input.Key, Buffer.from(command.input.Body));
					state.onPut?.();
				} else objects.delete(command.input.Key);
			}
		})
	};
	const deps = {
		'@sveltejs/kit': kit,
		'#lib/schema.js': schema,
		'#lib/Roles.js': roles,
		'#lib/documents.js': kinds,
		'#lib/server/db/index.js': { db },
		'#lib/server/auth.js': { validateUser },
		'#lib/server/garage/files.js': files
	};
	const notifications = load('src/lib/server/notifications.ts', deps);
	const service = load('src/lib/server/documents.ts', {
		...deps,
		'./notifications': notifications
	});
	const upload = load('src/lib/server/document-upload.ts', {
		...deps,
		'./db': { db },
		'./documents': service,
		'./garage/files': files,
		'./garage': { GARAGE_BUCKET: 'test' }
	});
	const actions = load('src/lib/actions/documents.remote.ts', {
		...deps,
		'#lib/server/documents.js': service,
		'#lib/server/document-upload.js': upload,
		'$app/server': {
			getRequestEvent: () => ({ locals: locals(), request: new Request('http://localhost') }),
			query:
				(...args) =>
				(...input) =>
					Object.assign(Promise.resolve(args.at(-1)(...input)), { refresh: async () => {} }),
			command: (validator, handler) => async (input) => handler(validator.parse(input)),
			form: (validator, handler) => async (input) => handler(validator.parse(input))
		}
	});
	const download = load('src/routes/user/document-files/[id]/+server.ts', deps).GET;
	const plan = load('src/lib/server/enrollment.ts', {
		...deps,
		'#lib/server/documents.js': service,
		'#lib/enrollment-grades.js': load('src/lib/enrollment-grades.ts')
	});
	function locals() {
		return {
			user: state.role ? { id: state.userId, role: state.role, name: 'Reviewer' } : null,
			session: state.role ? {} : null
		};
	}
	return {
		db,
		sqlite,
		service,
		state,
		objects,
		upload,
		actions,
		plan,
		notifications,
		rows: () => db.select().from(schema.requiredDocument).all(),
		request: (selected = ['form137', 'sf10', 'tor']) =>
			actions.requestDocuments({ userId: 's', enrollmentId: 'e', kinds: selected }),
		uploadRow: (row) => {
			state.role = 'student';
			state.userId = 's';
			return actions.uploadDocument({ id: row.id, revision: String(row.revision), file: pdf() });
		},
		download: (id) =>
			download({ locals: locals(), params: { id }, request: new Request('http://localhost') }),
		next: () => ({
			userId: 's',
			programCode: 'BSIS',
			curriculumId: 'c',
			currentEnrollmentId: 'e',
			section: 'A',
			schoolYearStart: 2026,
			semester: 2,
			yearLevel: 4,
			subjects: [{ id: 'sub', units: 3 }]
		})
	};
}

test('only staff request selected documents in the first semester of the final curriculum year', async (t) => {
	for (const role of ['admin', 'registrar']) {
		const f = fixture(t);
		f.state.role = role;
		f.state.userId = role === 'admin' ? 'admin' : 'staff';
		for (const [year, semester] of [
			[1, 1],
			[3, 1],
			[4, 2]
		]) {
			f.sqlite.prepare('UPDATE enrollment SET year_level=?,semester=?').run(year, semester);
			await assert.rejects(f.request(), status(409));
		}
		f.sqlite.exec('UPDATE enrollment SET year_level=4,semester=1');
		await assert.rejects(
			f.actions.requestDocuments({ userId: 's', enrollmentId: 'stale', kinds: ['tor'] }),
			status(409)
		);
		await f.request(['form137', 'tor']);
		assert.deepEqual(
			f
				.rows()
				.map((row) => row.kind)
				.sort(),
			['form137', 'tor']
		);
		assert(f.rows().every((row) => row.dueYearLevel === 4 && row.dueSemester === 2));
		await assert.rejects(f.request(['form137']), status(409));
		await assert.rejects(f.request(['sf10', 'sf10']));
		const notices = f.notifications.getNotifications(f.db, { id: 's', role: 'student' });
		assert.equal(notices.items[0].type, 'documents_requested');
		assert.equal(
			f.notifications.getNotifications(f.db, { id: 'other', role: 'student' }).items.length,
			0
		);
	}
	for (const role of ['student', null]) {
		const f = fixture(t);
		f.state.role = role;
		f.state.userId = 's';
		await assert.rejects(f.request(), status(role ? 403 : 401));
		assert.equal(f.rows().length, 0);
	}
});

test('student can upload only own requested documents; metadata never exposes Garage keys', async (t) => {
	const f = fixture(t);
	await f.request(['tor']);
	const row = f.rows()[0];
	f.state.role = 'student';
	f.state.userId = 'other';
	await assert.rejects(
		f.actions.uploadDocument({ id: row.id, revision: '0', file: pdf() }),
		status(404)
	);
	await assert.rejects(async () => f.actions.getStudentDocumentReview('s'), status(403));
	assert.equal(f.objects.size, 0);
	const result = await f.uploadRow(row);
	assert(result.success);
	assert.equal(f.rows()[0].status, 'uploaded');
	assert(!Object.hasOwn(result.document, 'objectKey'));
	assert(!Object.hasOwn((await f.actions.getStudentDocuments()).items[0], 'objectKey'));
	await assert.rejects(f.uploadRow(f.rows()[0]), status(409));
	assert.equal(f.objects.size, 1);
	await assert.rejects(
		f.actions.reviewDocument({ id: row.id, revision: 1, decision: 'verified' }),
		status(403)
	);
});

test('uploads reject spoofed MIME, corrupt images, empty and oversized files', async (t) => {
	const f = fixture(t);
	for (const file of [
		new File(['wrong'], 'x.pdf', { type: 'application/pdf' }),
		new File(['%PDF-1.7'], 'x.pdf', { type: 'application/pdf' }),
		new File(['bad'], 'x.jpg', { type: 'image/jpeg' }),
		new File([], 'x.pdf', { type: 'application/pdf' }),
		new File([Buffer.alloc(10 * 1024 * 1024 + 1)], 'x.pdf', { type: 'application/pdf' }),
		new File([readFileSync('static/clearance-reference.jpg')], 'x.png', { type: 'image/png' })
	]) {
		await assert.rejects(f.upload.validateDocumentFile(file), status(400));
	}
	await f.upload.validateDocumentFile(
		new File([readFileSync('static/clearance-reference.jpg')], 'x.jpg', { type: 'image/jpeg' })
	);
	assert.equal(f.objects.size, 0);
});

test('all uploads unblock student request; only all verified copies unblock final-semester enrollment', async (t) => {
	const f = fixture(t);
	await f.request();
	const current = { curriculumId: 'c', yearLevel: 4, semester: 1 };
	const block = () => f.service.documentUploadBlock(f.db, 's', current);
	assert.match(block(), /Form 137, SF10, TOR/);
	assert.equal(f.service.documentUploadBlock(f.db, 's', { ...current, yearLevel: 3 }), null);
	assert.equal(
		f.service.documentEnrollmentBlock(
			f.db,
			's',
			{ yearLevel: 4, semester: 1 },
			{ yearLevels: 4, semesters: 2 }
		),
		null
	);
	for (const row of f.rows()) await f.uploadRow(row);
	assert.equal(block(), null);
	assert.throws(() => f.plan.getEnrollmentPlan(f.db, f.next()), status(409));
	for (const row of f.rows()) {
		f.state.role = 'registrar';
		f.state.userId = 'staff';
		await f.actions.reviewDocument({ id: row.id, revision: row.revision, decision: 'verified' });
	}
	assert.equal(
		f.service.documentEnrollmentBlock(f.db, 's', f.next(), { yearLevels: 4, semesters: 2 }),
		null
	);
	assert.doesNotThrow(() => f.plan.getEnrollmentPlan(f.db, f.next()));
	await assert.rejects(f.uploadRow(f.rows()[0]), status(409));
});

test('staff rejection requires reason; replacement resets review and keeps stale revisions from verifying it', async (t) => {
	const f = fixture(t);
	await f.request(['sf10']);
	await f.uploadRow(f.rows()[0]);
	const original = f.rows()[0];
	f.state.role = 'admin';
	f.state.userId = 'admin';
	await assert.rejects(
		f.actions.reviewDocument({ id: original.id, revision: 0, decision: 'verified' }),
		status(409)
	);
	await assert.rejects(
		f.actions.reviewDocument({ id: original.id, revision: 1, decision: 'rejected' }),
		status(400)
	);
	await f.actions.reviewDocument({
		id: original.id,
		revision: 1,
		decision: 'rejected',
		reason: 'Please include every page.'
	});
	assert.match(f.service.getDocumentState(f.db, 's').uploadBlock, /SF10/);
	await f.uploadRow(f.rows()[0]);
	const replacement = f.rows()[0];
	assert.equal(replacement.status, 'uploaded');
	assert.equal(replacement.rejectionReason, null);
	assert.equal(replacement.reviewedAt, null);
	assert.equal(f.objects.size, 1);
	assert(!f.objects.has(original.objectKey));
	f.state.role = 'registrar';
	f.state.userId = 'staff';
	await assert.rejects(
		f.actions.reviewDocument({
			id: original.id,
			revision: original.revision,
			decision: 'verified'
		}),
		status(409)
	);
	await f.actions.reviewDocument({
		id: replacement.id,
		revision: replacement.revision,
		decision: 'verified'
	});
	assert.equal(f.rows()[0].status, 'verified');
});

test('storage failure and upload races preserve records and clean only unreferenced staged objects', async (t) => {
	const f = fixture(t);
	await f.request(['tor']);
	const original = f.rows()[0];
	f.state.failPut = true;
	await assert.rejects(f.uploadRow(original), status(503));
	assert.deepEqual(f.rows()[0], original);
	assert.equal(f.objects.size, 0);
	f.state.failPut = false;
	f.state.onPut = () => f.sqlite.exec('UPDATE required_document SET revision=revision+1');
	await assert.rejects(f.uploadRow(original), status(409));
	assert.equal(f.objects.size, 0);
	assert.equal(f.rows()[0].status, 'requested');
	f.state.onPut = null;
	await f.uploadRow(f.rows()[0]);
	f.state.role = 'registrar';
	f.state.userId = 'staff';
	await f.actions.reviewDocument({
		id: original.id,
		revision: f.rows()[0].revision,
		decision: 'rejected',
		reason: 'Upload the entire document.'
	});
	const rejected = f.rows()[0];
	f.state.failPut = true;
	await assert.rejects(f.uploadRow(rejected), status(503));
	assert.deepEqual(f.rows()[0], rejected);
	assert(f.objects.has(rejected.objectKey));
});

test('download permits owner/admin/registrar only and hides foreign files', async (t) => {
	const f = fixture(t);
	await f.request(['tor']);
	await f.uploadRow(f.rows()[0]);
	const row = f.rows()[0];
	for (const [role, userId] of [
		['student', 's'],
		['admin', 'admin'],
		['registrar', 'staff']
	]) {
		f.state.role = role;
		f.state.userId = userId;
		const response = await f.download(row.id);
		assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
		assert.match(await response.text(), /%PDF/);
	}
	f.state.role = 'student';
	f.state.userId = 'other';
	await assert.rejects(f.download(row.id), status(404));
	await assert.rejects(f.download(row.objectKey), status(404));
	f.state.role = null;
	await assert.rejects(f.download(row.id), status(401));
});

test('additive migration preserves existing data; rollback refuses to erase document requests', async (t) => {
	const f = fixture(t, 36);
	const tables = ['user', 'student', 'enrollment', 'enrollment_subject'];
	const before = tables.map((table) => f.sqlite.prepare(`SELECT * FROM ${table}`).all());
	migrate(f.db, { migrationsFolder: 'drizzle' });
	assert.deepEqual(
		tables.map((table) => f.sqlite.prepare(`SELECT * FROM ${table}`).all()),
		before
	);
	const rollback = readFileSync('drizzle/rollback/0037_required_documents.sql', 'utf8');
	f.sqlite.exec(rollback);
	assert.equal(
		f.sqlite.prepare("SELECT name FROM sqlite_master WHERE name='required_document'").get(),
		undefined
	);
	migrate(f.db, { migrationsFolder: 'drizzle' });
	await f.request(['tor']);
	assert.throws(() => f.sqlite.exec(rollback), /CHECK constraint failed/);
	if (f.sqlite.inTransaction) f.sqlite.exec('ROLLBACK');
	assert.equal(f.rows().length, 1);
	assert.deepEqual(f.sqlite.pragma('foreign_key_check'), []);
});
