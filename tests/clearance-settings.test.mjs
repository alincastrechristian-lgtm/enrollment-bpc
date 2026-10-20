import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as kit from '@sveltejs/kit';
import ts from 'typescript';
import sharp from 'sharp';
import { migrationConfigThrough } from './migration-config.mjs';

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
			(id === '#lib/clearance/gemini.js' ? load('src/lib/clearance/gemini.ts') : undefined) ??
			(['#lib/server/clearance-settings.js', './clearance-settings'].includes(id)
				? load('src/lib/server/clearance-settings.ts', { '#lib/schema.js': schema })
				: id === '@sveltejs/kit'
					? kit
					: require(id)),
		exports
	);
	return exports;
}
const roles = load('src/lib/Roles.ts');
const core = load('src/lib/clearance/clearance.ts');
const definitions = load('src/lib/clearance/definition.ts', { './clearance': core });
const schema = load('src/lib/schema.ts', {
	'#lib/Roles.js': roles,
	'./email': load('src/lib/email.ts')
});
const authGuard = ts
	.createSourceFile(
		'auth.ts',
		readFileSync('src/lib/server/auth.ts', 'utf8'),
		ts.ScriptTarget.Latest,
		true
	)
	.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'validateUser')
	.getText();
const { validateUser } = load('', {}, `import {error} from '@sveltejs/kit';\n${authGuard}`);
const hasStatus = (status) => (caught) => kit.isHttpError(caught) && caught.status === status;
const jpeg = readFileSync('static/clearance-reference.jpg');
const file = (name = 'clearance.jpg') => new File([jpeg], name, { type: 'image/jpeg' });

function fixture(t, through) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(
		db,
		through === undefined ? { migrationsFolder: 'drizzle' } : migrationConfigThrough(t, through)
	);
	sqlite.exec(
		"INSERT INTO user(id,name,email,role,first_name,last_name) VALUES ('admin','Admin','admin@example.invalid','admin','Admin','User'),('student','Student','s@example.invalid','student','Student','User')"
	);
	const objects = new Map(),
		calls = [];
	const state = {
		failPut: false,
		failDelete: false,
		onPut: null,
		viewer: { user: { id: 'admin', role: 'admin' }, session: {} }
	};
	const send = async (command) => {
		const { Key, Body } = command.input;
		calls.push(command);
		if (command.constructor.name === 'PutObjectCommand') {
			if (state.failPut) throw new Error('Private Garage credentials');
			objects.set(Key, Buffer.from(Body));
			if (state.onPut) state.onPut(Key);
		} else if (command.constructor.name === 'DeleteObjectCommand') {
			if (state.failDelete) throw new Error('Private Garage credentials');
			objects.delete(Key);
		}
		return {};
	};
	const files = {
		MAX_FILE_BYTES: 10 * 1024 * 1024,
		fileStorageConfigured: () => true,
		getGarageS3Client: () => ({ send }),
		safeUploadName: (name) => name.replace(/[/\\]/g, ''),
		downloadObject: async (key) =>
			new Response(objects.get(key), {
				headers: {
					'Content-Type': 'application/octet-stream',
					'Content-Disposition': 'attachment; filename="download"',
					'Cache-Control': 'private, no-store',
					'X-Content-Type-Options': 'nosniff'
				}
			})
	};
	const service = load('src/lib/server/clearance-template.ts', {
		'#lib/clearance/definition.js': definitions,
		'./db': { db },
		'#lib/schema.js': schema,
		'./garage': { GARAGE_BUCKET: 'bpc' },
		'./garage/files': files
	});
	const dependencies = {
		'#lib/server/settings.js': load('src/lib/server/settings.ts', {
			'../schema': schema,
			'./db': { db }
		}),
		'#lib/server/handwriting.js': load('src/lib/server/handwriting.ts', {
			'$app/env/private': { GEMINI_API_KEY: 'legacy-test-key' },
			'./db': { db },
			'#lib/schema.js': schema,
			'./settings': load('src/lib/server/settings.ts', { '../schema': schema, './db': { db } })
		}),
		'#lib/server/db/index.js': { db },
		'#lib/schema.js': schema,
		'#lib/clearance/clearance.js': core,
		'#lib/server/clearance-workflow.js': {},
		'#lib/server/clearance-upload.js': {},
		'#lib/clearance/definition.js': definitions,
		'#lib/Roles.js': roles,
		'#lib/server/auth.js': { validateUser },
		'#lib/server/clearance-template.js': service,
		'#lib/server/garage/files.js': files,
		'$app/server': {
			getRequestEvent: () => ({ locals: state.viewer, request: new Request('http://localhost') }),
			query: (handler) => () => {
				const result = Promise.resolve(handler());
				return Object.assign(result, {
					refresh: async () => {
						await result;
					}
				});
			},
			form: (validator, handler) => (data) => handler(validator.parse(data)),
			command: (validator, handler) => (data) => handler(validator.parse(data))
		}
	};
	return {
		sqlite,
		db,
		objects,
		calls,
		state,
		service,
		remote: load('src/lib/actions/clearance.remote.ts', dependencies),
		page: load('src/routes/user/settings/clearance/+page.server.ts', dependencies).load,
		emailPage: load('src/routes/user/settings/email/+page.server.ts', dependencies).load,
		image: load('src/routes/user/clearance-template/+server.ts', dependencies).GET
	};
}

test('upload stores private image in Garage, saves safe metadata and serves authenticated preview', async (t) => {
	const f = fixture(t);
	assert.equal(f.service.getClearanceTemplateInfo(), null);
	await f.remote.uploadClearanceTemplate({ file: file(), revision: '' });
	const saved = f.service.getClearanceTemplate();
	assert.match(saved.objectKey, /^clearance-templates\/[\da-f-]+\/clearance.jpg$/);
	assert.equal(saved.uploadedBy, 'admin');
	assert.deepEqual(f.objects.get(saved.objectKey), jpeg);
	assert.equal(f.calls[0].input.Bucket, 'bpc');
	assert.equal(f.calls[0].input.ContentType, 'image/jpeg');
	const info = f.service.getClearanceTemplateInfo();
	assert.equal(info.filename, 'clearance.jpg');
	assert(!('objectKey' in info));
	assert(!('uploadedBy' in info));
	const response = await f.image({
		locals: { user: { id: 'student', role: 'student' }, session: {} },
		request: new Request('http://localhost')
	});
	assert.equal(response.headers.get('content-type'), 'image/jpeg');
	assert.match(response.headers.get('content-disposition'), /^inline/);
	assert.equal(response.headers.get('cache-control'), 'private, no-store');
	assert.deepEqual(Buffer.from(await response.arrayBuffer()), jpeg);
	assert.deepEqual(f.sqlite.pragma('foreign_key_check'), []);
});

function definition() {
	return {
		corners: structuredClone(core.UNIT_CORNERS),
		areas: ['text', 'text', 'image', 'semester', 'academicYear'].map((kind, i) => ({
			id: crypto.randomUUID(),
			kind,
			label: `Area ${i}`,
			expected: kind === 'text' ? 'School or form title' : '',
			box: { x: 0.1, y: 0.1 + i * 0.1, width: 0.6, height: 0.06 }
		}))
	};
}

test('area setup is admin-only, revision checked, survives reload and resets on image replacement', async (t) => {
	const f = fixture(t);
	await f.remote.uploadClearanceTemplate({ file: file(), revision: '' });
	const original = f.service.getClearanceTemplate();
	const config = definition();
	for (const role of ['student', 'registrar']) {
		f.state.viewer = { user: { id: 'student', role }, session: {} };
		await assert.rejects(
			f.remote.saveClearanceAreas({ revision: original.revision, definition: config }),
			hasStatus(403)
		);
	}
	f.state.viewer = {};
	await assert.rejects(
		f.remote.saveClearanceAreas({ revision: original.revision, definition: config }),
		hasStatus(401)
	);
	f.state.viewer = { user: { id: 'admin', role: 'admin' }, session: {} };
	const saved = await f.remote.saveClearanceAreas({
		revision: original.revision,
		definition: config
	});
	assert.notEqual(saved.revision, original.revision);
	assert.deepEqual(f.service.getClearanceTemplateInfo().definition, config);
	assert.equal(f.service.getClearanceTemplate().objectKey, original.objectKey);
	assert.equal(
		f.calls.length,
		1,
		'Saving area metadata must not reupload or delete the reference.'
	);
	await assert.rejects(
		f.remote.saveClearanceAreas({ revision: original.revision, definition: config }),
		hasStatus(409)
	);
	await assert.rejects(
		f.service.getClearanceTemplateImage(undefined, original.revision),
		hasStatus(409)
	);
	assert.throws(
		() => f.service.saveClearanceDefinition(saved.revision, { ...config, areas: [] }),
		hasStatus(400)
	);
	assert.deepEqual(f.service.getClearanceTemplateInfo().definition, config);
	await f.remote.uploadClearanceTemplate({
		file: file('replacement.jpg'),
		revision: saved.revision
	});
	assert.equal(f.service.getClearanceTemplateInfo().definition, null);
});

test('non-admins cannot load settings, query metadata or call upload; anonymous cannot fetch image', async (t) => {
	const f = fixture(t);
	for (const role of ['student', 'registrar', 'unknown']) {
		const viewer = { user: { id: 'student', role }, session: {} };
		f.state.viewer = viewer;
		assert.throws(() => f.page({ locals: viewer, setHeaders() {} }), hasStatus(403));
		await assert.rejects(f.remote.getClearanceSettings(), hasStatus(403));
		await assert.rejects(
			f.remote.uploadClearanceTemplate({ file: file(), revision: '' }),
			hasStatus(403)
		);
	}
	f.state.viewer = {};
	await assert.rejects(
		f.remote.uploadClearanceTemplate({ file: file(), revision: '' }),
		hasStatus(401)
	);
	await assert.rejects(
		f.image({ locals: {}, request: new Request('http://localhost') }),
		hasStatus(401)
	);
	assert.equal(f.calls.length, 0);
});

test('personal input boxes persist with the definition, survive older saves, validate strictly and reset with the image', async (t) => {
	const f = fixture(t);
	await f.remote.uploadClearanceTemplate({ file: file(), revision: '' });
	const config = {
		...definition(),
		personalFields: ['studentName', 'studentNumber', 'courseYearSection'].map((field, i) => ({
			id: crypto.randomUUID(),
			field,
			box: { x: 0.2, y: 0.65 + i * 0.08, width: 0.5, height: 0.06 }
		}))
	};
	let saved = await f.remote.saveClearanceAreas({
		revision: f.service.getClearanceTemplateInfo().revision,
		definition: config
	});
	assert.deepEqual(
		f.service.getClearanceTemplateInfo().definition.personalFields,
		config.personalFields
	);
	const objects = f.calls.length;
	saved = await f.remote.saveClearanceAreas({ revision: saved.revision, definition: definition() });
	assert.deepEqual(
		f.service.getClearanceTemplateInfo().definition.personalFields,
		config.personalFields,
		'Omission by an older client must preserve personal boxes.'
	);
	await assert.rejects(async () =>
		f.remote.saveClearanceAreas({
			revision: saved.revision,
			definition: {
				...config,
				personalFields: [{ ...config.personalFields[0], studentName: 'Private student value' }]
			}
		})
	);
	assert.equal(f.service.getClearanceTemplateInfo().revision, saved.revision);
	saved = await f.remote.saveClearanceAreas({
		revision: saved.revision,
		definition: { ...config, personalFields: [] }
	});
	assert.deepEqual(f.service.getClearanceTemplateInfo().definition.personalFields, []);
	assert.equal(
		f.calls.length,
		objects,
		'Metadata saves must not upload or delete reference objects.'
	);
	saved = await f.remote.saveClearanceAreas({ revision: saved.revision, definition: config });
	await f.remote.uploadClearanceTemplate({
		file: file('replacement.jpg'),
		revision: saved.revision
	});
	assert.equal(f.service.getClearanceTemplateInfo().definition, null);
});

test('office rows round-trip, survive older clients, clear explicitly, reject invalid or stale saves and reset with replacement', async (t) => {
	const f = fixture(t);
	await f.remote.uploadClearanceTemplate({ file: file(), revision: '' });
	const box = { x: 0.1, y: 0.3, width: 0.08, height: 0.04 };
	const config = {
		...definition(),
		officeRows: [
			{
				id: crypto.randomUUID(),
				label: 'Library',
				office: box,
				cleared: { ...box, x: 0.3 },
				signature: { ...box, x: 0.6, width: 0.25 }
			}
		]
	};
	const oldRevision = f.service.getClearanceTemplateInfo().revision;
	let saved = await f.remote.saveClearanceAreas({ revision: oldRevision, definition: config });
	assert.deepEqual(f.service.getClearanceTemplateInfo().definition.officeRows, config.officeRows);
	const objectKey = f.service.getClearanceTemplate().objectKey,
		objects = f.calls.length;
	saved = await f.remote.saveClearanceAreas({ revision: saved.revision, definition: definition() });
	assert.deepEqual(f.service.getClearanceTemplateInfo().definition.officeRows, config.officeRows);
	await assert.rejects(
		f.remote.saveClearanceAreas({
			revision: oldRevision,
			definition: { ...config, officeRows: [] }
		}),
		hasStatus(409)
	);
	await assert.rejects(async () =>
		f.remote.saveClearanceAreas({
			revision: saved.revision,
			definition: {
				...config,
				officeRows: [{ ...config.officeRows[0], signature: { ...box, x: 0.99 } }]
			}
		})
	);
	assert.equal(f.service.getClearanceTemplateInfo().revision, saved.revision);
	for (const role of ['student', 'registrar']) {
		f.state.viewer = { user: { id: 'student', role }, session: {} };
		await assert.rejects(
			f.remote.saveClearanceAreas({ revision: saved.revision, definition: config }),
			hasStatus(403)
		);
	}
	f.state.viewer = { user: { id: 'admin', role: 'admin' }, session: {} };
	saved = await f.remote.saveClearanceAreas({
		revision: saved.revision,
		definition: { ...config, officeRows: [] }
	});
	assert.deepEqual(f.service.getClearanceTemplateInfo().definition.officeRows, []);
	assert.equal(f.service.getClearanceTemplate().objectKey, objectKey);
	assert.equal(f.calls.length, objects, 'Office setup does not change Garage objects.');
	saved = await f.remote.saveClearanceAreas({ revision: saved.revision, definition: config });
	await f.remote.uploadClearanceTemplate({
		file: file('replacement.jpg'),
		revision: saved.revision
	});
	assert.equal(f.service.getClearanceTemplateInfo().definition, null);
});

test('replacement updates pointer only after upload; upload failures preserve current record and object', async (t) => {
	const f = fixture(t);
	await f.service.saveClearanceTemplate(file(), '', 'admin');
	const previous = f.service.getClearanceTemplate();
	f.state.failPut = true;
	await assert.rejects(
		f.service.saveClearanceTemplate(file('replacement.jpg'), previous.revision, 'admin')
	);
	assert.equal(f.service.getClearanceTemplate().objectKey, previous.objectKey);
	assert(f.objects.has(previous.objectKey));
	f.state.failPut = false;
	await f.service.saveClearanceTemplate(file('replacement.jpg'), previous.revision, 'admin');
	assert.equal(f.service.getClearanceTemplateInfo().filename, 'replacement.jpg');
	assert(!f.objects.has(previous.objectKey));
	assert.equal(f.objects.size, 1);
});

test('stale replacement cannot overwrite another admin; failed database save cleans staged file', async (t) => {
	const f = fixture(t);
	await f.service.saveClearanceTemplate(file(), '', 'admin');
	const previous = f.service.getClearanceTemplate();
	const count = f.calls.length;
	await assert.rejects(f.service.saveClearanceTemplate(file(), '', 'admin'), hasStatus(409));
	assert.equal(f.calls.length, count);
	f.state.onPut = () => {
		f.sqlite.prepare("UPDATE clearance_template SET revision='another-admin' WHERE id=1").run();
	};
	await assert.rejects(
		f.service.saveClearanceTemplate(file('staged.jpg'), previous.revision, 'admin'),
		hasStatus(409)
	);
	assert.equal(f.service.getClearanceTemplate().revision, 'another-admin');
	assert.equal(f.objects.size, 1);
	assert(f.objects.has(previous.objectKey));
});

test('invalid file types, spoofed contents and oversized images cannot change stored reference', async (t) => {
	const f = fixture(t);
	for (const invalid of [
		new File(['<svg/>'], 'template.svg', { type: 'image/svg+xml' }),
		new File(['<script>malicious()</script>'], 'fake.png', { type: 'image/png' }),
		new File([], 'empty.jpg', { type: 'image/jpeg' })
	])
		await assert.rejects(f.service.saveClearanceTemplate(invalid, '', 'admin'), hasStatus(400));
	await assert.rejects(
		f.service.saveClearanceTemplate(
			new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' }),
			'',
			'admin'
		),
		hasStatus(413)
	);
	assert.equal(f.calls.length, 0);
	assert.equal(f.service.getClearanceTemplateInfo(), null);
});

test('old-object cleanup failure reports warning while new template remains usable', async (t) => {
	const f = fixture(t);
	t.mock.method(console, 'error', () => {});
	await f.service.saveClearanceTemplate(file(), '', 'admin');
	f.state.failDelete = true;
	const result = await f.service.saveClearanceTemplate(
		file('new.jpg'),
		f.service.getClearanceTemplate().revision,
		'admin'
	);
	assert.equal(result.cleanupWarning, true);
	assert.equal(f.service.getClearanceTemplateInfo().filename, 'new.jpg');
	assert.equal((await f.service.getClearanceTemplateImage()).status, 200);
});

test('additive migration preserves existing accounts and singleton constraint', (t) => {
	const f = fixture(t);
	assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM user').get().n, 2);
	assert.throws(
		() =>
			f.sqlite
				.prepare(
					"INSERT INTO clearance_template(id,revision,object_key,filename,content_type,size,uploaded_at) VALUES(2,'r','k','x','image/jpeg',5,1)"
				)
				.run(),
		/CHECK/
	);
	f.sqlite.exec('DROP TABLE clearance_template');
	assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM user').get().n, 2);
});

test('legacy saved term values are ignored without rewriting existing data; next save stores layout only', async (t) => {
	const f = fixture(t);
	await f.remote.uploadClearanceTemplate({ file: file(), revision: '' });
	const layout = definition();
	const legacy = { ...layout, semester: '1', schoolYear: '2023-2024' };
	f.db.update(schema.clearanceTemplate).set({ definition: legacy }).run();
	const before = f.service.getClearanceTemplate();
	assert.deepEqual(f.service.getClearanceTemplateInfo().definition, layout);
	assert.deepEqual(f.service.getClearanceTemplate().definition, legacy);
	const saved = await f.remote.saveClearanceAreas({
		revision: before.revision,
		definition: legacy
	});
	assert.deepEqual(f.service.getClearanceTemplateInfo().definition, layout);
	assert(!('semester' in f.service.getClearanceTemplate().definition));
	assert(!('schoolYear' in f.service.getClearanceTemplate().definition));
	assert.equal(f.service.getClearanceTemplate().objectKey, before.objectKey);
	assert.notEqual(saved.revision, before.revision);
});

const settingInput = (values = {}) => ({
	automatedClearanceVerificationEnabled: true,
	personalInfoVerificationEnabled: true,
	...values
});
test('admin settings import legacy key once, never expose it, preserve blank input, and respect explicit removal', async (t) => {
	const f = fixture(t);
	let settings = await f.remote.getClearanceSettings();
	assert.equal(settings.hasGeminiKey, true);
	assert.equal(settings.automatedClearanceVerificationEnabled, true);
	assert(!JSON.stringify(settings).includes('legacy-test-key'));
	await f.remote.saveClearanceVerification(settingInput({ geminiApiKey: 'new-secret-key' }));
	await f.remote.saveClearanceVerification(settingInput({ geminiApiKey: '' }));
	assert.equal(f.db.select().from(schema.systemSettings).get().geminiApiKey, 'new-secret-key');
	await assert.rejects(
		f.remote.saveClearanceVerification(settingInput({ clearGeminiKey: true })),
		hasStatus(400)
	);
	await f.remote.saveClearanceVerification(
		settingInput({ clearGeminiKey: true, personalInfoVerificationEnabled: false })
	);
	settings = await f.remote.getClearanceSettings();
	assert.equal(settings.hasGeminiKey, false);
	assert.equal(f.db.select().from(schema.systemSettings).get().geminiApiKey, '');
	await assert.rejects(f.remote.testClearanceAi({}), hasStatus(400));
	for (const role of ['student', 'registrar']) {
		f.state.viewer = { user: { id: 'student', role }, session: {} };
		await assert.rejects(f.remote.saveClearanceVerification(settingInput()), hasStatus(403));
		await assert.rejects(f.remote.testClearanceAi({ geminiApiKey: 'bad' }), hasStatus(403));
	}
});
test('Gemini test uses unsaved or saved key, sends blank PNG samples, and keeps provider errors private', async (t) => {
	const f = fixture(t);
	const original = globalThis.fetch;
	t.after(() => (globalThis.fetch = original));
	await f.remote.getClearanceSettings();
	const calls = [];
	globalThis.fetch = async (url, input) => {
		calls.push({ url, input });
		return Response.json({
			candidates: [
				{
					finishReason: 'STOP',
					content: { parts: [{ text: JSON.stringify({ name: '', studentNumber: '' }) }] }
				}
			]
		});
	};
	assert.equal((await f.remote.testClearanceAi({ geminiApiKey: 'unsaved-key' })).success, true);
	assert.equal(calls[0].input.headers['x-goog-api-key'], 'unsaved-key');
	assert.equal(f.db.select().from(schema.systemSettings).get().geminiApiKey, 'legacy-test-key');
	const parts = JSON.parse(calls[0].input.body).contents[0].parts;
	assert.equal(parts.filter((p) => p.inlineData?.mimeType === 'image/png').length, 2);
	assert(!JSON.stringify(parts).includes('Student User'));
	assert.equal((await f.remote.testClearanceAi({})).success, true);
	assert.equal(calls[1].input.headers['x-goog-api-key'], 'legacy-test-key');
	globalThis.fetch = async () =>
		Response.json({ error: { message: 'PRIVATE KEY DETAILS' } }, { status: 403 });
	const failed = await f.remote.testClearanceAi({});
	assert.equal(failed.success, false);
	assert.match(failed.message, /HTTP 403.*lacks permission/);
	assert(!failed.message.includes('PRIVATE'));
	globalThis.fetch = async () => {
		throw Error('PRIVATE connectivity details');
	};
	assert(!JSON.stringify(await f.remote.testClearanceAi({})).includes('PRIVATE'));
});
test('0040 preserves legacy data and defaults; rollback rejects credentials and paper approval evidence', async (t) => {
	const f = fixture(t, 40);
	const rollback = readFileSync(
		'drizzle/rollback/0040_clearance_verification_settings.sql',
		'utf8'
	);
	f.sqlite.exec(rollback);
	f.sqlite.exec('INSERT INTO system_settings(id,seeded) VALUES (1,1)');
	const before = f.sqlite.prepare('SELECT * FROM system_settings').get();
	migrate(f.db, migrationConfigThrough(t, 40));
	const after = f.sqlite.prepare('SELECT * FROM system_settings').get();
	for (const [key, value] of Object.entries(before)) assert.equal(after[key], value);
	assert.equal(after.automated_clearance_verification_enabled, 1);
	assert.equal(after.personal_info_verification_enabled, 1);
	assert.equal(after.gemini_api_key, null);
	f.sqlite.exec("UPDATE system_settings SET gemini_api_key='saved-key'");
	assert.throws(() => f.sqlite.exec(rollback), /CHECK constraint/);
	f.sqlite.exec('ROLLBACK');
	assert.equal(
		f.sqlite.prepare('SELECT gemini_api_key FROM system_settings').get().gemini_api_key,
		'saved-key'
	);
	f.sqlite.exec('UPDATE system_settings SET gemini_api_key=NULL');
	f.sqlite.exec(rollback);
	assert.deepEqual(f.sqlite.prepare('SELECT * FROM system_settings').get(), before);
	migrate(f.db, { migrationsFolder: 'drizzle' });
	assert.deepEqual(f.sqlite.pragma('foreign_key_check'), []);
});

test('email settings cannot expose saved Gemini credentials', async (t) => {
	const f = fixture(t);
	await f.remote.getClearanceSettings();
	const response = await f.emailPage({ locals: f.state.viewer });
	assert(!JSON.stringify(response).includes('legacy-test-key'));
	assert(!Object.hasOwn(response.settings, 'geminiApiKey'));
});

async function handwritingFixture(t) {
	const f = fixture(t);
	await f.remote.uploadClearanceTemplate({ file: file(), revision: '' });
	const config = {
		...definition(),
		personalFields: ['studentName', 'studentNumber'].map((field, i) => ({
			id: crypto.randomUUID(),
			field,
			box: { x: 0.1, y: 0.65 + i * 0.1, width: 0.6, height: 0.05 }
		}))
	};
	f.service.saveClearanceDefinition(f.service.getClearanceTemplate().revision, config);
	const png = (
		await sharp({ create: { width: 240, height: 80, channels: 3, background: '#fff' } })
			.png()
			.toBuffer()
	).toString('base64');
	return {
		...f,
		input: {
			revision: f.service.getClearanceTemplate().revision,
			crops: { name: png, studentNumber: png }
		}
	};
}
test('admin sample returns Gemini transcription and warnings without matching identity, saving, or approving', async (t) => {
	const f = await handwritingFixture(t);
	f.db
		.update(schema.systemSettings)
		.set({ personalInfoVerificationEnabled: false, automatedClearanceVerificationEnabled: false })
		.run();
	const before = f.sqlite.prepare('SELECT total_changes() AS n').get().n;
	const fetchBefore = globalThis.fetch;
	t.after(() => (globalThis.fetch = fetchBefore));
	const calls = [];
	globalThis.fetch = async (url, input) => {
		calls.push(JSON.parse(input.body));
		return Response.json({
			candidates: [
				{
					finishReason: 'STOP',
					content: {
						parts: [
							{ text: JSON.stringify({ name: 'Jonnel Mrei Palileo', studentNumber: '23016578' }) }
						]
					}
				}
			]
		});
	};
	assert.deepEqual(await f.remote.readClearanceTestHandwriting(f.input), {
		success: true,
		readings: {
			name: 'Jonnel Mrei Palileo',
			studentNumber: '23016578'
		}
	});
	assert.equal(f.sqlite.prepare('SELECT total_changes() AS n').get().n, before);
	assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM clearance_submission').get().n, 0);
	assert.equal(calls[0].contents[0].parts.filter((p) => p.inlineData).length, 2);
	assert(!JSON.stringify(calls[0]).includes('Student User'));
	globalThis.fetch = async () => Response.json({ candidates: [{ finishReason: 'MAX_TOKENS' }] });
	const unreadable = await f.remote.readClearanceTestHandwriting(f.input);
	assert.equal(unreadable.readings.name, '');
	assert.match(unreadable.readings.warnings.name, /response limit/);
	globalThis.fetch = async () => {
		throw Error('PRIVATE network details');
	};
	const networkFailure = await f.remote.readClearanceTestHandwriting(f.input);
	assert.equal(networkFailure.success, false);
	assert.match(networkFailure.message, /DNS/);
	assert(!networkFailure.message.includes('PRIVATE'));
	globalThis.fetch = async () =>
		Response.json({ error: { status: 'NOT_FOUND', message: 'PRIVATE_PROJECT' } }, { status: 404 });
	const modelFailure = await f.remote.readClearanceTestHandwriting(f.input);
	assert.equal(modelFailure.success, false);
	assert.match(modelFailure.message, /HTTP 404.*model was not found/);
	assert(!modelFailure.message.includes('PRIVATE'));
});
test('handwriting preview rejects wrong roles, stale templates, missing areas and invalid or oversized PNGs before Gemini', async (t) => {
	const f = await handwritingFixture(t);
	const fetchBefore = globalThis.fetch;
	t.after(() => (globalThis.fetch = fetchBefore));
	globalThis.fetch = async () => assert.fail('Invalid sample must not reach Gemini');
	for (const role of ['registrar', 'student']) {
		f.state.viewer = { user: { id: 'student', role }, session: {} };
		await assert.rejects(f.remote.readClearanceTestHandwriting(f.input), hasStatus(403));
	}
	f.state.viewer = { user: { id: 'admin', role: 'admin' }, session: {} };
	await assert.rejects(
		f.remote.readClearanceTestHandwriting({ ...f.input, revision: crypto.randomUUID() }),
		hasStatus(409)
	);
	const oversized = (
		await sharp({ create: { width: 2500, height: 10, channels: 3, background: '#fff' } })
			.png()
			.toBuffer()
	).toString('base64');
	for (const name of ['bm90LWFuLWltYWdl', jpeg.toString('base64'), oversized]) {
		await assert.rejects(
			f.remote.readClearanceTestHandwriting({ ...f.input, crops: { ...f.input.crops, name } }),
			hasStatus(400)
		);
	}
	f.service.saveClearanceDefinition(f.input.revision, { ...definition(), personalFields: [] });
	await assert.rejects(
		f.remote.readClearanceTestHandwriting({
			...f.input,
			revision: f.service.getClearanceTemplate().revision
		}),
		hasStatus(400)
	);
});

test('model selection persists for production while test overrides stay unsaved and restricted to admins', async (t) => {
	const f = await handwritingFixture(t);
	assert.equal((await f.remote.getClearanceSettings()).geminiModel, 'gemini-3.1-flash-lite');
	const original = globalThis.fetch;
	t.after(() => (globalThis.fetch = original));
	const calls = [];
	globalThis.fetch = async (url, input) => {
		calls.push({ url, config: JSON.parse(input.body).generationConfig });
		return Response.json({
			candidates: [
				{
					finishReason: 'STOP',
					content: { parts: [{ text: JSON.stringify({ name: '', studentNumber: '' }) }] }
				}
			]
		});
	};
	await f.remote.testClearanceAi({ geminiModel: 'gemini-2.5-flash-lite' });
	assert.match(calls.at(-1).url, /models\/gemini-2.5-flash-lite:generateContent$/);
	assert.deepEqual(calls.at(-1).config.thinkingConfig, { thinkingBudget: 0 });
	assert.equal((await f.remote.getClearanceSettings()).geminiModel, 'gemini-3.1-flash-lite');
	await f.remote.saveClearanceVerification(settingInput({ geminiModel: 'gemini-3.5-flash-lite' }));
	assert.equal((await f.remote.getClearanceSettings()).geminiModel, 'gemini-3.5-flash-lite');
	await f.remote.readClearanceTestHandwriting(f.input);
	assert.match(calls.at(-1).url, /models\/gemini-3.5-flash-lite:generateContent$/);
	assert.deepEqual(calls.at(-1).config.thinkingConfig, { thinkingLevel: 'minimal' });
	// Older settings clients must not reset the chosen model when omitting the field.
	await f.remote.saveClearanceVerification(settingInput());
	assert.equal((await f.remote.getClearanceSettings()).geminiModel, 'gemini-3.5-flash-lite');
	assert.throws(() =>
		f.remote.saveClearanceVerification(settingInput({ geminiModel: 'https://other.invalid' }))
	);
	assert.throws(() => f.remote.testClearanceAi({ geminiModel: 'not-allowed' }));
	for (const role of ['student', 'registrar']) {
		f.state.viewer = { user: { id: 'student', role }, session: {} };
		await assert.rejects(
			f.remote.saveClearanceVerification(settingInput({ geminiModel: 'gemini-3.8-flash' })),
			hasStatus(403)
		);
		await assert.rejects(
			f.remote.testClearanceAi({ geminiModel: 'gemini-3.8-flash' }),
			hasStatus(403)
		);
	}
});
test('0041 preserves keys and flags, defaults to low-cost model, and guards rollback of model choices', (t) => {
	const f = fixture(t, 41);
	const rollback = readFileSync('drizzle/rollback/0041_gemini_model_selection.sql', 'utf8');
	f.sqlite.exec(
		"INSERT INTO system_settings(id,gemini_api_key,personal_info_verification_enabled) VALUES(1,'private-saved-key',0)"
	);
	const before = f.sqlite.prepare('SELECT * FROM system_settings').get();
	f.sqlite.exec(rollback);
	assert.equal(
		f.sqlite.prepare('SELECT gemini_api_key FROM system_settings').get().gemini_api_key,
		'private-saved-key'
	);
	migrate(f.db, migrationConfigThrough(t, 41));
	assert.deepEqual(f.sqlite.prepare('SELECT * FROM system_settings').get(), before);
	assert.equal(before.gemini_model, 'gemini-3.1-flash-lite');
	f.sqlite.exec("UPDATE system_settings SET gemini_model='gemini-3.8-flash'");
	assert.throws(() => f.sqlite.exec(rollback), /CHECK constraint/);
	f.sqlite.exec('ROLLBACK');
	assert.equal(
		f.sqlite.prepare('SELECT gemini_model FROM system_settings').get().gemini_model,
		'gemini-3.8-flash'
	);
	assert.deepEqual(f.sqlite.pragma('foreign_key_check'), []);
});

const openaiResponse = (value = { name: '', studentNumber: '' }) => ({
	status: 'completed',
	output: [
		{
			type: 'message',
			status: 'completed',
			content: [{ type: 'output_text', text: JSON.stringify(value) }]
		}
	]
});
const ollamaResponse = (value = { name: '', studentNumber: '' }) => ({
	done: true,
	done_reason: 'stop',
	message: { role: 'assistant', content: JSON.stringify(value) }
});

test('OpenAI and Ollama admin settings preserve separate secrets and do not leak them to settings pages', async (t) => {
	const f = fixture(t);
	await f.remote.saveClearanceVerification(
		settingInput({
			aiProvider: 'openai',
			openaiApiKey: 'private-openai-key',
			openaiModel: 'gpt-4.1-nano'
		})
	);
	await f.remote.saveClearanceVerification(settingInput({ openaiApiKey: '' }));
	let settings = await f.remote.getClearanceSettings();
	assert.equal(settings.aiProvider, 'openai');
	assert.equal(settings.hasOpenaiKey, true);
	assert.equal(settings.openaiModel, 'gpt-4.1-nano');
	assert(!JSON.stringify(settings).includes('private-openai-key'));
	assert(!Object.hasOwn(settings, 'openaiApiKey'));
	assert(
		!JSON.stringify(await f.emailPage({ locals: f.state.viewer })).includes('private-openai-key')
	);
	await assert.rejects(
		f.remote.saveClearanceVerification(settingInput({ clearOpenaiKey: true })),
		hasStatus(400)
	);
	await f.remote.saveClearanceVerification(
		settingInput({
			aiProvider: 'ollama',
			clearOpenaiKey: true,
			ollamaBaseUrl: 'http://192.168.254.63:11434/',
			ollamaModel: 'qwen3-vl:4b'
		})
	);
	settings = await f.remote.getClearanceSettings();
	assert.equal(settings.aiProvider, 'ollama');
	assert.equal(settings.hasOpenaiKey, false);
	assert.equal(settings.hasGeminiKey, true);
	assert.equal(settings.ollamaBaseUrl, 'http://192.168.254.63:11434');
	assert.equal(f.db.select().from(schema.systemSettings).get().openaiApiKey, '');
	for (const role of ['student', 'registrar']) {
		f.state.viewer.user.role = role;
		await assert.rejects(f.remote.getClearanceSettings(), hasStatus(403));
		await assert.rejects(
			f.remote.saveClearanceVerification(settingInput({ aiProvider: 'openai', openaiApiKey: 'x' })),
			hasStatus(403)
		);
		await assert.rejects(f.remote.testClearanceAi({ aiProvider: 'ollama' }), hasStatus(403));
	}
});

test('unsaved provider tests use blank PNGs and never save, redirect, leak credentials across providers or send expected identity', async (t) => {
	const f = fixture(t);
	const original = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = original;
	});
	const calls = [];
	globalThis.fetch = async (url, options) => {
		calls.push({ url, options, body: JSON.parse(options.body) });
		return Response.json(url.includes('openai.com') ? openaiResponse() : ollamaResponse());
	};
	assert.equal(
		(
			await f.remote.testClearanceAi({
				aiProvider: 'openai',
				openaiApiKey: 'unsaved-secret',
				openaiModel: 'gpt-4.1-nano'
			})
		).success,
		true
	);
	let call = calls.at(-1);
	assert.equal(call.url, 'https://api.openai.com/v1/responses');
	assert.equal(call.options.headers.Authorization, 'Bearer unsaved-secret');
	assert.equal(call.options.redirect, 'error');
	assert.equal(call.body.store, false);
	assert.equal(call.body.text.format.strict, true);
	assert.equal(call.body.text.format.schema.additionalProperties, false);
	assert.equal(call.body.model, 'gpt-4.1-nano');
	assert.equal(call.body.input[0].content.length, 3);
	for (const part of call.body.input[0].content.slice(1)) {
		assert.equal(part.type, 'input_image');
		const metadata = await sharp(Buffer.from(part.image_url.split(',')[1], 'base64')).metadata();
		assert.equal(metadata.width, 128);
	}
	assert(!JSON.stringify(call.body).includes('unsaved-secret'));
	assert(!JSON.stringify(call.body).includes('23016578'));
	assert(!JSON.stringify(call.body).includes('Jonnel'));
	assert.equal(
		(
			await f.remote.testClearanceAi({
				aiProvider: 'ollama',
				ollamaBaseUrl: 'http://192.168.254.63:11434',
				ollamaModel: 'qwen3-vl:4b',
				openaiApiKey: 'must-not-forward'
			})
		).success,
		true
	);
	call = calls.at(-1);
	assert.equal(call.url, 'http://192.168.254.63:11434/api/chat');
	assert.equal(call.options.headers.Authorization, undefined);
	assert.equal(call.options.headers['x-goog-api-key'], undefined);
	assert.equal(call.body.stream, false);
	assert.equal(call.body.think, false);
	assert.equal(call.body.messages[1].images.length, 2);
	assert.equal(call.body.format.additionalProperties, false);
	const settings = await f.remote.getClearanceSettings();
	assert.equal(settings.aiProvider, 'gemini');
	assert.equal(settings.hasOpenaiKey, false);
	assert.equal(settings.ollamaBaseUrl, 'http://localhost:11434');
	for (const url of [
		'file:///tmp',
		'http://user:secret@localhost:11434',
		'http://localhost/api/chat',
		'http://localhost?key=secret',
		'http://localhost#fragment'
	]) {
		assert.throws(() => f.remote.testClearanceAi({ aiProvider: 'ollama', ollamaBaseUrl: url }));
	}
	assert.throws(() => f.remote.testClearanceAi({ aiProvider: 'unknown' }));
});

test('saved provider drives handwriting preview; incomplete, refused, malformed and truncated output never establishes identity', async (t) => {
	const f = await handwritingFixture(t);
	const original = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = original;
	});
	for (const provider of ['openai', 'ollama']) {
		await f.remote.saveClearanceVerification(
			settingInput({ aiProvider: provider, openaiApiKey: 'saved-openai-secret' })
		);
		let payload;
		globalThis.fetch = async (url, options) => {
			assert.equal(
				url,
				provider === 'openai'
					? 'https://api.openai.com/v1/responses'
					: 'http://localhost:11434/api/chat'
			);
			payload = JSON.parse(options.body);
			return Response.json(
				provider === 'openai'
					? openaiResponse({ name: 'Observed Name', studentNumber: '02301657' })
					: ollamaResponse({ name: 'Observed Name', studentNumber: '02301657' })
			);
		};
		let result = await f.remote.readClearanceTestHandwriting(f.input);
		assert.equal(result.success, true);
		assert.deepEqual(result.readings, { name: 'Observed Name', studentNumber: '02301657' });
		assert(!JSON.stringify(payload).includes('saved-openai-secret'));
		const invalid =
			provider === 'openai'
				? [
						{ ...openaiResponse(), status: 'incomplete' },
						{
							status: 'completed',
							output: [
								{
									type: 'message',
									status: 'completed',
									content: [{ type: 'refusal', refusal: 'No' }]
								}
							]
						},
						{
							status: 'completed',
							output: [
								{
									type: 'message',
									status: 'completed',
									content: [{ type: 'output_text', text: '{"name":"partial"' }]
								}
							]
						},
						null
					]
				: [
						{ ...ollamaResponse(), done: false },
						{ ...ollamaResponse(), done_reason: 'length' },
						{ ...ollamaResponse(), message: { content: '{"name":"partial"' } },
						null
					];
		for (const body of invalid) {
			globalThis.fetch = async () => Response.json(body);
			result = await f.remote.readClearanceTestHandwriting(f.input);
			assert.equal(result.success, true);
			assert.equal(result.readings.name, '');
			assert.equal(result.readings.studentNumber, '');
			assert(result.readings.warnings.name);
			assert(result.readings.warnings.studentNumber);
		}
		for (const status of [400, 401, 403, 404, 429, 503]) {
			globalThis.fetch = async () =>
				Response.json(
					{ error: { message: 'PRIVATE_KEY PRIVATE_PROJECT PRIVATE_STUDENT' } },
					{ status }
				);
			const failed = await f.remote.testClearanceAi({});
			assert.equal(failed.success, false);
			assert.match(failed.message, new RegExp(`HTTP ${status}`));
			assert(!failed.message.includes('PRIVATE'));
		}
	}
});

test('0042 preserves existing data and Gemini defaults; rollback refuses to discard provider settings', async (t) => {
	const f = fixture(t, 41);
	f.sqlite.exec(
		"INSERT INTO system_settings(id,gemini_api_key,gemini_model) VALUES(1,'retained-secret','gemini-2.5-flash')"
	);
	const before = f.sqlite.prepare('SELECT * FROM system_settings').get();
	migrate(f.db, migrationConfigThrough(t, 42));
	const after = f.sqlite.prepare('SELECT * FROM system_settings').get();
	for (const [key, value] of Object.entries(before)) assert.equal(after[key], value);
	assert.equal(after.ai_provider, 'gemini');
	assert.equal(after.openai_api_key, '');
	const rollback = readFileSync('drizzle/rollback/0042_handwriting_providers.sql', 'utf8');
	for (const assignment of [
		"ai_provider='ollama'",
		"openai_api_key='private-secret'",
		"openai_model='gpt-4.1-nano'",
		"ollama_base_url='http://192.168.254.63:11434'",
		"ollama_model='other:4b'"
	]) {
		f.sqlite.exec(`UPDATE system_settings SET ${assignment}`);
		assert.throws(() => f.sqlite.exec(rollback), /CHECK constraint/);
		f.sqlite.exec('ROLLBACK');
		f.sqlite
			.prepare(
				'UPDATE system_settings SET ai_provider=?,openai_api_key=?,openai_model=?,ollama_base_url=?,ollama_model=?'
			)
			.run(
				after.ai_provider,
				after.openai_api_key,
				after.openai_model,
				after.ollama_base_url,
				after.ollama_model
			);
	}
	f.sqlite.exec(rollback);
	assert.deepEqual(f.sqlite.prepare('SELECT * FROM system_settings').get(), before);
	migrate(f.db, migrationConfigThrough(t, 42));
	assert.deepEqual(f.sqlite.prepare('SELECT * FROM system_settings').get(), after);
	assert.equal(f.sqlite.pragma('integrity_check', { simple: true }), 'ok');
	assert.deepEqual(f.sqlite.pragma('foreign_key_check'), []);
});

test('OpenAI model fetching is admin-only, uses unsaved or saved key without saving, and returns sorted IDs only', async (t) => {
	const f = fixture(t);
	const original = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = original;
	});
	globalThis.fetch = async () =>
		assert.fail('Unauthorized or missing-key requests must not reach OpenAI');
	for (const role of ['student', 'registrar']) {
		f.state.viewer.user.role = role;
		await assert.rejects(
			f.remote.fetchClearanceOpenaiModels({ openaiApiKey: 'secret' }),
			hasStatus(403)
		);
	}
	f.state.viewer.user.role = 'admin';
	await assert.rejects(f.remote.fetchClearanceOpenaiModels({}), hasStatus(400));
	const keys = [];
	globalThis.fetch = async (url, options) => {
		assert.equal(url, 'https://api.openai.com/v1/models');
		assert.equal(options.redirect, 'error');
		assert.equal(options.body, undefined);
		keys.push(options.headers.Authorization);
		return Response.json({
			data: [{ id: 'z-model', owned_by: 'PRIVATE_PROJECT' }, { id: 'a-model' }, { id: 'z-model' }]
		});
	};
	const before = f.sqlite.prepare('SELECT total_changes() AS n').get().n;
	assert.deepEqual(await f.remote.fetchClearanceOpenaiModels({ openaiApiKey: 'unsaved-secret' }), {
		success: true,
		models: ['a-model', 'z-model']
	});
	assert.equal(f.sqlite.prepare('SELECT total_changes() AS n').get().n, before);
	await f.remote.saveClearanceVerification(settingInput({ openaiApiKey: 'saved-secret' }));
	assert.deepEqual(await f.remote.fetchClearanceOpenaiModels({}), {
		success: true,
		models: ['a-model', 'z-model']
	});
	assert.deepEqual(keys, ['Bearer unsaved-secret', 'Bearer saved-secret']);
	globalThis.fetch = async () => Response.json({ data: [] });
	assert.deepEqual(await f.remote.fetchClearanceOpenaiModels({}), { success: true, models: [] });
	for (const body of [null, {}, { data: [{ name: 'missing-id' }] }]) {
		globalThis.fetch = async () => Response.json(body);
		assert.equal((await f.remote.fetchClearanceOpenaiModels({})).success, false);
	}
	for (const status of [401, 403, 429, 503]) {
		globalThis.fetch = async () =>
			Response.json({ error: { message: 'PRIVATE_PROJECT saved-secret' } }, { status });
		const result = await f.remote.fetchClearanceOpenaiModels({});
		assert.equal(result.success, false);
		assert.match(result.message, new RegExp(`HTTP ${status}`));
		assert(!result.message.includes('PRIVATE_PROJECT'));
		assert(!result.message.includes('saved-secret'));
	}
	globalThis.fetch = async () => {
		throw new Error('PRIVATE_URL saved-secret');
	};
	assert(!JSON.stringify(await f.remote.fetchClearanceOpenaiModels({})).includes('PRIVATE'));
	globalThis.fetch = async () => {
		throw new DOMException('secret', 'TimeoutError');
	};
	assert.match((await f.remote.fetchClearanceOpenaiModels({})).message, /20 seconds/);
});

test('Ollama model listing uses entered or saved server without credentials or writes and fails safely', async (t) => {
	const f = fixture(t);
	const original = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = original;
	});
	globalThis.fetch = async () => assert.fail('Unauthorized calls must not contact Ollama');
	for (const role of ['student', 'registrar']) {
		f.state.viewer.user.role = role;
		await assert.rejects(
			f.remote.fetchClearanceOllamaModels({ ollamaBaseUrl: 'http://localhost:11434' }),
			hasStatus(403)
		);
	}
	f.state.viewer.user.role = 'admin';
	for (const url of [
		'file:///tmp',
		'http://user:secret@localhost:11434',
		'http://localhost/api/tags',
		'http://localhost?key=secret',
		'http://localhost#fragment'
	]) {
		assert.throws(() => f.remote.fetchClearanceOllamaModels({ ollamaBaseUrl: url }));
	}
	const urls = [];
	globalThis.fetch = async (url, options) => {
		urls.push(url);
		assert.equal(options.redirect, 'error');
		assert.equal(options.headers, undefined);
		assert.equal(options.body, undefined);
		return Response.json({
			models: [
				{ name: 'z-vision:4b', digest: 'PRIVATE' },
				{ name: 'a-vision:4b' },
				{ name: 'z-vision:4b' }
			]
		});
	};
	const before = f.sqlite.prepare('SELECT total_changes() AS n').get().n;
	assert.deepEqual(
		await f.remote.fetchClearanceOllamaModels({ ollamaBaseUrl: 'http://192.168.254.63:11434/' }),
		{ success: true, models: ['a-vision:4b', 'z-vision:4b'] }
	);
	assert.equal(f.sqlite.prepare('SELECT total_changes() AS n').get().n, before);
	await f.remote.saveClearanceVerification(
		settingInput({ ollamaBaseUrl: 'http://saved-host:11434' })
	);
	await f.remote.fetchClearanceOllamaModels({});
	assert.deepEqual(urls, [
		'http://192.168.254.63:11434/api/tags',
		'http://saved-host:11434/api/tags'
	]);
	globalThis.fetch = async () => Response.json({ models: [] });
	assert.deepEqual(await f.remote.fetchClearanceOllamaModels({}), { success: true, models: [] });
	for (const body of [null, {}, { models: [{ id: 'missing-name' }] }]) {
		globalThis.fetch = async () => Response.json(body);
		assert.equal((await f.remote.fetchClearanceOllamaModels({})).success, false);
	}
	globalThis.fetch = async () => new Response('PRIVATE_ERROR', { status: 503 });
	let result = await f.remote.fetchClearanceOllamaModels({});
	assert.match(result.message, /HTTP 503/);
	assert(!result.message.includes('PRIVATE'));
	globalThis.fetch = async () => {
		throw Error('PRIVATE_URL');
	};
	result = await f.remote.fetchClearanceOllamaModels({});
	assert.equal(result.success, false);
	assert(!result.message.includes('PRIVATE'));
	globalThis.fetch = async () => {
		throw new DOMException('private', 'TimeoutError');
	};
	assert.match((await f.remote.fetchClearanceOllamaModels({})).message, /20 seconds/);
});

test('GPT-5 nano reserves JSON output room with minimal reasoning and reports safe incomplete/refusal causes', async (t) => {
	const f = await handwritingFixture(t);
	const original = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = original;
	});
	for (const model of ['gpt-5-nano', 'gpt-5-nano-2025-08-07', 'gpt-4.1-mini', 'gpt-5.1']) {
		await f.remote.saveClearanceVerification(
			settingInput({ aiProvider: 'openai', openaiApiKey: 'saved-key', openaiModel: model })
		);
		const nano = model === 'gpt-5-nano' || model === 'gpt-5-nano-2025-08-07';
		globalThis.fetch = async (_url, options) => {
			const body = JSON.parse(options.body);
			assert.equal(body.max_output_tokens, nano ? 4096 : 1024);
			assert.deepEqual(body.reasoning, nano ? { effort: 'minimal' } : undefined);
			const response = openaiResponse({ name: 'Example Student', studentNumber: '00123456' });
			response.output.unshift({ type: 'reasoning', summary: [] });
			return Response.json(response);
		};
		const result = await f.remote.readClearanceTestHandwriting(f.input);
		assert.equal(result.success, true);
		assert.deepEqual(result.readings, { name: 'Example Student', studentNumber: '00123456' });
	}
	for (const [response, pattern] of [
		[
			{
				status: 'incomplete',
				incomplete_details: { reason: 'max_output_tokens' },
				output: openaiResponse({ name: 'Partial name', studentNumber: '12345678' }).output
			},
			/output limit.*Reasoning tokens/
		],
		[{ status: 'incomplete', incomplete_details: { reason: 'content_filter' } }, /filtered/],
		[
			{ status: 'incomplete', incomplete_details: { reason: 'PRIVATE_REASON saved-key' } },
			/incomplete response/
		],
		[
			{
				status: 'completed',
				output: [
					{
						type: 'message',
						status: 'completed',
						content: [{ type: 'refusal', refusal: 'PRIVATE saved-key' }]
					}
				]
			},
			/declined to transcribe/
		],
		[{ status: 'completed', output: [] }, /invalid or missing transcription JSON/]
	]) {
		globalThis.fetch = async () => Response.json(response);
		const result = await f.remote.readClearanceTestHandwriting(f.input);
		assert.equal(result.readings.name, '');
		assert.equal(result.readings.studentNumber, '');
		assert.match(result.readings.warnings.name, pattern);
		assert.equal(result.readings.warnings.name, result.readings.warnings.studentNumber);
		assert(!JSON.stringify(result).includes('PRIVATE'));
		assert(!JSON.stringify(result).includes('saved-key'));
	}
});
