import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { error, isHttpError, json } from '@sveltejs/kit';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(file, dependencies = {}, override) {
	const { outputText } = ts.transpileModule(override ?? readFileSync(file, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)(
		(id) =>
			dependencies[id] ??
			(id === '#lib/clearance/deadline.js' ? load('src/lib/clearance/deadline.ts') : undefined) ??
			(id === '#lib/clearance/ai.js' ? load('src/lib/clearance/ai.ts') : undefined) ??
			(id === '#lib/clearance/gemini.js' ? load('src/lib/clearance/gemini.ts') : require(id)),
		exports
	);
	return exports;
}
const core = load('src/lib/clearance/identity.ts');
const expected = { name: 'Jonnel Mrei Palileo', studentNumber: 'MA-23016578' };
const compare = (change = {}) => core.matchIdentity({ ...expected, ...change }, expected);
const status = (code) => (cause) => isHttpError(cause) && cause.status === code;

test('exact ID identifies record; spacing/case vary, but name conflicts require review', () => {
	assert.equal(compare().verdict, 'match');
	assert.equal(
		compare({ name: 'jonnel mrei palileo', studentNumber: 'ma 23016578' }).verdict,
		'match'
	);
	assert.equal(compare({ name: '' }).verdict, 'match');
	assert.equal(compare({ name: 'Maria Santos' }).verdict, 'review');
});

test('numeric suffix matches with absent, printed, handwritten or repeated MA prefix', () => {
	for (const studentNumber of [
		'23016578',
		'MA-23016578',
		'ma 23016578',
		'MA-MA-23016578',
		'MA- MA 23016578'
	]) {
		const result = compare({ studentNumber });
		assert.equal(result.studentNumber.status, 'exact', studentNumber);
		assert.equal(result.studentNumber.similarity, 100);
		assert.equal(result.studentNumber.detected, studentNumber);
		assert.equal(result.studentNumber.expected, expected.studentNumber);
		assert.equal(result.verdict, 'match');
	}
	assert.equal(
		core.matchIdentity(
			{ ...expected, studentNumber: 'MA-MA-02301657' },
			{ ...expected, studentNumber: 'MA-02301657' }
		).verdict,
		'match'
	);
	assert.equal(
		compare({ name: 'James Meet Pattison', studentNumber: '23016578' }).verdict,
		'review'
	);
});

test('one differing or uncertain digit requires review; missing digits and unknown prefixes are not discarded', () => {
	for (const studentNumber of ['MA-53016578', 'MA-2301657?', '53016578', 'MA-MA-53016578']) {
		const result = compare({ studentNumber });
		assert.equal(result.studentNumber.status, 'close', studentNumber);
		assert.equal(result.verdict, 'review');
	}
	assert.equal(compare({ studentNumber: 'MA-2301657' }).studentNumber.status, 'different');
	assert.equal(compare({ studentNumber: 'MB-23016578' }).studentNumber.status, 'different');
	assert.equal(compare({ studentNumber: 'MIA-23016578' }).studentNumber.status, 'different');
	assert.equal(compare({ studentNumber: '230MA16578' }).studentNumber.status, 'different');
	assert.equal(compare({ studentNumber: '23016O78' }).studentNumber.status, 'different');
	assert.equal(compare({ studentNumber: 'MA-53116578' }).studentNumber.status, 'different');
	const leadingZero = core.matchIdentity(
		{ name: '', studentNumber: 'MA-2301657' },
		{ name: '', studentNumber: 'MA-02301657' }
	);
	assert.equal(leadingZero.verdict, 'mismatch');
});

test('similar names support review only; blank and unrelated details cannot match', () => {
	assert.equal(compare({ name: 'Jonnel Mrei Palile', studentNumber: '' }).verdict, 'review');
	assert.equal(compare({ studentNumber: '' }).verdict, 'review');
	assert.equal(compare({ name: '', studentNumber: 'MA-' }).verdict, 'review');
	assert.equal(compare({ name: '?', studentNumber: '?' }).verdict, 'review');
	assert.equal(compare({ name: 'Maria Santos', studentNumber: 'MA-99999999' }).verdict, 'mismatch');
});

test('separated student numbers match all digits, and missing or extra digits explain their counts', () => {
	const record = { name: 'Example Student', studentNumber: 'MA-202610-00002' };
	for (const studentNumber of ['20261000002', 'MA-202610-00002', 'MA-MA-202610-00002']) {
		const result = core.matchIdentity({ ...record, studentNumber }, record);
		assert.equal(result.studentNumber.status, 'exact');
		assert.equal(result.verdict, 'match');
	}
	for (const [studentNumber, count, difference] of [
		['2026100002', 10, '1 digit missing'],
		['202610000002', 12, '1 extra digit']
	]) {
		const result = core.matchIdentity({ ...record, studentNumber }, record);
		assert.equal(result.studentNumber.status, 'different');
		assert.equal(result.verdict, 'review');
		assert.equal(result.studentNumber.detected, studentNumber);
		assert.equal(result.studentNumber.expected, record.studentNumber);
		assert.match(
			result.studentNumber.detail,
			new RegExp(`Read ${count} digits; student record has 11`)
		);
		assert(result.studentNumber.detail.includes(difference));
	}
});

const { Role } = load('src/lib/Roles.ts');
const schema = load('src/lib/schema.ts', {
	'#lib/Roles.js': { Role },
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
	'',
	{ '@sveltejs/kit': { error, isHttpError } },
	`import {error} from '@sveltejs/kit';\n${guard}`
);
const png =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=';
const crops = { name: png, studentNumber: png };
const locals = (role = 'student', id = 'other') => ({ user: { id, role }, session: {} });
function fixture(t, dev = true) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	sqlite.exec(`
	 INSERT INTO user(id,name,email,role,first_name,last_name) VALUES
	 ('jonnel','Jonnel Mrei Palileo','j@example.invalid','student','Jonnel','Palileo'),
	 ('other','Other Student','o@example.invalid','student','Other','Student');
	 INSERT INTO student(id,user_id,birth_date,sex) VALUES
	 ('MA-23016578','jonnel','2000-01-01','female'),('MA-99999999','other','2000-01-01','female');
	`);
	db.insert(schema.systemSettings).values({ id: 1, geminiApiKey: 'test-key' }).run();
	const handwriting = load('src/lib/server/handwriting.ts', {
		'$app/env/private': { GEMINI_API_KEY: 'test-key' },
		'./db': { db },
		'#lib/schema.js': schema,
		'./settings': load('src/lib/server/settings.ts', { '../schema': schema, './db': { db } }),
		'@sveltejs/kit': { error, isHttpError }
	});
	const service = load('src/routes/test/identity.server.ts', {
		'#lib/Roles.js': { Role },
		'#lib/schema.js': schema,
		'#lib/server/auth.js': { validateUser },
		'#lib/server/db/index.js': { db },
		'#lib/server/handwriting.js': handwriting,
		'@sveltejs/kit': { error, isHttpError }
	});
	const endpoint = load('src/routes/test/identity/+server.ts', {
		'$app/env': { dev },
		'../identity.server': service,
		'#lib/clearance/identity.js': core,
		'@sveltejs/kit': { error, json, isHttpError }
	}).POST;
	const page = load('src/routes/test/+page.server.ts', {
		'$app/env': { dev },
		'@sveltejs/kit': { error, isHttpError },
		'./identity.server': service,
		'#lib/server/clearance-template.js': { getClearanceTemplateInfo: () => null }
	}).load;
	return { service, endpoint, page, sqlite };
}
function event(viewer, body = crops, origin = 'http://localhost') {
	return {
		locals: viewer,
		url: new URL('http://localhost/test/identity'),
		request: new Request('http://localhost/test/identity', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: origin },
			body: JSON.stringify(body)
		})
	};
}
function mockTranscription(t, fn) {
	const original = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = original;
	});
	globalThis.fetch = fn;
}
function reply(name = '', studentNumber = '', finishReason = 'STOP') {
	return Response.json({
		candidates: [
			{ finishReason, content: { parts: [{ text: JSON.stringify({ name, studentNumber }) }] } }
		]
	});
}

test('production diagnostics reject every role before image processing or paid recognition', async (t) => {
	const f = fixture(t, false);
	let calls = 0;
	mockTranscription(t, async () => {
		calls++;
		return reply();
	});
	for (const viewer of [{}, locals(), locals('registrar', 'staff'), locals('admin', 'staff')]) {
		for (let attempt = 0; attempt < 3; attempt++) {
			await assert.rejects(f.endpoint(event(viewer)), status(404));
		}
		assert.throws(() => f.page({ locals: viewer, setHeaders: () => {} }), status(404));
	}
	assert.equal(calls, 0);
	// Blocking diagnostics must leave production recognition configured and its slot available.
	await f.service.recognizeIdentity(crops, new AbortController().signal);
	assert.equal(calls, 1);
});

test('session chooses own student; staff use fixed test record; anonymous access reveals no identity', async (t) => {
	const f = fixture(t);
	assert.deepEqual(f.service.getIdentityStudent(locals('student')), {
		name: 'Other Student',
		studentNumber: 'MA-99999999'
	});
	assert.deepEqual(f.service.getIdentityStudent(locals('admin', 'staff')), expected);
	assert.deepEqual(f.service.getIdentityStudent(locals('registrar', 'staff')), expected);
	assert.throws(() => f.service.getIdentityStudent({}), status(401));
	assert.throws(() => f.service.getIdentityStudent(locals('unknown')), status(403));
	const headers = [];
	assert.deepEqual(f.page({ locals: {}, setHeaders: (value) => headers.push(value) }), {
		savedTemplate: null,
		identityStudent: null,
		signedIn: false
	});
	assert.equal(headers[0]['Cache-Control'], 'private, no-store');
	await assert.rejects(f.endpoint(event({})), status(401));
	assert.equal((await f.endpoint(event(locals(), crops, 'http://other-site.invalid'))).status, 403);
});

test('crop request rejects extra expected values, malformed images and excessive body/dimensions', async (t) => {
	const { service } = fixture(t);
	assert.deepEqual(await service.readIdentityCrops(event(locals()).request), crops);
	for (const body of [
		{ ...crops, expected },
		{ ...crops, name: 'not-image' },
		{ ...crops, studentNumber: Buffer.from('not a PNG').toString('base64') }
	])
		await assert.rejects(service.readIdentityCrops(event(locals(), body).request), status(400));
	const hugePng = Buffer.from(png, 'base64');
	hugePng.writeUInt32BE(100_000, 16);
	await assert.rejects(
		service.readIdentityCrops(
			event(locals(), { ...crops, name: hugePng.toString('base64') }).request
		),
		status(400)
	);
	const huge = new Request('http://localhost', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: ' '.repeat(2 * 1024 * 1024 + 1)
	});
	await assert.rejects(service.readIdentityCrops(huge), status(413));
	const text = new Request('http://localhost', { method: 'POST', body: '{}' });
	await assert.rejects(service.readIdentityCrops(text), status(415));
});

test('Gemini receives two PNG crops and no expected identity; endpoint compares database record', async (t) => {
	const f = fixture(t),
		calls = [];
	const before = f.sqlite.prepare('SELECT total_changes() AS n').get().n;
	mockTranscription(t, async (url, options) => {
		assert.match(url, /generativelanguage.googleapis.com/);
		assert.equal(options.headers['x-goog-api-key'], 'test-key');
		assert(!options.body.includes('Jonnel'));
		assert(!options.body.includes('23016578'));
		const body = JSON.parse(options.body);
		assert.match(body.contents[0].parts[0].text, /only the numeric portion/);
		assert.match(body.contents[0].parts[0].text, /printed, handwritten, or repeated/);
		assert.match(body.contents[0].parts[0].text, /including leading zeros/);
		assert.match(
			body.contents[0].parts[0].text,
			/retaining visible hyphens or spaces between digit groups/
		);
		assert.match(body.contents[0].parts[0].text, /Do not collapse repeated zeros/);
		assert.equal(body.generationConfig.responseMimeType, 'application/json');
		assert.deepEqual(
			body.contents[0].parts.filter((p) => p.inlineData).map((p) => p.inlineData),
			[
				{ mimeType: 'image/png', data: png },
				{ mimeType: 'image/png', data: png }
			]
		);
		calls.push(body);
		return reply('Other Student', '99999999');
	});
	const response = await f.endpoint(event(locals()));
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('cache-control'), 'private, no-store');
	const result = await response.json();
	assert.equal(result.verdict, 'match');
	assert.equal(result.studentNumber.expected, 'MA-99999999');
	assert.equal(result.studentNumber.detected, '99999999');
	assert.equal(f.sqlite.prepare('SELECT total_changes() AS n').get().n, before);
	assert.equal(calls.length, 1);
});

test('grouped identifier transcription preserves zero runs through the provider parser and comparison', async (t) => {
	const f = fixture(t);
	mockTranscription(t, async () => reply('Example Student', '202610-00002'));
	const readings = await f.service.recognizeIdentity(crops, new AbortController().signal);
	assert.equal(readings.studentNumber, '202610-00002');
	assert.equal(
		core.matchIdentity(readings, { name: 'Example Student', studentNumber: 'MA-202610-00002' })
			.verdict,
		'match'
	);
});

test('unfinished, blocked and invalid Gemini output forces review and never accepts partial text', async (t) => {
	const { endpoint } = fixture(t);
	mockTranscription(t, async () => reply('Jonnel Mrei Palileo', 'MA-23016578', 'MAX_TOKENS'));
	let result = await (await endpoint(event(locals('admin', 'staff')))).json();
	assert.equal(result.verdict, 'review');
	assert.equal(result.studentNumber.detected, '');
	assert.match(result.warnings.name, /response limit/);
	for (const response of [
		Response.json({ candidates: [] }),
		Response.json({ candidates: [{ finishReason: 'SAFETY' }] }),
		Response.json({
			candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not JSON' }] } }]
		})
	]) {
		globalThis.fetch = async () => response;
		result = await (await endpoint(event(locals()))).json();
		assert.equal(result.verdict, 'review');
		assert.equal(Object.keys(result.warnings).length, 2);
	}
});

test('one invalid field preserves the other reading but still forces review', async (t) => {
	const { endpoint } = fixture(t);
	mockTranscription(t, async () => reply(123, 'MA-23016578'));
	const result = await (await endpoint(event(locals('admin', 'staff')))).json();
	assert.equal(result.verdict, 'review');
	assert.equal(result.studentNumber.detected, 'MA-23016578');
	assert.equal(result.name.detected, '');
	assert.match(result.warnings.name, /unusable transcription/);
});

test('provider and transport errors stay private and release the handwriting slot', async (t) => {
	const { service, endpoint } = fixture(t);
	mockTranscription(t, async () => {
		throw Error('Private provider details');
	});
	await assert.rejects(
		endpoint(event(locals())),
		(cause) =>
			cause.status === 503 &&
			cause.body.message.includes('DNS') &&
			!cause.body.message.includes('Private provider details')
	);
	globalThis.fetch = async () =>
		Response.json({ error: { message: 'private quota details' } }, { status: 429 });
	await assert.rejects(
		endpoint(event(locals())),
		(cause) => cause.status === 503 && !cause.body.message.includes('private quota details')
	);
	globalThis.fetch = async () => reply();
	assert.deepEqual(await service.recognizeIdentity(crops, new AbortController().signal), {
		name: '',
		studentNumber: ''
	});
});

test('concurrent inference is bounded; cancellation releases the handwriting slot', async (t) => {
	const { service } = fixture(t),
		abort = new AbortController();
	mockTranscription(
		t,
		(_url, { signal }) =>
			new Promise((_, reject) =>
				signal.addEventListener('abort', () => reject(signal.reason), { once: true })
			)
	);
	const active = service.recognizeIdentity(crops, abort.signal);
	await assert.rejects(service.recognizeIdentity(crops, new AbortController().signal), status(429));
	abort.abort();
	await assert.rejects(active);
	globalThis.fetch = async () => reply();
	await service.recognizeIdentity(crops, new AbortController().signal);
});

test('missing Gemini key fails closed before sending images', async (t) => {
	const service = load('src/lib/server/handwriting.ts', {
		'$app/env/private': {},
		'./db': {},
		'#lib/schema.js': schema,
		'./settings': { getSystemSettings: async () => ({ geminiApiKey: '' }) },
		'@sveltejs/kit': { error, isHttpError }
	});
	mockTranscription(t, async () => {
		assert.fail('No provider request without a key');
	});
	await assert.rejects(service.recognizeIdentity(crops, new AbortController().signal), status(503));
});

test('Gemini errors identify HTTP status and remediation while keeping provider secrets private', async (t) => {
	const { service } = fixture(t);
	const original = globalThis.fetch;
	t.after(() => (globalThis.fetch = original));
	const cases = [
		[
			400,
			{ status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] },
			/does not recognize/
		],
		[400, { status: 'FAILED_PRECONDITION' }, /billing.*region/],
		[402, { status: 'RESOURCE_EXHAUSTED' }, /credit balance/],
		[
			403,
			{ status: 'PERMISSION_DENIED', details: [{ reason: 'SERVICE_DISABLED' }] },
			/API is disabled/
		],
		[
			403,
			{ status: 'PERMISSION_DENIED', details: [{ reason: 'API_KEY_HTTP_REFERRER_BLOCKED' }] },
			/restrictions block/
		],
		[
			403,
			{ status: 'PERMISSION_DENIED', message: 'Your API key was reported as leaked.' },
			/Replace it with a new key/
		],
		[400, { status: 'INVALID_ARGUMENT', message: 'API key expired.' }, /key has expired/],
		[403, { status: 'PERMISSION_DENIED' }, /lacks permission/],
		[404, { status: 'NOT_FOUND' }, /model was not found/],
		[
			404,
			{
				status: 'NOT_FOUND',
				message: 'This model is no longer available to new users. PRIVATE_PROJECT'
			},
			/unavailable to new Gemini users\/projects/
		],
		[429, { status: 'RESOURCE_EXHAUSTED' }, /daily.*limit/],
		[500, { status: 'INTERNAL' }, /internal processing error/],
		[503, { status: 'UNAVAILABLE' }, /capacity pressure/],
		[504, { status: 'DEADLINE_EXCEEDED' }, /deadline/]
	];
	for (const [http, errorBody, expectedMessage] of cases) {
		globalThis.fetch = async () =>
			Response.json(
				{
					error: {
						message: 'PRIVATE_KEY_AND_STUDENT_DATA',
						...errorBody,
						details: errorBody.details?.map((d) => ({
							...d,
							metadata: { project: 'PRIVATE_PROJECT' }
						}))
					}
				},
				{ status: http }
			);
		await assert.rejects(
			service.recognizeIdentity(crops, new AbortController().signal),
			(cause) => {
				assert.equal(cause.status, 503);
				assert.match(cause.body.message, new RegExp('HTTP ' + http));
				assert.match(cause.body.message, expectedMessage);
				assert(!cause.body.message.includes('PRIVATE'));
				return true;
			}
		);
	}
	for (const payload of [
		'not JSON',
		JSON.stringify({ error: { status: 'PRIVATE_SECRET', message: 'PRIVATE_KEY' } })
	]) {
		globalThis.fetch = async () => new Response(payload, { status: 418 });
		await assert.rejects(
			service.recognizeIdentity(crops, new AbortController().signal),
			(cause) =>
				cause.status === 503 &&
				cause.body.message.includes('HTTP 418') &&
				!cause.body.message.includes('PRIVATE')
		);
	}
	globalThis.fetch = async () => {
		throw new DOMException('PRIVATE_TIMEOUT_DETAILS', 'TimeoutError');
	};
	await assert.rejects(
		service.recognizeIdentity(crops, new AbortController().signal),
		(cause) =>
			cause.status === 503 &&
			cause.body.message.includes('60 seconds') &&
			!cause.body.message.includes('PRIVATE')
	);
	globalThis.fetch = async () => reply();
	assert.deepEqual(await service.recognizeIdentity(crops, new AbortController().signal), {
		name: '',
		studentNumber: ''
	});
});

test('Gemini response-body stalls expire at 60 seconds and release the shared inference slot', async (t) => {
	const { service } = fixture(t);
	let entered;
	const bodyStarted = new Promise((resolve) => {
		entered = resolve;
	});
	mockTranscription(t, async () => ({
		ok: true,
		json: () => {
			entered();
			return new Promise(() => {});
		}
	}));
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const active = service.recognizeIdentity(crops, new AbortController().signal);
	await bodyStarted;
	const failed = assert.rejects(
		active,
		(cause) => cause.status === 503 && /within 60 seconds/.test(cause.body.message)
	);
	t.mock.timers.tick(60_000);
	await failed;
	globalThis.fetch = async () => reply('Example Student', '00123456');
	assert.deepEqual(await service.recognizeIdentity(crops, new AbortController().signal), {
		name: 'Example Student',
		studentNumber: '00123456'
	});
});
