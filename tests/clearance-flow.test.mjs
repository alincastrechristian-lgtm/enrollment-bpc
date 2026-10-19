import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as kit from '@sveltejs/kit';
const require = createRequire(import.meta.url);
function load(file, deps = {}) {
	const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => deps[id] ?? require(id), exports);
	return exports;
}
const core = load('src/lib/clearance/clearance.ts');
const identities = load('src/lib/clearance/identity.ts');
const studentIdentity = { name: 'Student', studentNumber: 'MA-001' };
const definitions = load('src/lib/clearance/definition.ts', { './clearance': core });
const reports = load('src/lib/clearance/report.ts', {
	'./clearance': core,
	'./checkbox': load('src/lib/clearance/checkbox.ts', { './clearance': core })
});
const roles = load('src/lib/Roles.ts');
const schema = load('src/lib/schema.ts', {
	'#lib/Roles.js': roles,
	'./email': load('src/lib/email.ts')
});
const status = (n) => (cause) => kit.isHttpError(cause) && cause.status === n;
const check = (verdict) => ({ label: 'Evidence', verdict, detail: 'Test evidence' });
const passed = () => ({
	template: [check('pass')],
	offices: [check('pass')],
	identity: identities.matchIdentity(studentIdentity, studentIdentity),
	officeCheckVersion: 2,
	identityCheckVersion: 1,
	identityPresence: { name: check('pass'), studentNumber: check('pass') }
});
const bytes = readFileSync('static/clearance-reference.jpg');
const image = () => new File([bytes], 'clearance.jpg', { type: 'image/jpeg' });
const box = { x: 0.2, y: 0.3, width: 0.12, height: 0.05 };
function definition() {
	return {
		corners: core.UNIT_CORNERS,
		semester: '2',
		schoolYear: '2025-2026',
		areas: ['text', 'text', 'image', 'semester', 'academicYear'].map((kind, i) => ({
			id: crypto.randomUUID(),
			label: `Area ${i}`,
			kind,
			expected: kind === 'text' ? 'Printed words' : '',
			box
		})),
		personalFields: ['studentName', 'studentNumber'].map((field) => ({
			id: crypto.randomUUID(),
			field,
			box
		})),
		officeRows: [
			{ id: crypto.randomUUID(), label: 'Library', office: box, cleared: box, signature: box }
		]
	};
}
function fixture(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	sqlite.exec(`INSERT INTO user(id,name,first_name,last_name,email,role,setup_complete) VALUES ('s','Student','Student','','s@example.invalid','student',1),('other','Other','Other','','other@example.invalid','student',1),('staff','Registrar','Registrar','','r@example.invalid','registrar',1);
	INSERT INTO student(id,user_id,birth_date,sex) VALUES ('MA-001','s','2000-01-01','female'),('MA-002','other','2000-01-01','female');
	INSERT INTO program(id,code,name) VALUES ('p','BSIS','Information Systems');
	INSERT INTO curriculum(id,program_code,name,year_levels,semesters,published_at) VALUES ('c','BSIS','Published',4,2,1);
	UPDATE program SET active_curriculum_id='c';
	INSERT INTO enrollment(id,student_id,curriculum_id,section,school_year_start,semester,year_level,finalized_grades) VALUES ('e','MA-001','c','A',2025,2,1,1);
	UPDATE student SET enrollment_id='e' WHERE user_id='s';
	INSERT INTO subject(id,code,name) VALUES ('sub','IS101','Information Systems');
	INSERT INTO enrollment_subject(id,enrollment_id,subject_id,source,subject_code,subject_name,units,grade) VALUES ('es','e','sub','extra','IS101','Information Systems',3,1.5);`);
	const revision = crypto.randomUUID(),
		config = definition();
	db.insert(schema.clearanceTemplate)
		.values({
			id: 1,
			revision,
			objectKey: 'blank',
			filename: 'blank.jpg',
			contentType: 'image/jpeg',
			size: bytes.length,
			definition: config,
			uploadedAt: new Date()
		})
		.run();
	const state = {
		role: 'student',
		userId: 's',
		report: passed(),
		identityReadings: { ...studentIdentity },
		identityCalls: 0,
		onCheck: null,
		puts: 0,
		reads: 0,
		failPut: false,
		failDelete: false
	};
	const objects = new Map([['blank', bytes]]);
	const files = {
		MAX_FILE_BYTES: 10 * 1024 * 1024,
		fileStorageConfigured: () => true,
		safeUploadName: (name) => name.replace(/[/\\]/g, ''),
		downloadObject: async (key) => {
			state.reads++;
			return new Response(objects.get(key));
		},
		getGarageS3Client: () => ({
			send: async (command) => {
				const { Key, Body } = command.input;
				if (command.constructor.name === 'PutObjectCommand') {
					state.puts++;
					if (state.failPut) throw Error('Storage failed');
					objects.set(Key, Buffer.from(Body));
				} else {
					if (state.failDelete) throw Error('Cleanup failed');
					objects.delete(Key);
				}
			}
		})
	};
	const deps = {
		'#lib/schema.js': schema,
		'#lib/Roles.js': roles,
		'#lib/server/db/index.js': { db },
		'@sveltejs/kit': kit,
		'#lib/clearance/report.js': reports,
		'#lib/clearance/identity.js': identities,
		'#lib/clearance/definition.js': definitions,
		'#lib/clearance/clearance.js': core,
		'#lib/server/auth.js': {
			validateUser: (locals, allowed) => {
				if (!locals.user) kit.error(401, 'Sign in');
				if (!allowed.includes(locals.user.role)) kit.error(403, 'Forbidden');
			}
		},
		'$app/server': {
			getRequestEvent: () => ({
				locals: {
					user: state.role
						? {
								id: state.userId,
								name: state.role === 'student' ? 'Student' : 'Registrar',
								role: state.role
							}
						: null,
					session: state.role ? {} : null
				}
			}),
			query: (handler) => () =>
				Object.assign(Promise.resolve(handler()), { refresh: async () => {} }),
			command: (validator, handler) => async (input) => handler(validator.parse(input)),
			form: (validator, handler) => async (input) => handler(validator.parse(input))
		}
	};
	deps['#lib/server/documents.js'] = load('src/lib/server/documents.ts', {
		...deps,
		'#lib/documents.js': load('src/lib/documents.ts'),
		'./notifications': load('src/lib/server/notifications.ts', deps)
	});
	const enrollmentService = load('src/lib/server/student-enrollment.ts', deps);
	const workflow = load('src/lib/server/clearance-workflow.ts', {
		...deps,
		'./student-enrollment': enrollmentService
	});
	const upload = load('src/lib/server/clearance-upload.ts', {
		...deps,
		'./db': { db },
		'./clearance-workflow': workflow,
		'./garage': { GARAGE_BUCKET: 'bpc' },
		'./garage/files': files,
		'./handwriting': {
			recognizeIdentity: async (crops) => {
				state.identityCalls++;
				state.identityCrops = crops;
				if (state.identityError) throw state.identityError;
				return state.identityReadings;
			}
		},
		'./clearance-checker': {
			clearanceIdentityCrops: async () => ({ name: 'name-crop', studentNumber: 'number-crop' }),
			decodeClearance: async (data, type) => {
				if (type !== 'image/jpeg' || data[0] !== 255) kit.error(400, 'Bad image');
				return {};
			},
			checkClearance: async (_reference, _image, _corners, definition, term) => {
				state.checked = { definition, term };
				await state.onCheck?.();
				return { ...structuredClone(state.report), identity: 'deferred' };
			}
		}
	});
	const remote = load('src/lib/actions/clearance.remote.ts', {
		...deps,
		'#lib/server/clearance-template.js': {},
		'#lib/server/garage/files.js': files,
		'#lib/server/clearance-workflow.js': workflow,
		'#lib/server/clearance-upload.js': upload
	});
	const grades = load('src/lib/actions/grades.remote.ts', {
		...deps,
		'#lib/server/clearance-workflow.js': workflow,
		'#lib/server/student-enrollment.js': enrollmentService,
		'#lib/enrollment-grades.js': load('src/lib/enrollment-grades.ts'),
		'#lib/server/email/index.js': {},
		'#lib/server/notifications.js': {},
		'#lib/server/email/templates.js': {},
		'$app/paths': { resolve: (x) => x },
		'$app/env/private': { ORIGIN: 'http://localhost' }
	});
	const plan = load('src/lib/server/enrollment.ts', {
		...deps,
		'#lib/subject-prerequisites.js': load('src/lib/subject-prerequisites.ts', {
			'#lib/enrollment-grades.js': load('src/lib/enrollment-grades.ts')
		}),
		'#lib/enrollment-grades.js': load('src/lib/enrollment-grades.ts')
	});
	return {
		db,
		sqlite,
		state,
		objects,
		workflow,
		remote,
		grades,
		plan,
		config,
		revision,
		upload: () =>
			remote.uploadClearance({
				file: image(),
				enrollmentId: 'e',
				revision: '0',
				templateRevision: revision,
				corners: JSON.stringify(core.UNIT_CORNERS)
			}),
		row: () => db.select().from(schema.clearanceSubmission).get(),
		reference: (submissionId) => ({
			userId: 's',
			enrollmentId: 'e',
			revision: db.select().from(schema.enrollment).get().revision,
			submissionId
		}),
		next: () => ({
			userId: 's',
			programCode: 'BSIS',
			curriculumId: 'c',
			currentEnrollmentId: 'e',
			section: 'A',
			schoolYearStart: 2026,
			semester: 1,
			yearLevel: 2,
			subjects: [{ id: 'sub', units: 3 }]
		})
	};
}

test('finalize → private checked upload → student request → staff verification → enrollment gate', async (t) => {
	const f = fixture(t);
	f.sqlite.exec('UPDATE enrollment SET finalized_grades=0');
	await assert.rejects(f.upload(), status(409));
	assert.equal(f.state.puts, 0);
	f.sqlite.exec('UPDATE enrollment SET finalized_grades=1');
	const result = await f.upload();
	assert(result.success);
	assert.equal(f.row().status, 'ready');
	assert.equal(f.row().report.identity.verdict, 'match');
	assert.equal(f.state.identityCalls, 1);
	assert(f.objects.has(f.row().objectKey));
	assert(!Object.hasOwn(result.submission, 'objectKey'));
	assert.equal(
		f.sqlite.prepare('SELECT submitted_clearance FROM enrollment').get().submitted_clearance,
		0
	);
	assert.throws(() => f.plan.getEnrollmentPlan(f.db, f.next()), status(409));
	f.state.role = 'registrar';
	f.state.userId = 'staff';
	await assert.rejects(
		f.grades.verifyEnrollmentClearance(f.reference(result.submission.id)),
		status(409)
	);
	f.state.role = 'student';
	f.state.userId = 's';
	await f.remote.requestEnrollment({ submissionId: result.submission.id });
	assert.equal(f.row().status, 'requested');
	await assert.rejects(
		f.remote.requestEnrollment({ submissionId: result.submission.id }),
		status(409)
	);
	await assert.rejects(f.upload(), status(409));
	assert.equal(f.workflow.clearanceRequests(f.db).length, 1);
	f.state.role = 'registrar';
	f.state.userId = 'staff';
	await assert.rejects(
		f.grades.verifyEnrollmentClearance({ ...f.reference(result.submission.id), revision: 99 }),
		status(409)
	);
	await f.grades.verifyEnrollmentClearance(f.reference(result.submission.id));
	assert.equal(f.row().status, 'verified');
	assert.equal(f.row().reviewerName, 'Registrar');
	assert(f.row().reviewedAt);
	assert.equal(f.db.select().from(schema.enrollment).get().submittedClearance, true);
	assert(f.plan.getEnrollmentPlan(f.db, f.next()));
	await assert.rejects(
		f.grades.verifyEnrollmentClearance(f.reference(result.submission.id)),
		status(409)
	);
	f.sqlite.exec("UPDATE student SET enrollment_id=NULL WHERE user_id='s'");
	assert.equal(
		f.workflow.clearanceRequests(f.db).length,
		0,
		'Consumed/current-enrollment scope removes completed requests.'
	);
});

test('final-semester requests require every selected document upload; staff enrollment also requires verification', async (t) => {
	const f = fixture(t);
	f.sqlite.exec('UPDATE enrollment SET year_level=4,semester=1');
	const result = await f.upload();
	for (const kind of ['form137', 'sf10'])
		f.db
			.insert(schema.requiredDocument)
			.values({
				userId: 's',
				requestedEnrollmentId: 'e',
				kind,
				dueYearLevel: 4,
				dueSemester: 2,
				requestedBy: 'staff',
				requestedAt: new Date()
			})
			.run();
	await assert.rejects(
		f.remote.requestEnrollment({ submissionId: result.submission.id }),
		status(409)
	);
	f.sqlite.exec(
		"UPDATE required_document SET status='uploaded',object_key=id,filename='document.pdf',content_type='application/pdf',size=20,uploaded_at=1 WHERE kind='form137'"
	);
	await assert.rejects(
		f.remote.requestEnrollment({ submissionId: result.submission.id }),
		status(409)
	);
	f.sqlite.exec(
		"UPDATE required_document SET status='uploaded',object_key=id,filename='document.pdf',content_type='application/pdf',size=20,uploaded_at=1 WHERE kind='sf10'"
	);
	await f.remote.requestEnrollment({ submissionId: result.submission.id });
	f.state.role = 'registrar';
	f.state.userId = 'staff';
	await f.grades.verifyEnrollmentClearance(f.reference(result.submission.id));
	const next = { ...f.next(), yearLevel: 4, semester: 2 };
	assert.throws(() => f.plan.getEnrollmentPlan(f.db, next), status(409));
	f.sqlite.exec("UPDATE required_document SET status='verified' WHERE kind='form137'");
	assert.throws(() => f.plan.getEnrollmentPlan(f.db, next), status(409));
	f.sqlite.exec("UPDATE required_document SET status='verified' WHERE kind='sf10'");
	assert.doesNotThrow(() => f.plan.getEnrollmentPlan(f.db, next));
});

test('failed or uncertain template/office checks never save a file or permit an enrollment request', async (t) => {
	const f = fixture(t);
	for (const report of [
		{ ...passed(), template: [check('fail')], offices: [] },
		{ ...passed(), offices: [check('review')] },
		{ ...passed(), offices: [] }
	]) {
		f.state.report = report;
		assert.equal((await f.upload()).success, false);
		assert.equal(f.row(), undefined);
		assert.equal(f.state.puts, 0);
	}
	await assert.rejects(
		f.remote.requestEnrollment({ submissionId: crypto.randomUUID() }),
		status(404)
	);
	await assert.rejects(
		f.remote.uploadClearance({
			file: image(),
			enrollmentId: 'e',
			revision: '0',
			templateRevision: f.revision,
			corners: JSON.stringify(core.UNIT_CORNERS),
			report: passed()
		})
	);
});

test('older checkbox reports cannot request or verify; unreviewed submissions can be rechecked', async (t) => {
	const f = fixture(t);
	const first = await f.upload();
	const oldReport = { ...passed(), officeCheckVersion: undefined };
	f.db.update(schema.clearanceSubmission).set({ report: oldReport }).run();
	assert.equal(reports.clearancePassed(oldReport), false);
	await assert.rejects(
		f.remote.requestEnrollment({ submissionId: first.submission.id }),
		status(409)
	);
	const second = await f.upload();
	await f.remote.requestEnrollment({ submissionId: second.submission.id });
	f.db.update(schema.clearanceSubmission).set({ report: oldReport }).run();
	f.state.role = 'registrar';
	f.state.userId = 'staff';
	await assert.rejects(
		f.grades.verifyEnrollmentClearance(f.reference(second.submission.id)),
		status(409)
	);
	f.state.role = 'student';
	f.state.userId = 's';
	const previousKey = f.row().objectKey;
	const replacement = await f.upload();
	assert(replacement.success);
	assert.equal(f.row().status, 'ready');
	assert(!f.objects.has(previousKey));
	await assert.rejects(
		f.remote.requestEnrollment({ submissionId: second.submission.id }),
		status(404)
	);
	await f.remote.requestEnrollment({ submissionId: replacement.submission.id });
	f.state.role = 'registrar';
	f.state.userId = 'staff';
	await f.grades.verifyEnrollmentClearance(f.reference(replacement.submission.id));
	f.db.update(schema.clearanceSubmission).set({ report: oldReport }).run();
	assert(f.plan.getEnrollmentPlan(f.db, f.next()), 'Prior staff approvals remain valid.');
	f.state.role = 'student';
	f.state.userId = 's';
	await assert.rejects(f.upload(), status(409));
});

test('ownership, roles, stale template, missing office setup, and malformed outlines fail closed', async (t) => {
	const f = fixture(t);
	for (const role of ['registrar', 'admin', null]) {
		f.state.role = role;
		await assert.rejects(f.upload(), status(role ? 403 : 401));
	}
	f.state.role = 'student';
	f.state.userId = 'other';
	await assert.rejects(f.upload(), status(404));
	f.state.userId = 's';
	await assert.rejects(
		f.remote.uploadClearance({
			file: image(),
			enrollmentId: 'e',
			revision: '0',
			templateRevision: f.revision,
			corners: 'invalid'
		})
	);
	f.db
		.update(schema.clearanceTemplate)
		.set({ definition: { ...f.config, officeRows: [] } })
		.run();
	await assert.rejects(f.upload(), status(503));
	f.db
		.update(schema.clearanceTemplate)
		.set({ definition: f.config, revision: crypto.randomUUID() })
		.run();
	await assert.rejects(f.upload(), status(409));
	assert.equal(f.state.puts, 0);
});

test('staff return requests for correction; student can replace the private file and request again', async (t) => {
	const f = fixture(t);
	f.state.identityReadings = { name: '', studentNumber: '' };
	const first = await f.upload();
	assert.equal(first.report.identity.verdict, 'review');
	const key = f.row().objectKey;
	f.state.userId = 'other';
	await assert.rejects(
		f.remote.requestEnrollment({ submissionId: first.submission.id }),
		status(404)
	);
	f.state.userId = 's';
	await f.remote.requestEnrollment({ submissionId: first.submission.id });
	await assert.rejects(
		f.remote.rejectClearance({
			...f.reference(first.submission.id),
			reason: 'Missing office approval'
		}),
		status(403)
	);
	f.state.role = 'registrar';
	f.state.userId = 'staff';
	await f.remote.rejectClearance({
		...f.reference(first.submission.id),
		reason: 'Please upload a clearer student name and number.'
	});
	assert.equal(f.row().status, 'rejected');
	assert.match(f.row().rejectionReason, /clearer/);
	await assert.rejects(
		f.grades.verifyEnrollmentClearance(f.reference(first.submission.id)),
		status(409)
	);
	f.state.role = 'student';
	f.state.userId = 's';
	f.state.identityReadings = studentIdentity;
	const result = await f.remote.uploadClearance({
		file: image(),
		enrollmentId: 'e',
		revision: String(f.reference(first.submission.id).revision),
		templateRevision: f.revision,
		corners: JSON.stringify(core.UNIT_CORNERS)
	});
	assert(result.success);
	assert.notEqual(result.submission.id, first.submission.id);
	assert(!f.objects.has(key));
	assert.equal(f.row().requestedAt, null);
	await f.remote.requestEnrollment({ submissionId: result.submission.id });
	assert.equal(f.row().status, 'requested');
});

test('a request racing a replacement upload preserves the requested file and cleans the staged object', async (t) => {
	const f = fixture(t);
	const first = await f.upload();
	const key = f.row().objectKey;
	f.state.onCheck = () => f.remote.requestEnrollment({ submissionId: first.submission.id });
	await assert.rejects(f.upload(), status(409));
	assert.equal(f.row().id, first.submission.id);
	assert.equal(f.row().status, 'requested');
	assert(f.objects.has(key));
	assert.equal(f.objects.size, 2, 'Only the blank reference and accepted upload remain.');
});

test('storage failure and template changes during OCR preserve the previous record and object', async (t) => {
	const f = fixture(t);
	const first = await f.upload(),
		key = f.row().objectKey;
	f.state.failPut = true;
	await assert.rejects(f.upload());
	assert.equal(f.row().id, first.submission.id);
	f.state.failPut = false;
	f.state.onCheck = () =>
		f.db.update(schema.clearanceTemplate).set({ revision: crypto.randomUUID() }).run();
	await assert.rejects(f.upload(), status(409));
	assert.equal(f.row().id, first.submission.id);
	assert(f.objects.has(key));
	assert.equal(f.objects.size, 2);
});

test('uploads use the trusted enrollment term and reuse templates from other terms', async (t) => {
	const f = fixture(t);
	f.db
		.update(schema.clearanceTemplate)
		.set({ definition: { ...f.config, semester: '1', schoolYear: '2026-2027' } })
		.run();
	const result = await f.upload();
	assert.equal(result.success, true);
	assert.deepEqual(f.state.checked.term, { semester: '2', schoolYear: '2025-2026' });
	assert(!('semester' in f.state.checked.definition));
	assert(!('schoolYear' in f.state.checked.definition));
	assert.equal(f.state.puts, 1);
});
test('incorrect uploaded term blocks persistence; client cannot supply its own expected term', async (t) => {
	const f = fixture(t);
	f.state.report = {
		...f.state.report,
		template: [{ label: 'Upload: Academic year', verdict: 'fail', detail: 'Wrong enrollment year' }]
	};
	const result = await f.upload();
	assert.equal(result.success, false);
	assert.equal(f.state.puts, 0);
	assert.equal(f.row(), undefined);
	await assert.rejects(
		f.remote.uploadClearance({
			file: image(),
			enrollmentId: 'e',
			revision: '0',
			templateRevision: f.revision,
			corners: JSON.stringify(core.UNIT_CORNERS),
			semester: '1',
			schoolYear: '2026-2027'
		})
	);
});

test('personal areas are required before OCR or Gemini; legacy templates remain editable', async (t) => {
	const f = fixture(t);
	f.db
		.update(schema.clearanceTemplate)
		.set({ definition: { ...f.config, personalFields: [] } })
		.run();
	await assert.rejects(f.upload(), status(503));
	assert.equal(f.state.reads, 0);
	assert.equal(f.state.identityCalls, 0);
});
test('personal verification uses DB identity and blocks mismatch and provider failures without saving', async (t) => {
	const f = fixture(t);
	for (const readings of [{ name: 'Someone Else', studentNumber: 'MA-999' }]) {
		f.state.identityReadings = readings;
		const result = await f.upload();
		assert.equal(result.success, false);
		assert.equal(f.row(), undefined);
		assert.equal(f.state.puts, 0);
	}
	f.state.identityError = Error('Provider unavailable');
	await assert.rejects(f.upload(), status(503));
	assert.equal(f.state.puts, 0);
	f.state.identityError = null;
	f.state.identityReadings = { ...studentIdentity, studentNumber: '001' };
	const matched = await f.upload();
	assert.equal(matched.success, true);
	assert.equal(matched.report.identity.studentNumber.expected, 'MA-001');
	assert.deepEqual(f.state.identityCrops, { name: 'name-crop', studentNumber: 'number-crop' });
});

test('uncertain identity saves for review; only admin/registrar explicit confirmation unlocks enrollment', async (t) => {
	for (const role of ['admin', 'registrar']) {
		const f = fixture(t);
		f.state.identityReadings =
			role === 'admin'
				? { name: '', studentNumber: '' }
				: { ...studentIdentity, warnings: { name: 'Unusable transcription' } };
		const result = await f.upload();
		assert.equal(result.success, true);
		assert.equal(result.report.identity.verdict, 'review');
		assert.equal(reports.clearancePassed(result.report), false);
		assert.equal(reports.clearanceCanSubmit(result.report), true);
		assert.equal(f.row().status, 'ready');
		assert.equal(f.db.select().from(schema.enrollment).get().submittedClearance, false);
		assert.throws(() => f.plan.getEnrollmentPlan(f.db, f.next()), status(409));
		await f.remote.requestEnrollment({ submissionId: result.submission.id });
		assert.equal(f.row().status, 'requested');
		assert.equal(f.workflow.clearanceRequests(f.db).length, 1);
		await assert.rejects(
			f.grades.verifyEnrollmentClearance({
				...f.reference(result.submission.id),
				identityConfirmed: true
			}),
			status(403)
		);
		f.state.role = role;
		f.state.userId = 'staff';
		for (const extra of [{}, { identityConfirmed: false }])
			await assert.rejects(
				f.grades.verifyEnrollmentClearance({ ...f.reference(result.submission.id), ...extra }),
				status(409)
			);
		assert.equal(f.row().status, 'requested');
		assert.throws(() => f.plan.getEnrollmentPlan(f.db, f.next()), status(409));
		await f.grades.verifyEnrollmentClearance({
			...f.reference(result.submission.id),
			identityConfirmed: true
		});
		assert.equal(f.row().status, 'verified');
		assert.equal(f.row().reviewedBy, 'staff');
		assert(f.row().reviewedAt);
		assert.equal(
			f.row().report.identity.verdict,
			'review',
			'Keep automated evidence for the staff review record.'
		);
		assert.equal(f.db.select().from(schema.enrollment).get().submittedClearance, true);
		assert(f.plan.getEnrollmentPlan(f.db, f.next()));
	}
});

test('manual identity confirmation cannot bypass failed template, office, mismatch or legacy reports', async (t) => {
	const f = fixture(t),
		uploaded = await f.upload();
	await f.remote.requestEnrollment({ submissionId: uploaded.submission.id });
	f.state.role = 'admin';
	f.state.userId = 'staff';
	const mismatch = identities.matchIdentity(
		{ name: 'Someone Else', studentNumber: '99999999' },
		studentIdentity
	);
	for (const report of [
		{ ...passed(), template: [check('review')] },
		{ ...passed(), offices: [check('fail')] },
		{ ...passed(), identity: mismatch },
		{ ...passed(), identity: 'deferred' },
		{ ...passed(), officeCheckVersion: 1 }
	]) {
		f.db.update(schema.clearanceSubmission).set({ report }).run();
		await assert.rejects(
			f.grades.verifyEnrollmentClearance({
				...f.reference(uploaded.submission.id),
				identityConfirmed: true
			}),
			status(409)
		);
		assert.equal(f.db.select().from(schema.enrollment).get().submittedClearance, false);
	}
});

test('empty identity areas fail before Gemini or storage; unchecked reports require another upload', async (t) => {
	const f = fixture(t);
	for (const field of ['name', 'studentNumber']) {
		f.state.report = {
			...passed(),
			identityPresence: { ...passed().identityPresence, [field]: check('fail') }
		};
		const result = await f.upload();
		assert.equal(result.success, false);
		assert.equal(result.report.identity, 'deferred');
		assert.equal(f.state.identityCalls, 0);
		assert.equal(f.state.puts, 0);
		assert.equal(f.row(), undefined);
	}
	f.state.report = passed();
	const saved = await f.upload();
	const calls = f.state.identityCalls,
		puts = f.state.puts,
		key = f.row().objectKey;
	f.state.report = {
		...passed(),
		identityPresence: { name: check('fail'), studentNumber: check('pass') }
	};
	assert.equal((await f.upload()).success, false);
	assert.equal(f.state.identityCalls, calls);
	assert.equal(f.state.puts, puts);
	assert.equal(f.row().id, saved.submission.id);
	assert(f.objects.has(key), 'Blank replacement preserves the saved clearance.');
	f.state.report = passed();
	const oldReport = { ...passed() };
	delete oldReport.identityPresence;
	delete oldReport.identityCheckVersion;
	f.db.update(schema.clearanceSubmission).set({ report: oldReport }).run();
	await assert.rejects(
		f.remote.requestEnrollment({ submissionId: saved.submission.id }),
		status(409)
	);
	f.db
		.update(schema.clearanceSubmission)
		.set({ status: 'requested', requestedAt: new Date() })
		.run();
	assert.equal(reports.hasCurrentClearanceChecks(f.row().report), false);
	assert.equal(
		(await f.upload()).success,
		true,
		'Unverified reports without a presence check can be replaced.'
	);
});
test('legacy deferred identity reports cannot request or verify and can be replaced', async (t) => {
	const f = fixture(t);
	const first = await f.upload();
	f.db
		.update(schema.clearanceSubmission)
		.set({ report: { ...passed(), identity: 'deferred' } })
		.run();
	await assert.rejects(
		f.remote.requestEnrollment({ submissionId: first.submission.id }),
		status(409)
	);
	f.db
		.update(schema.clearanceSubmission)
		.set({ status: 'requested', requestedAt: new Date() })
		.run();
	f.state.role = 'registrar';
	f.state.userId = 'staff';
	await assert.rejects(
		f.grades.verifyEnrollmentClearance(f.reference(first.submission.id)),
		status(409)
	);
	f.state.role = 'student';
	f.state.userId = 's';
	assert.equal((await f.upload()).success, true);
});
test('failed template or office checks skip Gemini; identity changes during checking reject staged upload', async (t) => {
	const f = fixture(t);
	f.state.report = { ...passed(), template: [check('fail')] };
	assert.equal((await f.upload()).success, false);
	assert.equal(f.state.identityCalls, 0);
	f.state.report = passed();
	f.state.onCheck = () =>
		f.db
			.update(schema.user)
			.set({ name: 'Updated Student' })
			.where(require('drizzle-orm').eq(schema.user.id, 's'))
			.run();
	await assert.rejects(f.upload(), status(409));
	assert.equal(f.row(), undefined);
	assert.equal(f.objects.size, 1);
});
