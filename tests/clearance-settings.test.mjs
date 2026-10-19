import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as kit from '@sveltejs/kit';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(file, dependencies = {}, override) {
	const { outputText } = ts.transpileModule(override ?? readFileSync(file, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)(
		(id) => dependencies[id] ?? (id === '@sveltejs/kit' ? kit : require(id)),
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

function fixture(t) {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
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
			getRequestEvent: () => ({ locals: state.viewer }),
			query: (handler) => () =>
				Object.assign(Promise.resolve(handler()), { refresh: async () => {} }),
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
		assert.throws(() => f.remote.getClearanceSettings(), hasStatus(403));
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
