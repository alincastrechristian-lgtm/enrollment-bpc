import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
// Remote commands need SvelteKit request context. Inject that boundary while testing real SQL.
function loadTypeScript(filename, dependencies = {}, sourceOverride) {
	const source = sourceOverride ?? readFileSync(new URL('../' + filename, import.meta.url), 'utf8');
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => dependencies[id] ?? require(id), exports);
	return exports;
}
const { Role } = loadTypeScript('src/lib/Roles.ts');
const schema = loadTypeScript('src/lib/schema.ts', { '#lib/Roles.js': { Role } });
const documents = loadTypeScript('src/lib/applicants.ts');
const authSource = readFileSync(new URL('../src/lib/server/auth.ts', import.meta.url), 'utf8');
const validateUserSource = ts
	.createSourceFile('auth.ts', authSource, ts.ScriptTarget.Latest, true)
	.statements.find(
		(statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === 'validateUser'
	)
	.getText();

const input = {
	applicantId: 'applicant-1',
	section: 'B',
	schoolYearStart: 2025,
	semester: 1,
	yearLevel: 1,
	subjects: [
		{ id: 's1', units: 6 },
		{ id: 's2', units: 2 },
		{ id: 's3', units: 5 }
	]
};
function fixture(t, role = Role.REGISTRAR) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	require('drizzle-orm/better-sqlite3/migrator').migrate(db, { migrationsFolder: 'drizzle' });
	db.insert(schema.user)
		.values({
			id: 'operator',
			role: role ?? Role.STUDENT,
			name: 'Operator',
			email: 'operator@example.com'
		})
		.run();
	db.insert(schema.program).values({ id: 'p', code: 'BSIS', name: 'Information Systems' }).run();
	db.insert(schema.curriculum)
		.values([
			{ id: 'draft', name: 'Draft', programCode: 'BSIS' },
			{ id: 'active', name: 'Published', programCode: 'BSIS', publishedAt: new Date(1000) },
			{ id: 'replacement', name: 'Replacement', programCode: 'BSIS', publishedAt: new Date(2000) }
		])
		.run();
	db.update(schema.program).set({ activeCurriculumId: 'active' }).run();
	db.insert(schema.subject)
		.values([
			{ id: 's1', code: 'LIVE101', name: 'Changed catalog subject' },
			{ id: 's2', code: 'LIVE102', name: 'Other term subject' },
			{ id: 's3', code: 'EXTRA', name: 'Extra subject' }
		])
		.run();
	db.insert(schema.curriculumSubject)
		.values([
			{
				id: 'cs1',
				curriculumId: 'active',
				subjectId: 's1',
				yearLevel: 1,
				semester: 1,
				units: 3,
				subjectCode: 'SNAP101',
				subjectName: 'Published subject'
			},
			{
				id: 'cs2',
				curriculumId: 'active',
				subjectId: 's2',
				yearLevel: 2,
				semester: 2,
				units: 4,
				subjectCode: 'SNAP102',
				subjectName: 'Published other term'
			}
		])
		.run();
	db.insert(schema.applicant)
		.values({
			id: 'applicant-1',
			applicationId: 'MA-202610-000001',
			name: 'Stored Applicant',
			programCode: 'BSIS',
			yearLevel: 1,
			dateApplied: new Date(),
			email: 'stored@example.com',
			contactNumber: '09123456789',
			address: 'Bulacan',
			hasBirthCertificate: true,
			hasForm138: true,
			hasGoodMoral: true,
			hasPicture: true
		})
		.run();
	const state = {
		creations: 0,
		invitations: [],
		onCreate: undefined,
		onInvite: undefined,
		invitationFails: false
	};
	const error = (status, message) => {
		throw Object.assign(new Error(message), { status });
	};
	const { validateUser } = loadTypeScript(
		'src/lib/server/auth.ts',
		{ '@sveltejs/kit': { error } },
		"import { error } from '@sveltejs/kit';\n" + validateUserSource
	);
	const auth = {
		api: {
			async createUser({ body }) {
				assert.equal(sqlite.inTransaction, false, 'auth must run outside synchronous transaction');
				state.creations++;
				await Promise.resolve();
				const created = { ...body, id: crypto.randomUUID(), role: body.role ?? Role.STUDENT };
				db.insert(schema.user).values(created).run();
				db.insert(schema.account)
					.values({
						id: crypto.randomUUID(),
						accountId: created.id,
						userId: created.id,
						providerId: 'credential'
					})
					.run();
				await state.onCreate?.(created);
				return { user: created };
			},
			async requestPasswordReset({ body }) {
				assert.equal(sqlite.inTransaction, false, 'email must run after commit');
				assert.equal(body.redirectTo, '/first-login');
				await state.onInvite?.();
				state.invitations.push(body.email);
				if (state.invitationFails) throw new Error('Mail unavailable');
			}
		}
	};
	const commands = loadTypeScript('src/lib/actions/user.remote.ts', {
		'#lib/Roles.js': { Role },
		'#lib/applicants.js': documents,
		'#lib/schema.js': schema,
		'../server/db': { db },
		'#lib/server/auth.js': { auth, validateUser },
		'$app/server': {
			command: (validation, handler) => async (data) => handler(validation.parse(data)),
			getRequestEvent: () => ({
				locals: { user: role ? { id: 'operator', role } : null, session: role ? {} : null },
				request: { headers: new Headers() }
			})
		},
		'@sveltejs/kit': { error, isHttpError: (cause) => Number.isInteger(cause?.status) }
	});
	return {
		...commands,
		db,
		sqlite,
		state,
		record: () => db.select().from(schema.applicant).get(),
		users: () =>
			db
				.select()
				.from(schema.user)
				.all()
				.filter((row) => row.id !== 'operator')
	};
}
function assertNoEnrollment(f) {
	assert.equal(f.record()?.userId ?? null, null);
	assert.deepEqual(f.users(), []);
	for (const table of [
		schema.studentData,
		schema.enrollment,
		schema.enrollmentSubject,
		schema.account
	]) {
		assert.deepEqual(f.db.select().from(table).all(), []);
	}
	assert.deepEqual(f.state.invitations, []);
}
for (const role of [Role.ADMIN, Role.REGISTRAR]) {
	test(`${role} enrolls stored applicant atomically and sends invitation after commit`, async (t) => {
		const f = fixture(t, role);
		f.state.onInvite = () => {
			assert.equal(f.db.select().from(schema.enrollment).all().length, 1);
			assert.equal(f.db.select().from(schema.enrollmentSubject).all().length, 3);
		};
		const result = await f.enrollStudent({ ...input, name: 'Forged', email: 'forged@example.com' });
		const [created] = f.users();
		assert.equal(created.name, 'Stored Applicant');
		assert.equal(created.email, 'stored@example.com');
		assert.equal(created.role, Role.STUDENT);
		assert.equal(f.record().userId, created.id);
		assert.equal(result.userId, created.id);
		assert.equal(result.email, created.email);
		assert.equal(result.studentId, 'MA-202610-000001');
		assert.equal(result.invitationSent, true);
		const enrolled = f.db.select().from(schema.enrollment).get();
		assert.equal(enrolled.id, result.enrollmentId);
		assert.equal(enrolled.curriculumId, 'active');
		assert.equal(enrolled.schoolYearStart, 2025);
		assert.equal(enrolled.section, 'B');
		assert.equal(enrolled.status, 'pending');
		assert.equal(f.db.select().from(schema.studentData).get().currentEnrollmentId, enrolled.id);
		assert.deepEqual(f.state.invitations, ['stored@example.com']);
		await assert.rejects(f.enrollStudent(input), { status: 409 });
		assert.equal(f.state.creations, 1);
	});
}
test('custom units are accepted; matching-term subjects use snapshots; other terms are extras', async (t) => {
	const f = fixture(t);
	await f.enrollStudent(input);
	const rows = f.db.select().from(schema.enrollmentSubject).all();
	assert.deepEqual(
		rows.map(
			({ subjectId, source, curriculumSubjectId, subjectCode, subjectName, units, addedBy }) => ({
				subjectId,
				source,
				curriculumSubjectId,
				subjectCode,
				subjectName,
				units,
				addedBy
			})
		),
		[
			{
				subjectId: 's1',
				source: 'curriculum',
				curriculumSubjectId: 'cs1',
				subjectCode: 'SNAP101',
				subjectName: 'Published subject',
				units: 6,
				addedBy: 'operator'
			},
			{
				subjectId: 's2',
				source: 'extra',
				curriculumSubjectId: null,
				subjectCode: 'LIVE102',
				subjectName: 'Other term subject',
				units: 2,
				addedBy: 'operator'
			},
			{
				subjectId: 's3',
				source: 'extra',
				curriculumSubjectId: null,
				subjectCode: 'EXTRA',
				subjectName: 'Extra subject',
				units: 5,
				addedBy: 'operator'
			}
		]
	);
});

test('custom units accept positive fractions and reject nonfinite numbers', async (t) => {
	const f = fixture(t);
	for (const units of [Infinity, NaN, -1]) {
		await assert.rejects(f.enrollStudent({ ...input, subjects: [{ id: 's1', units }] }));
	}
	assert.equal(f.state.creations, 0);
	await f.enrollStudent({ ...input, subjects: [{ id: 's1', units: 1.5 }] });
	assert.equal(f.db.select().from(schema.enrollmentSubject).get().units, 1.5);
});

test('subjects from either another semester or another year are extras', async (t) => {
	for (const placement of [
		{ yearLevel: 1, semester: 2 },
		{ yearLevel: 2, semester: 1 }
	]) {
		const f = fixture(t);
		f.db
			.update(schema.curriculumSubject)
			.set(placement)
			.where(require('drizzle-orm').eq(schema.curriculumSubject.id, 'cs2'))
			.run();
		await f.enrollStudent({ ...input, subjects: [{ id: 's2', units: 2 }] });
		const row = f.db.select().from(schema.enrollmentSubject).get();
		assert.equal(row.source, 'extra');
		assert.equal(row.curriculumSubjectId, null);
	}
});

test('an existing student record blocks duplicate enrollment before auth', async (t) => {
	const f = fixture(t);
	f.db
		.insert(schema.user)
		.values({ id: 'existing', name: 'Existing', email: 'existing@example.com' })
		.run();
	f.db
		.insert(schema.studentData)
		.values({ studentId: 'Existing', userId: 'existing', applicantId: input.applicantId })
		.run();
	await assert.rejects(f.enrollStudent(input), { status: 409 });
	assert.equal(f.state.creations, 0);
	assert.equal(f.db.select().from(schema.studentData).all().length, 1);
	assert.equal(f.record().userId, null);
});
for (const role of [Role.STUDENT, null]) {
	test(`rejects ${role ?? 'anonymous'} before creating an account`, async (t) => {
		const f = fixture(t, role);
		await assert.rejects(f.enrollStudent(input), { status: role ? 403 : 401 });
		assert.equal(f.state.creations, 0);
		assertNoEnrollment(f);
	});
}
test('missing applicant and incomplete documents retain 404/400 and create no account', async (t) => {
	const f = fixture(t);
	await assert.rejects(f.enrollStudent({ ...input, applicantId: 'missing' }), { status: 404 });
	for (const field of ['hasBirthCertificate', 'hasForm138', 'hasGoodMoral', 'hasPicture']) {
		f.db
			.update(schema.applicant)
			.set({ [field]: false })
			.run();
		await assert.rejects(f.enrollStudent(input), { status: 400 });
		f.db
			.update(schema.applicant)
			.set({ [field]: true })
			.run();
	}
	assert.equal(f.state.creations, 0);
	assertNoEnrollment(f);
});
test('rejects duplicates, nonexistent subjects and invalid curriculum limits before auth', async (t) => {
	const f = fixture(t);
	for (const change of [
		{ subjects: [input.subjects[0], input.subjects[0]] },
		{ subjects: [{ id: 'missing', units: 3 }] },
		{ yearLevel: 5 },
		{ semester: 3 }
	])
		await assert.rejects(f.enrollStudent({ ...input, ...change }), { status: 400 });
	assert.equal(f.state.creations, 0);
	assertNoEnrollment(f);
});
test('input requires applicant, explicit school year, positive units and at least one subject', async (t) => {
	const f = fixture(t);
	for (const change of [
		{ applicantId: '' },
		{ schoolYearStart: undefined },
		{ schoolYearStart: 0 },
		{ schoolYearStart: 2025.5 },
		{ subjects: [] },
		{ subjects: [{ id: 's1', units: 0 }] }
	])
		await assert.rejects(f.enrollStudent({ ...input, ...change }));
	await assert.rejects(f.enrollStudent({ name: 'Standalone', email: 'standalone@example.com' }));
	assert.equal(f.state.creations, 0);
	assertNoEnrollment(f);
});
test('inactive programs, no selected curriculum, drafts and archived selections are rejected', async (t) => {
	for (const [change, status] of [
		[{ isActive: false }, 400],
		[{ activeCurriculumId: null }, 404],
		[{ activeCurriculumId: 'draft' }, 409]
	]) {
		const f = fixture(t);
		f.db.update(schema.program).set(change).run();
		await assert.rejects(f.enrollStudent(input), { status });
		assert.equal(f.state.creations, 0);
		assertNoEnrollment(f);
	}
	const f = fixture(t);
	f.db.update(schema.curriculum).set({ archivedAt: new Date() }).run();
	await assert.rejects(f.enrollStudent(input), { status: 409 });
	assert.equal(f.state.creations, 0);
});
test('invalid stored identity is rejected before account creation', async (t) => {
	const f = fixture(t);
	f.db.update(schema.applicant).set({ email: 'invalid-email' }).run();
	await assert.rejects(f.enrollStudent(input), { status: 400 });
	assert.equal(f.state.creations, 0);
	assertNoEnrollment(f);
});
test('documents, identity and program changes during auth abort linking and clean only new account', async (t) => {
	for (const change of [
		{ hasPicture: false },
		{ name: 'Changed' },
		{ email: 'changed@example.com' },
		{ applicationId: 'CHANGED' },
		{ yearLevel: 2 }
	]) {
		const f = fixture(t);
		f.state.onCreate = () => f.db.update(schema.applicant).set(change).run();
		await assert.rejects(f.enrollStudent(input), { status: 409 });
		assertNoEnrollment(f);
	}
	const f = fixture(t);
	f.db.insert(schema.program).values({ id: 'other', code: 'ACT', name: 'Other program' }).run();
	f.state.onCreate = () => f.db.update(schema.applicant).set({ programCode: 'ACT' }).run();
	await assert.rejects(f.enrollStudent(input), { status: 409 });
	assertNoEnrollment(f);
});
test('active curriculum changing during auth rolls back all enrollment writes', async (t) => {
	const f = fixture(t);
	f.state.onCreate = () =>
		f.db.update(schema.program).set({ activeCurriculumId: 'replacement' }).run();
	await assert.rejects(f.enrollStudent(input), { status: 409 });
	assertNoEnrollment(f);
});
test('a competing link remains intact while the losing account is removed', async (t) => {
	const f = fixture(t);
	f.state.onCreate = () => {
		f.db
			.insert(schema.user)
			.values({ id: 'winner', name: 'Winner', email: 'winner@example.com' })
			.run();
		f.db.update(schema.applicant).set({ userId: 'winner' }).run();
	};
	await assert.rejects(f.enrollStudent(input), { status: 409 });
	assert.equal(f.record().userId, 'winner');
	assert.deepEqual(
		f.users().map((row) => row.id),
		['winner']
	);
	assert.deepEqual(f.db.select().from(schema.account).all(), []);
	assert.deepEqual(f.state.invitations, []);
});
test('concurrent requests create exactly one complete enrollment and one invitation', async (t) => {
	const f = fixture(t);
	const results = await Promise.allSettled([f.enrollStudent(input), f.enrollStudent(input)]);
	assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1);
	assert.equal(f.users().length, 1);
	assert.equal(f.db.select().from(schema.studentData).all().length, 1);
	assert.equal(f.db.select().from(schema.enrollment).all().length, 1);
	assert.equal(f.db.select().from(schema.enrollmentSubject).all().length, 3);
	assert.equal(f.state.invitations.length, 1);
});
for (const table of ['student', 'enrollment', 'enrollment_subject']) {
	test(`failed ${table} insert rolls back links and data and compensates auth account`, async (t) => {
		const f = fixture(t);
		t.mock.method(console, 'error', () => {});
		f.sqlite.exec(
			`CREATE TRIGGER reject_insert BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'test failure'); END;`
		);
		await assert.rejects(f.enrollStudent(input), { status: 500 });
		assertNoEnrollment(f);
	});
}
test('cleanup failure is observable and cannot erase unrelated accounts', async (t) => {
	const f = fixture(t);
	t.mock.method(console, 'error', () => {});
	f.sqlite.exec(
		"CREATE TRIGGER reject_insert BEFORE INSERT ON enrollment BEGIN SELECT RAISE(ABORT, 'test failure'); END; CREATE TRIGGER reject_cleanup BEFORE DELETE ON user BEGIN SELECT RAISE(ABORT, 'cleanup failure'); END;"
	);
	await assert.rejects(
		f.enrollStudent(input),
		(cause) => cause.status === 500 && cause.message.includes('could not be removed')
	);
	assert.equal(f.record().userId, null);
	assert.equal(f.users().length, 1);
	assert.equal(f.db.select().from(schema.enrollment).all().length, 0);
	assert.deepEqual(f.state.invitations, []);
});
test('duplicate email preserves existing account and applicant without invitation', async (t) => {
	const f = fixture(t);
	f.db
		.insert(schema.user)
		.values({ id: 'existing', name: 'Existing', email: 'stored@example.com' })
		.run();
	await assert.rejects(f.enrollStudent(input), { status: 400 });
	assert.deepEqual(
		f.users().map((row) => row.id),
		['existing']
	);
	assert.equal(f.record().userId, null);
	assert.deepEqual(f.state.invitations, []);
});
test('invitation failure keeps committed enrollment and returns full result for retry', async (t) => {
	const f = fixture(t);
	f.state.invitationFails = true;
	const result = await f.enrollStudent(input);
	assert.equal(result.success, true);
	assert.equal(result.invitationSent, false);
	assert.equal(result.email, 'stored@example.com');
	assert.equal(result.userId, f.users()[0].id);
	assert.equal(result.enrollmentId, f.db.select().from(schema.enrollment).get().id);
	assert.equal(f.record().userId, result.userId);
	await assert.rejects(f.enrollStudent(input), { status: 409 });
	f.state.invitationFails = false;
	await f.resendMagicLink({ email: result.email });
	assert.equal(f.state.invitations.length, 2);
});
test('registrar creation retains admin-only access and correct role', async (t) => {
	const admin = fixture(t, Role.ADMIN);
	const result = await admin.createRegistrar({
		name: 'New Registrar',
		email: 'registrar@example.com'
	});
	assert.equal(admin.users()[0].role, Role.REGISTRAR);
	assert.equal(result.invitationSent, true);
	assert.equal(result.userId, admin.users()[0].id);
	const registrar = fixture(t, Role.REGISTRAR);
	await assert.rejects(
		registrar.createRegistrar({ name: 'New Registrar', email: 'registrar@example.com' }),
		{ status: 403 }
	);
	assert.equal(registrar.state.creations, 0);
});
