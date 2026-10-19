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
	new Function('require', 'exports', outputText)((id) => dependencies[id] ?? require(id), exports);
	return exports;
}
const core = load('src/routes/test/identity.ts');
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

test('one digit, omitted printed prefix and uncertain characters suggest review, never approval', () => {
	for (const studentNumber of ['MA-53016578', '23016578', 'MA-2301657?', '53016578']) {
		const result = compare({ studentNumber });
		assert.equal(result.studentNumber.status, 'close', studentNumber);
		assert.equal(result.verdict, 'review');
	}
	assert.equal(compare({ studentNumber: 'MA-2301657' }).studentNumber.status, 'different');
	assert.equal(compare({ studentNumber: 'MB-23016578' }).studentNumber.status, 'different');
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
	{ '@sveltejs/kit': { error } },
	`import {error} from '@sveltejs/kit';\n${guard}`
);
const png =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=';
const crops = { name: png, studentNumber: png };
const locals = (role = 'student', id = 'other') => ({ user: { id, role }, session: {} });
function fixture(t) {
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
	const service = load('src/routes/test/identity.server.ts', {
		'#lib/Roles.js': { Role },
		'#lib/schema.js': schema,
		'#lib/server/auth.js': { validateUser },
		'#lib/server/db/index.js': { db },
		'$app/env/private': { OLLAMA_BASE_URL: 'http://ollama.invalid' },
		'@sveltejs/kit': { error }
	});
	const endpoint = load('src/routes/test/identity/+server.ts', {
		'../identity.server': service,
		'../identity': core,
		'@sveltejs/kit': { json, isHttpError }
	}).POST;
	const page = load('src/routes/test/+page.server.ts', {
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
function reply(transcription, done_reason = 'stop') {
	return Response.json({ message: { content: JSON.stringify({ transcription }) }, done_reason });
}

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

test('endpoint compares against database only; model sees crops and instructions, never expected identity', async (t) => {
	const f = fixture(t);
	const before = f.sqlite.prepare('SELECT total_changes() AS n').get().n;
	const calls = [];
	mockTranscription(t, async (_url, options) => {
		const body = JSON.parse(options.body);
		assert(!options.body.includes('Jonnel'));
		assert(!options.body.includes('23016578'));
		assert.equal(body.options.num_predict, 2048);
		assert.deepEqual(body.messages[1].images, [png]);
		calls.push(body);
		return reply(calls.length === 1 ? 'MA-99999999' : 'Other Student');
	});
	const response = await f.endpoint(event(locals()));
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('cache-control'), 'private, no-store');
	const result = await response.json();
	assert.equal(result.verdict, 'match');
	assert.equal(result.studentNumber.expected, 'MA-99999999');
	assert.equal(f.sqlite.prepare('SELECT total_changes() AS n').get().n, before);
	assert.equal(calls.length, 2);
});

test('name response limit preserves the readable number and forces review, even when number is exact', async (t) => {
	const { endpoint } = fixture(t);
	let calls = 0;
	mockTranscription(t, async () =>
		++calls === 1 ? reply('MA-23016578') : reply('Jonnel Mrei Palileo', 'length')
	);
	const response = await endpoint(event(locals('admin', 'staff')));
	assert.equal(response.status, 200);
	const result = await response.json();
	assert.equal(result.verdict, 'review');
	assert.equal(result.studentNumber.detected, 'MA-23016578');
	assert.equal(result.name.detected, '');
	assert.match(result.warnings.name, /response limit/);
	assert.equal(calls, 2);
});

test('invalid transcription does not discard another readable field; unfinished text never becomes evidence', async (t) => {
	const { endpoint } = fixture(t);
	let calls = 0;
	mockTranscription(t, async () =>
		++calls === 1
			? Response.json({ message: { content: 'not JSON' }, done_reason: 'stop' })
			: reply('Other Student')
	);
	let response = await endpoint(event(locals()));
	assert.equal(response.status, 200);
	let result = await response.json();
	assert.equal(result.verdict, 'review');
	assert.equal(result.studentNumber.detected, '');
	assert.equal(result.name.detected, 'Other Student');
	assert.match(result.warnings.studentNumber, /unusable transcription/);
	globalThis.fetch = async () => reply('MA-23016578', 'length');
	response = await endpoint(event(locals()));
	result = await response.json();
	assert.equal(response.status, 200);
	assert.equal(result.verdict, 'review');
	assert.equal(result.name.detected, '');
	assert.equal(result.studentNumber.detected, '');
	assert.equal(Object.keys(result.warnings).length, 2);
});

test('transport errors still report 502 without provider details and release the model slot', async (t) => {
	const { service, endpoint } = fixture(t);
	mockTranscription(t, async () => {
		throw new Error('Private provider details');
	});
	const response = await endpoint(event(locals()));
	assert.equal(response.status, 502);
	assert(!(await response.text()).includes('Private provider details'));
	globalThis.fetch = async () => reply('');
	assert.deepEqual(await service.recognizeIdentity(crops, new AbortController().signal), {
		name: '',
		studentNumber: ''
	});
});

test('concurrent inference is bounded and cancellation releases model slot', async (t) => {
	const { service } = fixture(t);
	const abort = new AbortController();
	mockTranscription(
		t,
		(_url, { signal }) =>
			new Promise((_, reject) => {
				signal.addEventListener('abort', () => reject(signal.reason), { once: true });
			})
	);
	const active = service.recognizeIdentity(crops, abort.signal);
	await assert.rejects(service.recognizeIdentity(crops, new AbortController().signal), status(429));
	abort.abort();
	await assert.rejects(active);
	globalThis.fetch = async () => reply('');
	await service.recognizeIdentity(crops, new AbortController().signal);
});
