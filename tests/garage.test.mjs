import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { migrationConfigThrough } from './migration-config.mjs';

const require = createRequire(import.meta.url);
function load(file, dependencies) {
	const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => dependencies[id] ?? require(id), exports);
	return exports;
}

const bucket = { id: 'bucket-id', globalAliases: ['bpc'] };
const missing = [404, { code: 'NoSuchBucket' }];
const conflict = [409, { code: 'BucketAlreadyExists' }];
const noKey = [404, { code: 'NoSuchAccessKey' }];
const key = {
	accessKeyId: 'GKgenerated',
	secretAccessKey: 'generated-secret',
	name: 'unused',
	expired: false
};
const layout = load('src/lib/server/garage/layout.ts', {});
const schema = load('src/lib/schema.ts', {
	'#lib/Roles.js': load('src/lib/Roles.ts', {}),
	'./email': load('src/lib/email.ts', {})
});

async function fixture(t, responses = [], overrides = {}, sqlite) {
	const calls = [];
	const server = createServer(async (request, response) => {
		if (new URL(request.url, 'http://garage.test').pathname === '/v2/GetClusterLayout') {
			response.writeHead(200, { 'Content-Type': 'application/json' });
			return response.end(
				JSON.stringify({
					version: 1,
					roles: [{ id: 'existing-node' }],
					stagedRoleChanges: [],
					stagedParameters: null
				})
			);
		}
		const chunks = [];
		for await (const chunk of request) chunks.push(chunk);
		calls.push({
			url: new URL(request.url, 'http://garage.test'),
			method: request.method,
			headers: request.headers,
			body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null
		});
		let next = responses.shift();
		if (typeof next === 'function') next = await next(calls.at(-1));
		if (!next || next instanceof Error) return request.socket.destroy();
		response.writeHead(next[0], { 'Content-Type': 'application/json' });
		response.end(JSON.stringify(next[1]));
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	t.after(
		() =>
			new Promise((resolve) => {
				server.closeAllConnections();
				server.close(resolve);
			})
	);
	const env = {
		GARAGE_ADMIN_ENDPOINT: `http://127.0.0.1:${server.address().port}/`,
		GARAGE_ADMIN_TOKEN: 'test-admin-token',
		...overrides
	};
	if (!sqlite) {
		sqlite = new Database(':memory:');
		t.after(() => sqlite.close());
		migrate(drizzle(sqlite), { migrationsFolder: 'drizzle' });
	}
	const db = drizzle(sqlite, { schema });
	function restart() {
		const credentials = load('src/lib/server/garage/credentials.ts', {
			'$app/env/private': env,
			'../../schema': schema,
			'../db': { db }
		});
		return {
			...credentials,
			...load('src/lib/server/garage/index.ts', {
				'$app/env/private': env,
				'./credentials': credentials,
				'./layout': layout
			})
		};
	}
	return { calls, sqlite, responses, env, restart, ...restart() };
}

test('Garage setup skips unconfigured deployments and rejects incomplete admin settings', async (t) => {
	const disabled = await fixture(t, [], {
		GARAGE_ADMIN_ENDPOINT: undefined,
		GARAGE_ADMIN_TOKEN: undefined
	});
	await disabled.ensureGarageBucket();
	assert.equal(disabled.calls.length, 0);
	for (const key of ['GARAGE_ADMIN_ENDPOINT', 'GARAGE_ADMIN_TOKEN']) {
		const f = await fixture(t, [], { [key]: undefined });
		await assert.rejects(f.ensureGarageBucket, /Set both GARAGE_ADMIN/);
		assert.equal(f.calls.length, 0);
	}
});

test('Admin SDK reuses existing bucket and authenticates against v2', async (t) => {
	const f = await fixture(t, [[200, bucket]]);
	await f.ensureGarageBucket();
	assert.equal(f.calls.length, 1);
	assert.equal(f.calls[0].url.pathname, '/v2/GetBucketInfo');
	assert.equal(f.calls[0].url.searchParams.get('globalAlias'), 'bpc');
	assert.equal(f.calls[0].headers.authorization, 'Bearer test-admin-token');
});

test('Admin SDK creates missing bpc bucket', async (t) => {
	const f = await fixture(t, [missing, [200, bucket]]);
	await f.ensureGarageBucket();
	assert.equal(f.calls.length, 2);
	assert.equal(f.calls[1].url.pathname, '/v2/CreateBucket');
	assert.equal(f.calls[1].method, 'POST');
	assert.deepEqual(f.calls[1].body, { globalAlias: 'bpc' });
});

test('concurrent creation verifies the winning bucket', async (t) => {
	const f = await fixture(t, [missing, conflict, [200, bucket]]);
	await f.ensureGarageBucket();
	assert.equal(f.calls.length, 3);
	assert.equal(f.calls[2].url.pathname, '/v2/GetBucketInfo');
});

test('lookup failures never trigger creation or leak SDK request secrets', async (t) => {
	for (const response of [
		[401, { code: 'AccessDenied', message: 'secret-token' }],
		[403, { code: 'AccessDenied' }],
		[500, { code: 'InternalError' }],
		[404, { code: 'NotFound' }]
	]) {
		const f = await fixture(t, [response]);
		await assert.rejects(f.ensureGarageBucket, (error) => {
			assert.match(error.message, /Garage bucket setup failed/);
			assert.doesNotMatch(error.stack, /test-admin-token|secret-token/);
			assert.equal(error.cause, undefined);
			return true;
		});
		assert.equal(f.calls.length, 1);
	}
});

test('creation errors and failed conflict verification reject setup', async (t) => {
	for (const responses of [
		[missing, [403, { code: 'AccessDenied' }]],
		[missing, [503, { code: 'ServiceUnavailable' }]],
		[missing, [409, { code: 'OtherConflict' }]],
		[missing, conflict, missing]
	]) {
		const f = await fixture(t, responses);
		await assert.rejects(f.ensureGarageBucket, /Garage bucket setup failed/);
	}
});

test('invalid bucket responses and connection errors reject setup', async (t) => {
	for (const response of [
		[200, {}],
		[200, { id: 'id', globalAliases: ['other'] }],
		new Error('Disconnected')
	]) {
		const f = await fixture(t, [response]);
		await assert.rejects(f.ensureGarageBucket, /Garage bucket setup failed/);
		assert.equal(f.calls.length, 1);
	}
});

test('Admin SDK grants generated S3 key read/write without adding owner permission', async (t) => {
	for (const responses of [[[200, bucket]], [missing, [200, bucket]]]) {
		const f = await fixture(t, [...responses, noKey, [200, key], [200, bucket]], {
			GARAGE_API_ENDPOINT: 'http://garage.test:3900'
		});
		await f.ensureGarageBucket();
		const grant = f.calls.at(-1);
		assert.equal(grant.url.pathname, '/v2/AllowBucketKey');
		assert.deepEqual(grant.body, {
			bucketId: bucket.id,
			accessKeyId: key.accessKeyId,
			permissions: { read: true, write: true, owner: false }
		});
	}
});

test('permission failures reject startup', async (t) => {
	const f = await fixture(
		t,
		[[200, bucket], noKey, [200, key], [404, { code: 'NoSuchAccessKey' }]],
		{ GARAGE_API_ENDPOINT: 'http://garage.test:3900' }
	);
	await assert.rejects(f.ensureGarageBucket, /Garage bucket setup failed \(404\)/);
});

test('server init runs setup at runtime, skips builds, and propagates setup failures', async () => {
	for (const building of [true, false]) {
		let calls = 0;
		const { init } = load('src/hooks.server.ts', {
			'#lib/server/auth.js': {},
			'#lib/errors.js': {},
			'#lib/server/garage/index.js': {
				ensureGarageBucket: async () => {
					calls++;
				}
			},
			'$app/env': { building },
			'better-auth/svelte-kit': {}
		});
		await init();
		assert.equal(calls, building ? 0 : 1);
	}
	const { init } = load('src/hooks.server.ts', {
		'#lib/server/auth.js': {},
		'#lib/errors.js': {},
		'#lib/server/garage/index.js': {
			ensureGarageBucket: async () => {
				throw new Error('Setup failed');
			}
		},
		'$app/env': { building: false },
		'better-auth/svelte-kit': {}
	});
	await assert.rejects(init, /Setup failed/);
});

const automatic = { GARAGE_API_ENDPOINT: 'http://garage.test:3900' };

test('automatic setup creates key, persists only identity, and fetches secret on restart', async (t) => {
	const f = await fixture(t, [[200, bucket], noKey, [200, key], [200, bucket]], automatic);
	await f.ensureGarageBucket();
	assert.deepEqual(f.getGarageCredentials(), {
		accessKeyId: key.accessKeyId,
		secretAccessKey: key.secretAccessKey
	});
	const stored = f.sqlite.prepare('SELECT * FROM garage_storage').get();
	assert.equal(stored.access_key_id, key.accessKeyId);
	assert.match(stored.key_name, /^bpc-app-/);
	assert.equal(stored.lease_token, null);
	assert.equal(stored.lease_expires_at, 0);
	assert.ok(!JSON.stringify(stored).includes(key.secretAccessKey));
	assert.deepEqual(
		f.calls.map((call) => call.url.pathname),
		['/v2/GetBucketInfo', '/v2/GetKeyInfo', '/v2/CreateKey', '/v2/AllowBucketKey']
	);
	assert.equal(f.calls[1].url.searchParams.get('showSecretKey'), 'true');
	assert.equal(f.calls[1].url.searchParams.get('search'), stored.key_name);
	assert.deepEqual(f.calls[2].body, { name: stored.key_name, neverExpires: true });
	const restarted = f.restart();
	assert.equal(restarted.getGarageCredentials(), undefined);
	f.responses.push([200, bucket], [200, key], [200, bucket]);
	await restarted.ensureGarageBucket();
	assert.deepEqual(restarted.getGarageCredentials(), f.getGarageCredentials());
	assert.equal(f.calls[5].url.searchParams.get('id'), key.accessKeyId);
	assert.equal(f.calls.filter((call) => call.url.pathname === '/v2/CreateKey').length, 1);
});

test('partial setup failure reuses managed key by persisted name and retries permissions', async (t) => {
	const f = await fixture(
		t,
		[
			[200, bucket],
			noKey,
			[200, key],
			[403, { code: 'AccessDenied', message: key.secretAccessKey }]
		],
		automatic
	);
	await assert.rejects(f.ensureGarageBucket, /Garage bucket setup failed/);
	assert.equal(f.getGarageCredentials(), undefined);
	const stored = f.sqlite.prepare('SELECT * FROM garage_storage').get();
	assert.equal(stored.access_key_id, null);
	assert.equal(stored.lease_token, null);
	f.responses.push([200, bucket], [200, { ...key, name: stored.key_name }], [200, bucket]);
	const restarted = f.restart();
	await restarted.ensureGarageBucket();
	assert.equal(restarted.getGarageCredentials().accessKeyId, key.accessKeyId);
	assert.equal(f.calls.filter((call) => call.url.pathname === '/v2/CreateKey').length, 1);
});

test('admin key errors, missing secrets, and expired keys fail without creating replacements', async (t) => {
	for (const response of [
		[403, { code: 'AccessDenied' }],
		[500, { code: 'InternalError' }],
		[200, { ...key, secretAccessKey: null }],
		[200, { ...key, expired: true }]
	]) {
		const f = await fixture(t, [[200, bucket], response], automatic);
		const failure = await f.ensureGarageBucket().then(
			() => null,
			(error) => error
		);
		assert.match(failure.message, /Garage bucket setup failed/);
		assert.doesNotMatch(failure.stack, /generated-secret|test-admin-token/);
		assert.equal(f.getGarageCredentials(), undefined);
		assert.equal(f.calls.length, 2);
		assert.equal(
			f.sqlite.prepare('SELECT lease_token FROM garage_storage').get().lease_token,
			null
		);
	}
});

test('simultaneous app instances serialize provisioning through DB lease', async (t) => {
	let releaseCreate, onCreate;
	const reachedCreate = new Promise((resolve) => {
		onCreate = resolve;
	});
	const createResult = new Promise((resolve) => {
		releaseCreate = resolve;
	});
	const first = await fixture(
		t,
		[
			[200, bucket],
			noKey,
			() => {
				onCreate();
				return createResult;
			},
			[200, bucket]
		],
		automatic
	);
	const second = await fixture(
		t,
		[
			[200, bucket],
			[200, key],
			[200, bucket]
		],
		automatic,
		first.sqlite
	);
	const firstRun = first.ensureGarageBucket();
	await reachedCreate;
	const secondRun = second.ensureGarageBucket();
	releaseCreate([200, key]);
	await Promise.all([firstRun, secondRun]);
	assert.equal(first.calls.filter((call) => call.url.pathname === '/v2/CreateKey').length, 1);
	assert.equal(second.calls.filter((call) => call.url.pathname === '/v2/CreateKey').length, 0);
	assert.deepEqual(first.getGarageCredentials(), second.getGarageCredentials());
	assert.equal(first.sqlite.prepare('SELECT count(*) AS n FROM garage_storage').get().n, 1);
});

test('expired DB lease is reclaimed and stored identity remains intact', async (t) => {
	const f = await fixture(
		t,
		[
			[200, bucket],
			[200, key],
			[200, bucket]
		],
		automatic
	);
	f.sqlite
		.prepare('INSERT INTO garage_storage VALUES (?, ?, ?, ?, ?)')
		.run(
			automatic.GARAGE_API_ENDPOINT,
			'stored-name',
			key.accessKeyId,
			'crashed-instance',
			Date.now() - 1
		);
	await f.ensureGarageBucket();
	assert.equal(f.getGarageCredentials().accessKeyId, key.accessKeyId);
	assert.equal(f.calls[1].url.searchParams.get('id'), key.accessKeyId);
});

test('storage migration preserves populated tables and repeated migration is safe', (t) => {
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	const db = drizzle(sqlite);
	migrate(db, migrationConfigThrough(t, 32));
	sqlite.exec(
		"INSERT INTO system_settings(id, sender_email) VALUES (1, 'keep@example.com'); INSERT INTO subject(id,code,name) VALUES ('keep','KEEP','Existing subject');"
	);
	migrate(db, { migrationsFolder: 'drizzle' });
	migrate(db, { migrationsFolder: 'drizzle' });
	assert.equal(
		sqlite.prepare('SELECT sender_email FROM system_settings').get().sender_email,
		'keep@example.com'
	);
	assert.equal(sqlite.prepare('SELECT name FROM subject').get().name, 'Existing subject');
	assert.deepEqual(
		sqlite
			.prepare('PRAGMA table_info(garage_storage)')
			.all()
			.map((column) => column.name),
		['endpoint', 'key_name', 'access_key_id', 'lease_token', 'lease_expires_at']
	);
	assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
});
