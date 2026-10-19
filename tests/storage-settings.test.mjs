import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as kit from '@sveltejs/kit';
import { chromium, expect } from '@playwright/test';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { createServer as createViteServer } from 'vite';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
	const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
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
const schema = load('src/lib/schema.ts', {
	'#lib/Roles.js': roles,
	'./email': load('src/lib/email.ts')
});
const nodeId = 'a'.repeat(64);
const role = { id: nodeId, capacity: 10_000_000_000, zone: 'dc1', tags: ['preserve-me'] };
const input = { nodeId, layoutVersion: '1', capacityGB: '20', confirmed: 'yes' };
const statusError = (status) => (caught) => kit.isHttpError(caught) && caught.status === status;

async function fixture(t) {
	const calls = [];
	const objects = new Map([['documents/report.pdf', Buffer.from('original report')]]);
	const state = {
		layout: { version: 1, roles: [{ ...role }], stagedRoleChanges: [], stagedParameters: null },
		nodes: [
			{
				id: nodeId,
				isUp: true,
				draining: false,
				hostname: 'garage-one',
				garageVersion: '2.4.1',
				dataPartition: { available: 80_000_000_000, total: 100_000_000_000 }
			}
		],
		key: null,
		failApply: false,
		loseApplyResponse: false,
		interfere: false,
		totalObjectBytes: 3_000_000_000,
		deleteErrorKey: null,
		listOutsidePrefix: false,
		fault: null
	};
	const xml = (value) =>
		String(value).replace(
			/[&<>"']/g,
			(char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]
		);
	const server = createServer(async (request, response) => {
		const url = new URL(request.url, 'http://garage.test');
		const chunks = [];
		for await (const chunk of request) chunks.push(chunk);
		const body = Buffer.concat(chunks);
		calls.push({ path: url.pathname, url, method: request.method, body });
		const json = (status, value) => {
			response.writeHead(status, { 'Content-Type': 'application/json' });
			response.end(JSON.stringify(value));
		};
		if (state.fault === url.pathname) return json(503, { message: 'SECRET-admin-token' });
		if (url.pathname.startsWith('/v2/')) {
			const bucket = {
				id: 'bucket-id',
				globalAliases: ['bpc'],
				bytes: 2_000_000_000,
				objects: 7,
				quotas: { maxSize: null, maxObjects: 1000 },
				websiteAccess: false,
				keys: [{ accessKeyId: 'GKtest', name: 'PRIVATE-KEY-NAME' }]
			};
			switch (url.pathname) {
				case '/v2/GetClusterLayout':
					if (state.interfere && state.layout.stagedRoleChanges.length)
						state.layout.stagedRoleChanges.push({ ...role, id: 'b'.repeat(64) });
					return json(200, state.layout);
				case '/v2/GetClusterStatus':
					return json(200, { layoutVersion: state.layout.version, nodes: state.nodes });
				case '/v2/GetClusterHealth':
					return json(200, {
						status: 'healthy',
						storageNodes: 1,
						storageNodesUp: 1,
						partitions: 256,
						partitionsQuorum: 256,
						partitionsAllOk: 256
					});
				case '/v2/GetClusterStatistics':
					return json(200, {
						dataAvail: 8_000_000_000,
						totalObjectBytes: state.totalObjectBytes,
						metadataAvail: 4_000_000_000,
						incompleteAvailInfo: false,
						freeform: 'SECRET-do-not-serialize'
					});
				case '/v2/GetBucketInfo':
				case '/v2/AllowBucketKey':
					return json(200, bucket);
				case '/v2/GetKeyInfo': {
					const matches =
						state.key &&
						(url.searchParams.get('id') === state.key.accessKeyId ||
							url.searchParams.get('search') === state.key.name);
					return matches ? json(200, state.key) : json(404, { code: 'NoSuchAccessKey' });
				}
				case '/v2/CreateKey':
					state.key = {
						accessKeyId: 'GKtest',
						secretAccessKey: 'SECRET-s3-key',
						expired: false,
						name: JSON.parse(body).name
					};
					return json(200, state.key);
				case '/v2/UpdateClusterLayout':
					state.layout.stagedRoleChanges = JSON.parse(body).roles;
					return json(200, state.layout);
				case '/v2/ApplyClusterLayout': {
					if (state.failApply) return json(500, { message: 'SECRET-admin-token' });
					const requested = JSON.parse(body).version;
					if (requested !== state.layout.version + 1) return json(400, { code: 'InvalidRequest' });
					state.layout = {
						...state.layout,
						version: requested,
						roles: state.layout.roles.map(
							(current) =>
								state.layout.stagedRoleChanges.find((change) => change.id === current.id) || current
						),
						stagedRoleChanges: []
					};
					return state.loseApplyResponse
						? json(500, { message: 'Response lost' })
						: json(200, { layout: state.layout });
				}
				default:
					return json(404, { code: 'UnknownEndpoint' });
			}
		}
		const key = decodeURIComponent(url.pathname.slice('/bpc/'.length));
		if (request.method === 'POST' && url.searchParams.has('delete')) {
			const errors = [];
			for (const match of body.toString().matchAll(/<Key>(.*?)<\/Key>/gs)) {
				const target = match[1].replace(
					/&(amp|lt|gt|quot|apos);/g,
					(_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[entity]
				);
				if (target === state.deleteErrorKey)
					errors.push(
						`<Error><Key>${xml(target)}</Key><Code>AccessDenied</Code><Message>SECRET-provider-error</Message></Error>`
					);
				else objects.delete(target);
			}
			response.setHeader('Content-Type', 'application/xml');
			return response.end(
				`<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${errors.join('')}</DeleteResult>`
			);
		}
		if (request.method === 'PUT') {
			objects.set(key, body);
			return response.end();
		}
		if (url.searchParams.get('list-type') === '2') {
			const prefix = url.searchParams.get('prefix') || '';
			const delimiter = url.searchParams.get('delimiter');
			const folders = new Set();
			const entries = [];
			for (const [key, bytes] of objects) {
				if (!key.startsWith(prefix)) continue;
				const remainder = key.slice(prefix.length);
				if (delimiter && remainder.includes('/'))
					folders.add(prefix + remainder.split('/')[0] + '/');
				else entries.push({ key, bytes });
			}
			if (!delimiter && state.listOutsidePrefix)
				entries.push({ key: 'outside.txt', bytes: Buffer.from('outside') });
			const all = [
				...Array.from(folders).map((prefix) => ({
					key: prefix,
					xml: `<CommonPrefixes><Prefix>${xml(prefix)}</Prefix></CommonPrefixes>`
				})),
				...entries.map(({ key, bytes }) => ({
					key,
					xml: `<Contents><Key>${xml(key)}</Key><Size>${bytes.length}</Size><LastModified>2026-10-19T00:00:00.000Z</LastModified></Contents>`
				}))
			];
			const after = url.searchParams.get('continuation-token') || '';
			const remaining = all
				.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
				.filter((entry) => entry.key > after);
			const limit = Math.min(Number(url.searchParams.get('max-keys')) || 1000, 1000);
			const page = remaining.slice(0, limit);
			const truncated = remaining.length > limit;
			response.setHeader('Content-Type', 'application/xml');
			return response.end(
				`<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>${truncated}</IsTruncated>${truncated ? `<NextContinuationToken>${xml(page.at(-1).key)}</NextContinuationToken>` : ''}${page.map((entry) => entry.xml).join('')}</ListBucketResult>`
			);
		}
		if (objects.has(key)) {
			response.setHeader('Content-Length', objects.get(key).length);
			return response.end(objects.get(key));
		}
		response.writeHead(404, { 'Content-Type': 'application/xml' });
		response.end('<Error><Code>NoSuchKey</Code></Error>');
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	t.after(
		() =>
			new Promise((resolve) => {
				server.closeAllConnections();
				server.close(resolve);
			})
	);
	const endpoint = `http://127.0.0.1:${server.address().port}`;
	const env = {
		GARAGE_ADMIN_ENDPOINT: endpoint,
		GARAGE_ADMIN_TOKEN: 'SECRET-admin-token',
		GARAGE_API_ENDPOINT: endpoint,
		GARAGE_REGION: 'garage'
	};
	const sqlite = new Database(':memory:');
	t.after(() => sqlite.close());
	migrate(drizzle(sqlite), { migrationsFolder: 'drizzle' });
	const credentials = load('src/lib/server/garage/credentials.ts', {
		'$app/env/private': env,
		'../../schema': schema,
		'../db': { db: drizzle(sqlite, { schema }) }
	});
	const layout = load('src/lib/server/garage/layout.ts');
	const index = load('src/lib/server/garage/index.ts', {
		'$app/env/private': env,
		'./credentials': credentials,
		'./layout': layout
	});
	const files = load('src/lib/server/garage/files.ts', {
		'$app/env/private': env,
		'./index': index,
		'./credentials': credentials
	});
	const admin = load('src/lib/server/garage/admin.ts', {
		'$app/env/private': env,
		'./index': index,
		'./layout': layout,
		'./credentials': credentials
	});
	const explorer = load('src/lib/server/garage/explorer.ts', {
		'./files': files,
		'./index': index
	});
	await index.ensureGarageBucket();
	calls.length = 0;
	return { calls, objects, state, env, ...admin, ...explorer, files };
}

test('overview separates real available space, configured capacity and bucket logical usage without secrets', async (t) => {
	const f = await fixture(t);
	const overview = await f.getStorageOverview();
	assert.equal(overview.space.available, 8_000_000_000);
	assert.equal(overview.space.objectBytes, 3_000_000_000);
	assert.equal(overview.nodes[0].diskAvailable, 80_000_000_000);
	assert.equal(overview.nodes[0].capacity, 10_000_000_000);
	assert.equal(overview.bucket.bytes, 2_000_000_000);
	assert.equal(overview.bucket.maxObjects, 1000);
	assert.doesNotMatch(JSON.stringify(overview), /SECRET|PRIVATE-KEY-NAME|GKtest/);
	f.state.totalObjectBytes = null;
	assert.equal((await f.getStorageOverview()).space.objectBytes, null);
});

test('confirmed capacity increase preserves zone/tags and applies next layout version', async (t) => {
	const f = await fixture(t);
	const result = await f.increaseNodeCapacity(input);
	assert.equal(result.capacity, 20_000_000_000);
	assert.equal(result.layoutVersion, 2);
	assert.deepEqual(f.state.layout.roles[0], { ...role, capacity: 20_000_000_000 });
	assert.deepEqual(
		JSON.parse(f.calls.find((call) => call.path === '/v2/ApplyClusterLayout').body),
		{ version: 2 }
	);
});

test('invalid, unconfirmed, decreasing, stale and impossible increases never stage changes', async (t) => {
	for (const [data, expected] of [
		[{ ...input, confirmed: 'no' }, 400],
		[{ ...input, capacityGB: 'NaN' }, 400],
		[{ ...input, capacityGB: '10' }, 400],
		[{ ...input, capacityGB: '9' }, 400],
		[{ ...input, capacityGB: '101' }, 400],
		[{ ...input, layoutVersion: '2' }, 409],
		[{ ...input, nodeId: 'b'.repeat(64) }, 404]
	]) {
		const f = await fixture(t);
		await assert.rejects(() => f.increaseNodeCapacity(data), statusError(expected));
		assert.ok(!f.calls.some((call) => call.method === 'POST'));
	}
});

test('offline nodes and existing pending changes block resizing', async (t) => {
	for (const pending of [false, true]) {
		const f = await fixture(t);
		if (pending) f.state.layout.stagedRoleChanges = [{ ...role, capacity: 30_000_000_000 }];
		else f.state.nodes[0].isUp = false;
		await assert.rejects(() => f.increaseNodeCapacity(input), statusError(409));
		assert.ok(!f.calls.some((call) => call.method === 'POST'));
	}
});

test('concurrent app requests serialize; only one submitted version can apply', async (t) => {
	const f = await fixture(t);
	const results = await Promise.allSettled([
		f.increaseNodeCapacity(input),
		f.increaseNodeCapacity(input)
	]);
	assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
	assert.equal(results.find((result) => result.status === 'rejected').reason.status, 409);
	assert.equal(f.calls.filter((call) => call.path === '/v2/ApplyClusterLayout').length, 1);
});

test('operator interference cannot be silently applied and failures keep staging for review', async (t) => {
	const f = await fixture(t);
	f.state.interfere = true;
	await assert.rejects(() => f.increaseNodeCapacity(input), statusError(409));
	assert.ok(!f.calls.some((call) => call.path === '/v2/ApplyClusterLayout'));
	assert.equal(f.state.layout.stagedRoleChanges.length, 2);
	const failed = await fixture(t);
	failed.state.failApply = true;
	await assert.rejects(
		() => failed.increaseNodeCapacity(input),
		(error) => statusError(503)(error) && !error.body.message.includes('SECRET')
	);
	assert.equal(failed.state.layout.version, 1);
	assert.equal(failed.state.layout.stagedRoleChanges.length, 1);
});

test('a lost apply response is reconciled against committed layout', async (t) => {
	const f = await fixture(t);
	f.state.loseApplyResponse = true;
	assert.equal((await f.increaseNodeCapacity(input)).layoutVersion, 2);
});

test('explorer browses folders, paginates, uploads without overwrite and streams downloads', async (t) => {
	const f = await fixture(t);
	assert.deepEqual((await f.browseStorage('')).folders, [
		{ prefix: 'documents/', name: 'documents' }
	]);
	assert.equal((await f.browseStorage('documents/')).files[0].name, 'report.pdf');
	const name = await f.uploadStorageFile('documents/', new File(['new report'], 'report.pdf'));
	assert.notEqual(name, 'report.pdf');
	assert.equal(f.objects.get('documents/report.pdf').toString(), 'original report');
	assert.equal(await (await f.downloadStorageFile('documents/' + name)).text(), 'new report');
	for (let i = 0; i < 105; i++) f.objects.set(`pages/file${i}.txt`, Buffer.from('x'));
	const page = await f.browseStorage('pages/');
	assert.equal(page.files.length, 100);
	assert.equal((await f.browseStorage('pages/', page.nextToken)).files.length, 5);
	await assert.rejects(() => f.browseStorage('../'), statusError(400));
	await assert.rejects(() => f.downloadStorageFile('documents/../private'), statusError(400));
});

function routes(f, locals = { user: { id: 'admin', role: 'admin' }, session: {} }) {
	const validateUser = (locals, allowed) => {
		assert.deepEqual(allowed, [roles.Role.ADMIN]);
		if (!locals.user || !locals.session) kit.error(401, 'Unauthorized');
		if (!allowed.includes(locals.user.role)) kit.error(403, 'Forbidden');
	};
	const deps = {
		'#lib/Roles.js': roles,
		'#lib/server/auth.js': { validateUser },
		'#lib/server/garage/index.js': { garageAdminConfigured: () => true },
		'#lib/server/garage/files.js': f.files,
		'#lib/server/garage/admin.js': f,
		'#lib/server/garage/explorer.js': f,
		'$app/server': {
			getRequestEvent: () => ({ locals }),
			command: (schema, callback) => (input) => callback(schema.parse(input))
		}
	};
	return {
		...load('src/routes/user/settings/storage/+page.server.ts', deps),
		...load('src/routes/user/settings/storage/download/+server.ts', deps),
		...load('src/lib/actions/storage.remote.ts', deps),
		upload: load('src/routes/user/settings/storage/upload/+server.ts', deps).POST
	};
}

test('confirmed file deletion removes only the selected file', async (t) => {
	const f = await fixture(t);
	const key = 'documents/quotes & <notes> 日本語.txt';
	f.objects.set(key, Buffer.from('delete me'));
	await f.deleteStorageEntry('documents/', { kind: 'file', key, confirmed: 'yes' });
	assert.equal(f.objects.has(key), false);
	assert.equal(f.objects.has('documents/report.pdf'), true);
	assert.equal(f.calls.filter((call) => call.method === 'POST').length, 1);
});

test('folder deletion includes nested files and markers across pages while preserving sibling prefixes', async (t) => {
	const f = await fixture(t);
	f.objects.set('documents/', Buffer.from(''));
	for (let i = 0; i < 1005; i++) f.objects.set(`documents/nested/file-${i}.txt`, Buffer.from('x'));
	f.objects.set('documents-copy/keep.txt', Buffer.from('keep'));
	await f.deleteStorageEntry('', { kind: 'folder', key: 'documents/', confirmed: 'yes' });
	assert.deepEqual([...f.objects.keys()], ['documents-copy/keep.txt']);
	assert.equal(f.calls.filter((call) => call.method === 'POST').length, 2);
	assert.ok(
		f.calls
			.filter((call) => call.method === 'GET')
			.every(
				(call) =>
					call.url.searchParams.get('prefix') === 'documents/' &&
					!call.url.searchParams.has('delimiter')
			)
	);
});

test('unconfirmed, root, invalid and out-of-folder deletions make no remote calls', async (t) => {
	const f = await fixture(t);
	for (const [folder, input] of [
		['', { kind: 'file', key: 'documents/report.pdf' }],
		['', { kind: 'folder', key: '', confirmed: 'yes' }],
		['', { kind: 'folder', key: 'documents', confirmed: 'yes' }],
		['', { kind: 'folder', key: '../', confirmed: 'yes' }],
		['documents/', { kind: 'file', key: 'documents-copy/report.pdf', confirmed: 'yes' }],
		['documents/', { kind: 'file', key: 'documents/nested/report.pdf', confirmed: 'yes' }],
		['documents/', { kind: 'file', key: 'documents/../report.pdf', confirmed: 'yes' }]
	])
		await assert.rejects(() => f.deleteStorageEntry(folder, input), statusError(400));
	assert.equal(f.calls.length, 0);
});

test('unexpected folder listing stops before deletion; partial failures stay visible without provider secrets', async (t) => {
	const f = await fixture(t);
	f.state.listOutsidePrefix = true;
	await assert.rejects(
		() => f.deleteStorageEntry('', { kind: 'folder', key: 'documents/', confirmed: 'yes' }),
		statusError(503)
	);
	assert.equal(f.calls.filter((call) => call.method === 'POST').length, 0);
	f.state.listOutsidePrefix = false;
	f.state.deleteErrorKey = 'documents/report.pdf';
	f.objects.set('documents/other.txt', Buffer.from('deleted before failure'));
	await assert.rejects(
		() =>
			routes(f).deleteGarageEntry({
				folder: '',
				kind: 'folder',
				key: 'documents/',
				confirmed: 'yes'
			}),
		(caught) => {
			assert.equal(caught.status, 503);
			assert.match(caught.body.message, /Some files could not be deleted/);
			assert.doesNotMatch(JSON.stringify(caught), /SECRET/);
			return true;
		}
	);
	assert.equal(f.objects.has('documents/report.pdf'), true);
	assert.equal(f.objects.has('documents/other.txt'), false);
	f.state.deleteErrorKey = null;
	await f.deleteStorageEntry('', { kind: 'folder', key: 'documents/', confirmed: 'yes' });
	assert.equal(f.objects.size, 0);
});

test('every storage entry point denies anonymous, student and registrar access before remote calls', async (t) => {
	const f = await fixture(t);
	for (const role of [null, 'student', 'registrar']) {
		const event = {
			locals: role ? { user: { id: 'u', role }, session: {} } : {},
			url: new URL('http://app.test/user/settings/storage'),
			request: new Request('http://app.test'),
			setHeaders() {}
		};
		const r = routes(f, event.locals);
		for (const handler of [
			r.load,
			r.upload,
			() => r.increaseGarageCapacity(input),
			() =>
				r.deleteGarageEntry({ folder: '', kind: 'folder', key: 'documents/', confirmed: 'yes' }),
			r.GET
		])
			await assert.rejects(() => handler(event), statusError(role ? 403 : 401));
	}
	assert.equal(f.calls.length, 0);
});

test('admin page can show provider errors without leaking secrets', async (t) => {
	const f = await fixture(t);
	f.state.fault = '/v2/GetClusterStatistics';
	const r = routes(f);
	const data = await r.load({
		locals: { user: { id: 'admin', role: 'admin' }, session: {} },
		url: new URL('http://app.test/user/settings/storage'),
		setHeaders() {}
	});
	assert.ok(data.statusError);
	assert.ok(data.listing);
	assert.doesNotMatch(JSON.stringify(data), /SECRET|PRIVATE-KEY-NAME|GKtest/);
});

test('admin browser explores, downloads, uploads and increases capacity; other roles get 403', async (t) => {
	const f = await fixture(t);
	const workspace = path.resolve();
	const root = mkdtempSync(path.join(workspace, '.tmp-storage-settings-'));
	const source = (file) => readFileSync(file, 'utf8');
	const fixtures = {
		'package.json': JSON.stringify({ type: 'module', imports: { '#lib/*': './src/lib/*' } }),
		'.env': Object.entries({
			DATABASE_URL: 'unused.db',
			ORIGIN: 'http://localhost',
			BETTER_AUTH_SECRET: 'test-only-secret',
			...f.env
		})
			.map(([key, value]) => `${key}=${value}`)
			.join('\n'),
		'src/app.html':
			'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">%sveltekit.head%</head><body><div>%sveltekit.body%</div></body></html>',
		'src/env.ts': source('src/env.ts'),
		'src/hooks.server.js':
			"export {ensureGarageBucket as init} from '#lib/server/garage/index.js';export const handle=({event,resolve})=>{const role=event.cookies.get('test-role')||'admin';if(role!=='anonymous'){event.locals.user={id:'test-user',role};event.locals.session={id:'test-session'};}return resolve(event);};",
		'src/lib/server/auth.js':
			"import{error}from'@sveltejs/kit';export function validateUser(locals,roles=[]){if(!locals.user||!locals.session)error(401,'Unauthorized');if(roles.length&&!roles.includes(locals.user.role))error(403,'Forbidden');}",
		'src/lib/schema.ts': source('src/lib/schema.ts'),
		'src/lib/Roles.ts': source('src/lib/Roles.ts'),
		'src/lib/email.ts': source('src/lib/email.ts'),
		'src/lib/errors.ts': source('src/lib/errors.ts'),
		'src/lib/actions/storage.remote.ts': source('src/lib/actions/storage.remote.ts'),
		'src/lib/actions/storage.client.ts': source('src/lib/actions/storage.client.ts'),
		'src/lib/server/db/index.ts': `import Database from 'better-sqlite3';import {drizzle} from 'drizzle-orm/better-sqlite3';import * as schema from '../../schema';const client=new Database(':memory:');client.exec(${JSON.stringify(source('drizzle/0033_garage_storage.sql'))});export const db=drizzle(client,{schema});`,
		'src/style.css': "@import '../../src/routes/layout.css'; @source '../../src';",
		'src/routes/+layout.svelte':
			'<script>import "../style.css";import PopupHost from "#lib/components/Popup/PopupHost.svelte";import {onMount}from"svelte";let{children}=$props();onMount(()=>window.appReady=true);</script><main class="mx-auto max-w-7xl p-4">{@render children()}</main><PopupHost />',
		'src/routes/+error.svelte':
			'<script>import{page}from"$app/state";</script><h1>{page.status}</h1>'
	};
	for (const file of [
		'index.ts',
		'credentials.ts',
		'layout.ts',
		'files.ts',
		'admin.ts',
		'explorer.ts'
	])
		fixtures['src/lib/server/garage/' + file] = source('src/lib/server/garage/' + file);
	for (const file of [
		'BlurPage.svelte',
		'ErrorPopup.svelte',
		'LoadingPopup.svelte',
		'Popup.svelte.ts',
		'PopupCard.svelte',
		'PopupHost.svelte',
		'SuccessPopup.svelte',
		'YesNoPopup.svelte'
	])
		fixtures['src/lib/components/Popup/' + file] = source('src/lib/components/Popup/' + file);
	for (const file of [
		'+page.server.ts',
		'+page.svelte',
		'download/+server.ts',
		'upload/+server.ts'
	])
		fixtures['src/routes/user/settings/storage/' + file] = source(
			'src/routes/user/settings/storage/' + file
		);
	let vite, browser;
	try {
		for (const [file, contents] of Object.entries(fixtures)) {
			const target = path.join(root, file);
			mkdirSync(path.dirname(target), { recursive: true });
			writeFileSync(target, contents);
		}
		vite = await createViteServer({
			root,
			configFile: false,
			plugins: [tailwindcss(), sveltekit({ experimental: { remoteFunctions: true } })],
			ssr: { noExternal: ['@lucide/svelte'] },
			optimizeDeps: { include: ['@lucide/svelte'] },
			server: { host: '127.0.0.1', port: 0 }
		});
		await vite.listen();
		browser = await chromium.launch({ headless: true, channel: 'msedge' });
		const page = await browser.newPage();
		page.setDefaultTimeout(15_000);
		page.setDefaultNavigationTimeout(60_000);
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		const remoteRequests = [];
		page.on('request', (request) => {
			if (request.method() === 'POST' && !new URL(request.url()).pathname.endsWith('/upload'))
				remoteRequests.push({
					url: request.url(),
					body: request.postDataBuffer(),
					contentType: request.headers()['content-type']
				});
		});
		const closeSuccess = async () => {
			const success = page.getByRole('dialog', { name: 'Success', exact: true });
			await expect(success).toBeVisible();
			await success.getByRole('button', { name: 'Done', exact: true }).click();
			await expect(success).not.toBeVisible();
		};
		const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
		const url = origin + '/user/settings/storage';
		await page.goto(url);
		await page.waitForFunction(() => window.appReady);
		await expect(page.getByText('8 GB', { exact: true })).toBeVisible();
		await expect(page.getByText('80 GB free', { exact: true })).toBeVisible();
		const bucketUsage = page.getByRole('progressbar', {
			name: 'All bucket usage against configured cluster capacity'
		});
		await expect(bucketUsage).toHaveAttribute('max', '10000000000');
		await expect(bucketUsage).toHaveAttribute('value', '3000000000');
		const filesystemUsage = page.getByRole('progressbar', {
			name: 'Filesystem disk used on garage-one'
		});
		await expect(filesystemUsage).toHaveAttribute('max', '100000000000');
		await expect(filesystemUsage).toHaveAttribute('value', '20000000000');
		const capacity = page.getByRole('form', { name: 'Increase capacity for garage-one' });
		await capacity.getByLabel('New capacity (GB)').fill('20');
		await capacity.getByRole('button', { name: 'Increase capacity', exact: true }).click();
		const capacityConfirmation = page.getByRole('dialog', { name: 'Increase node capacity?' });
		await expect(capacityConfirmation).toBeVisible();
		await capacityConfirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
		assert.equal(f.state.layout.roles[0].capacity, 10_000_000_000);
		await capacity.getByRole('button', { name: 'Increase capacity', exact: true }).click();
		await capacityConfirmation
			.getByRole('button', { name: 'Increase capacity', exact: true })
			.click();
		await expect(
			page.getByText('Node capacity increased to 20 GB. Layout version 2 applied.')
		).toBeVisible();
		await closeSuccess();
		assert.equal(f.state.layout.roles[0].capacity, 20_000_000_000);
		await expect(bucketUsage).toHaveAttribute('max', '20000000000');
		await expect(bucketUsage).toHaveAttribute('value', '3000000000');
		await page
			.getByRole('navigation', { name: 'Storage folders' })
			.getByRole('link', { name: 'bpc', exact: true })
			.click();
		await expect(
			page.getByText('Node capacity increased to 20 GB. Layout version 2 applied.')
		).toHaveCount(0);
		const documents = page.getByRole('link', { name: 'documents', exact: true });
		// Allow room below the explorer so a shorter listing cannot clamp scroll position.
		await page.evaluate(() => (document.body.style.paddingBottom = '500px'));
		await documents.scrollIntoViewIfNeeded();
		const explorerScroll = await page.evaluate(() => scrollY);
		assert.ok(explorerScroll > 0);
		await documents.click();
		await expect(page.getByText('report.pdf', { exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'File explorer', exact: true })).toBeFocused();
		const afterFolderScroll = await page.evaluate(() => scrollY);
		assert.ok(
			Math.abs(afterFolderScroll - explorerScroll) < 2,
			`Folder navigation preserves scroll position (${explorerScroll} -> ${afterFolderScroll})`
		);
		await page.evaluate(() => (document.body.style.paddingBottom = ''));
		const downloadEvent = page.waitForEvent('download');
		await page.getByRole('link', { name: 'Download report.pdf', exact: true }).click();
		const chunks = [];
		for await (const chunk of await (await downloadEvent).createReadStream()) chunks.push(chunk);
		assert.equal(Buffer.concat(chunks).toString(), 'original report');
		await page.getByLabel('Upload to this folder').setInputFiles({
			name: 'new.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('browser upload')
		});
		await page.getByRole('button', { name: 'Upload file', exact: true }).click();
		await expect(page.getByText(/^Uploaded .+new\.txt\.$/)).toBeVisible();
		await closeSuccess();
		assert.ok(
			Array.from(f.objects.keys()).some(
				(key) => key.startsWith('documents/') && key.endsWith('-new.txt')
			)
		);
		assert.doesNotMatch(await page.content(), /SECRET|PRIVATE-KEY-NAME|GKtest/);
		await page.setViewportSize({ width: 390, height: 844 });
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
		mkdirSync(path.resolve('.tmp'), { recursive: true });
		await page.screenshot({
			path: path.resolve('.tmp/storage-settings-mobile.png'),
			fullPage: true
		});
		await page.getByRole('button', { name: 'Delete file report.pdf', exact: true }).click();
		const confirmation = page.getByRole('dialog', { name: 'Delete file?' });
		await expect(confirmation).toBeVisible();
		await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
		assert.equal(f.objects.has('documents/report.pdf'), true);
		f.state.deleteErrorKey = 'documents/report.pdf';
		await page.getByRole('button', { name: 'Delete file report.pdf', exact: true }).click();
		await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
		const failure = page.getByRole('dialog', { name: 'Something went wrong', exact: true });
		await expect(failure).toContainText('Some files may already be deleted');
		assert.doesNotMatch(await failure.textContent(), /SECRET/);
		await failure.getByRole('button', { name: 'Close', exact: true }).click();
		assert.equal(f.objects.has('documents/report.pdf'), true);
		f.state.deleteErrorKey = null;
		await page.getByRole('button', { name: 'Delete file report.pdf', exact: true }).click();
		await page.screenshot({
			path: path.resolve('.tmp/storage-delete-confirmation.png'),
			fullPage: true
		});
		await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
		await expect(confirmation).not.toBeVisible();
		await closeSuccess();
		await expect(page.getByText('report.pdf', { exact: true })).toHaveCount(0);
		assert.equal(f.objects.has('documents/report.pdf'), false);
		assert.equal(f.objects.size, 1);
		await page
			.getByRole('navigation', { name: 'Storage folders' })
			.getByRole('link', { name: 'bpc', exact: true })
			.click();
		await page.getByRole('button', { name: 'Delete folder documents', exact: true }).click();
		const folderConfirmation = page.getByRole('dialog', { name: 'Delete folder?' });
		await expect(folderConfirmation).toContainText('all files and subfolders inside this folder');
		await folderConfirmation.getByRole('button', { name: 'Delete', exact: true }).click();
		await expect(folderConfirmation).not.toBeVisible();
		await closeSuccess();
		await expect(page.getByText('This folder is empty.', { exact: true })).toBeVisible();
		assert.equal(f.objects.size, 0);
		for (const role of ['student', 'registrar']) {
			await page.context().addCookies([{ name: 'test-role', value: role, url: origin }]);
			assert.equal((await page.goto(url)).status(), 403);
			assert.ok(remoteRequests.length >= 3);
			const remoteCallCount = f.calls.length;
			for (const request of remoteRequests) {
				const denied = await page.request.post(request.url, {
					data: request.body,
					headers: { 'Content-Type': request.contentType, Origin: origin }
				});
				assert.match(await denied.text(), /403/);
			}
			assert.equal(f.calls.length, remoteCallCount);
			assert.equal(
				(
					await page.request.post(url + '/upload', {
						multipart: {
							file: { name: 'denied.txt', mimeType: 'text/plain', buffer: Buffer.from('denied') }
						},
						headers: { Origin: origin }
					})
				).status(),
				403
			);
			assert.equal(
				(await page.request.get(url + '/download?key=documents%2Freport.pdf')).status(),
				403
			);
		}
		assert.deepEqual(errors, []);
	} finally {
		await browser?.close();
		await vite?.close();
		assert.equal(path.dirname(root), workspace);
		rmSync(root, { recursive: true, force: true });
	}
});
