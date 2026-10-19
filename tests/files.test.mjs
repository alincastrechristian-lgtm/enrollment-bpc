import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import test from 'node:test';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { sveltekit } from '@sveltejs/kit/vite';
import { createServer as createViteServer } from 'vite';
import { error, isHttpError } from '@sveltejs/kit';
import * as kit from '@sveltejs/kit';
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

function files(env = {}, credentials) {
	return load('src/lib/server/garage/files.ts', {
		'$app/env/private': { GARAGE_REGION: 'garage', ...env },
		'./index': { GARAGE_BUCKET: 'bpc' },
		'./credentials': { getGarageCredentials: () => credentials }
	});
}

function uploadRequest(file = new File(['hello'], 'sample.txt')) {
	const form = new FormData();
	if (file !== null) form.set('file', file);
	return new Request('http://app.test/test/files', { method: 'POST', body: form });
}

function status(expected) {
	return (caught) => isHttpError(caught) && caught.status === expected;
}

async function s3Fixture(t) {
	const objects = new Map();
	const calls = [];
	const xml = (value) =>
		String(value).replace(
			/[&<>"']/g,
			(char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]
		);
	const server = createServer(async (request, response) => {
		const url = new URL(request.url, 'http://s3.test');
		const chunks = [];
		for await (const chunk of request) chunks.push(chunk);
		const body = Buffer.concat(chunks);
		calls.push({ method: request.method, url, headers: request.headers, body });
		const key = decodeURIComponent(url.pathname.slice('/bpc/'.length));
		if (request.method === 'PUT') {
			objects.set(key, body);
			response.setHeader('ETag', '"test-etag"');
			return response.end();
		}
		if (url.searchParams.get('list-type') === '2') {
			const prefix = url.searchParams.get('prefix');
			response.setHeader('Content-Type', 'application/xml');
			return response.end(
				`<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>false</IsTruncated>${Array.from(
					objects
				)
					.filter(([key]) => key.startsWith(prefix))
					.map(
						([key, body]) =>
							`<Contents><Key>${xml(key)}</Key><Size>${body.length}</Size><LastModified>2026-10-18T00:00:00.000Z</LastModified></Contents>`
					)
					.join('')}</ListBucketResult>`
			);
		}
		if (objects.has(key)) {
			response.setHeader('Content-Length', objects.get(key).length);
			return response.end(objects.get(key));
		}
		response.writeHead(404, { 'Content-Type': 'application/xml' });
		response.end('<Error><Code>NoSuchKey</Code><Message>Not found</Message></Error>');
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
		GARAGE_API_ENDPOINT: `http://127.0.0.1:${server.address().port}`,
		GARAGE_REGION: 'garage'
	};
	return {
		objects,
		calls,
		env,
		...files(env, { accessKeyId: 'GKtest', secretAccessKey: 'test-secret-access-key' })
	};
}

test('upload parser accepts ordinary and empty files and rejects missing or malformed input', async () => {
	const f = files();
	assert.equal(await (await f.readFileUpload(uploadRequest())).text(), 'hello');
	assert.equal((await f.readFileUpload(uploadRequest(new File([], 'empty.txt')))).size, 0);
	await assert.rejects(() => f.readFileUpload(uploadRequest(null)), status(400));
	await assert.rejects(() => f.readFileUpload(uploadRequest('not a file')), status(400));
	await assert.rejects(
		() => f.readFileUpload(new Request('http://app.test', { method: 'POST', body: 'text' })),
		status(415)
	);
	await assert.rejects(
		() =>
			f.readFileUpload(
				new Request('http://app.test', {
					method: 'POST',
					body: 'broken',
					headers: { 'Content-Type': 'multipart/form-data; boundary=missing' }
				})
			),
		status(400)
	);
});

test('file and body limits hold even with absent or misleading Content-Length', async () => {
	const f = files();
	const huge = new File([new Uint8Array(f.MAX_FILE_BYTES + 1)], 'large.bin');
	await assert.rejects(() => f.readFileUpload(uploadRequest(huge)), status(413));
	const lied = new Request('http://app.test/test/files', {
		method: 'POST',
		body: new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(f.MAX_FILE_BYTES + 128 * 1024));
				controller.close();
			}
		}),
		duplex: 'half',
		headers: { 'Content-Type': 'multipart/form-data; boundary=test', 'Content-Length': '1' }
	});
	await assert.rejects(() => f.readFileUpload(lied), status(413));
	const declared = uploadRequest();
	declared.headers.set('Content-Length', String(f.MAX_FILE_BYTES * 2));
	await assert.rejects(() => f.readFileUpload(declared), status(413));
});

test('AWS S3 SDK round-trip preserves bytes, signs requests, isolates users and avoids overwrites', async (t) => {
	const f = await s3Fixture(t);
	const bytes = Buffer.from([0, 255, 10, 13, 60, 62, 128]);
	await f.uploadFile('user-1', new File([bytes], 'résumé & notes.html'));
	await f.uploadFile('user-1', new File(['second'], 'résumé & notes.html'));
	await f.uploadFile('user-2', new File(['private'], 'other.txt'));
	assert.equal(f.objects.size, 3);
	const listed = await f.listFiles('user-1');
	assert.equal(listed.files.length, 2);
	assert.ok(listed.files.every((file) => file.key.startsWith('test-files/user-1/')));
	const response = await f.downloadFile('user-1', listed.files[0].key);
	assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
	assert.match(response.headers.get('Content-Disposition'), /^attachment;/);
	assert.ok(
		response.headers.get('Content-Disposition').includes('r%C3%A9sum%C3%A9%20%26%20notes.html')
	);
	assert.equal(response.headers.get('Content-Type'), 'application/octet-stream');
	assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
	assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
	const before = f.calls.length;
	await assert.rejects(() => f.downloadFile('user-2', listed.files[0].key), status(404));
	assert.equal(f.calls.length, before);
	await assert.rejects(
		() => f.downloadFile('user-1', 'test-files/user-1/../../user-2/private.txt'),
		status(404)
	);
	assert.equal(f.calls.length, before);
	assert.ok(f.calls.every((call) => call.headers.authorization.includes('Credential=GKtest/')));
	assert.ok(
		f.calls.every((call) => call.headers.authorization.includes('/garage/s3/aws4_request'))
	);
	assert.ok(f.calls.every((call) => call.url.pathname.startsWith('/bpc')));
	assert.ok(
		f.calls.filter((call) => call.method === 'PUT').every((call) => !call.headers['x-amz-trailer'])
	);
	assert.equal(await f.uploadFile('user-1', new File(['dots'], '..')), 'file');
});

test('S3 listing passes pagination cursor and never returns another user prefix', async () => {
	const sent = [];
	const f = load('src/lib/server/garage/files.ts', {
		'$app/env/private': {
			GARAGE_API_ENDPOINT: 'http://s3.test',
			GARAGE_REGION: 'garage'
		},
		'./index': { GARAGE_BUCKET: 'bpc' },
		'./credentials': {
			getGarageCredentials: () => ({ accessKeyId: 'id', secretAccessKey: 'secret' })
		},
		'@aws-sdk/client-s3': {
			S3Client: class {
				async send(command) {
					sent.push(command.input);
					return {
						Contents: [
							{ Key: 'test-files/u/a/file.txt', Size: 4 },
							{ Key: 'test-files/other/a/private.txt' }
						],
						IsTruncated: true,
						NextContinuationToken: 'next'
					};
				}
			},
			ListObjectsV2Command: class {
				constructor(input) {
					this.input = input;
				}
			}
		}
	});
	const result = await f.listFiles('u', 'cursor');
	assert.deepEqual(
		result.files.map((file) => file.name),
		['file.txt']
	);
	assert.equal(result.nextToken, 'next');
	assert.deepEqual(sent, [
		{ Bucket: 'bpc', Prefix: 'test-files/u/', MaxKeys: 100, ContinuationToken: 'cursor' }
	]);
});

test('storage credentials are required before any S3 operation', async () => {
	const f = files();
	assert.equal(f.fileStorageConfigured(), false);
	await assert.rejects(() => f.uploadFile('u', new File(['x'], 'x.txt')), status(503));
	await assert.rejects(() => f.listFiles('u'), status(503));
});

function routes(storage) {
	function validateUser(locals) {
		if (!locals.user || !locals.session) error(401, 'Unauthorized');
	}
	const dependencies = {
		'#lib/server/auth.js': { validateUser },
		'#lib/server/garage/files.js': storage,
		'$app/paths': { resolve: (path) => path }
	};
	return {
		...load('src/routes/test/files/+page.server.ts', dependencies),
		...load('src/routes/test/files/download/+server.ts', dependencies)
	};
}

const locals = { user: { id: 'u' }, session: { id: 'session' } };
function event(overrides = {}) {
	return {
		locals,
		request: uploadRequest(),
		url: new URL('http://app.test/test/files'),
		setHeaders() {},
		...overrides
	};
}

test('files page, upload action, and download endpoint enforce authentication', async () => {
	const r = routes({});
	await assert.rejects(
		() => r.load(event({ locals: {} })),
		(caught) => caught.status === 303 && caught.location === '/login'
	);
	await assert.rejects(() => r.actions.default(event({ locals: {} })), status(401));
	await assert.rejects(() => r.GET(event({ locals: {} })), status(401));
});

test('authenticated route round-trip and errors keep provider secrets out of responses', async (t) => {
	const f = await s3Fixture(t);
	const r = routes(f);
	const result = await r.actions.default(event());
	assert.deepEqual(result, { uploaded: 'sample.txt' });
	const data = await r.load(event());
	assert.equal(data.files.length, 1);
	assert.doesNotMatch(JSON.stringify(data), /GKtest|test-secret-access-key/);
	const url = new URL('http://app.test/test/files/download');
	url.searchParams.set('key', data.files[0].key);
	assert.equal(await (await r.GET(event({ url }))).text(), 'hello');
	url.searchParams.set('key', 'test-files/u/missing/file.txt');
	await assert.rejects(() => r.GET(event({ url })), status(404));
	await assert.rejects(() => r.GET(event()), status(400));
	const broken = routes({
		fileStorageConfigured: () => true,
		listFiles: async () => {
			throw new Error('SECRET');
		},
		readFileUpload: f.readFileUpload,
		uploadFile: async () => {
			throw new Error('SECRET');
		},
		downloadFile: async () => {
			throw new Error('SECRET');
		}
	});
	assert.doesNotMatch(JSON.stringify(await broken.load(event())), /SECRET/);
	const failure = await broken.actions.default(event());
	assert.equal(failure.status, 503);
	assert.doesNotMatch(JSON.stringify(failure), /SECRET/);
	await assert.rejects(
		() => broken.GET(event({ url })),
		(caught) => status(503)(caught) && !caught.body.message.includes('SECRET')
	);
	assert.equal((await r.actions.default(event({ request: uploadRequest(null) }))).status, 400);
});

test('automatic setup needs no S3 env keys and browser uploads/downloads original bytes', async (t) => {
	const s3 = await s3Fixture(t);
	const adminCalls = [];
	let managedKey;
	let clusterLayout = { version: 0, roles: [], stagedRoleChanges: [], stagedParameters: null };
	let assignedRole;
	const admin = createServer(async (request, response) => {
		const url = new URL(request.url, 'http://admin.test');
		const chunks = [];
		for await (const chunk of request) chunks.push(chunk);
		adminCalls.push(url.pathname);
		let data = { id: 'bucket-id', globalAliases: ['bpc'] };
		if (url.pathname === '/v2/GetClusterLayout') data = clusterLayout;
		if (url.pathname === '/v2/GetClusterStatus')
			data = {
				layoutVersion: clusterLayout.version,
				nodes: [{ id: 'a'.repeat(64), isUp: true, draining: false }]
			};
		if (url.pathname === '/v2/UpdateClusterLayout') {
			const body = JSON.parse(Buffer.concat(chunks).toString());
			assignedRole = body.roles[0];
			data = clusterLayout = { ...clusterLayout, stagedRoleChanges: body.roles };
		}
		if (url.pathname === '/v2/ApplyClusterLayout') {
			clusterLayout = {
				...clusterLayout,
				version: 1,
				roles: [assignedRole],
				stagedRoleChanges: []
			};
			data = { layout: clusterLayout };
		}
		if (url.pathname === '/v2/GetKeyInfo') {
			if (!managedKey) {
				response.writeHead(404, { 'Content-Type': 'application/json' });
				return response.end(JSON.stringify({ code: 'NoSuchAccessKey' }));
			}
			data = managedKey;
		}
		if (url.pathname === '/v2/CreateKey') {
			const body = JSON.parse(Buffer.concat(chunks).toString());
			data = managedKey = {
				accessKeyId: 'GKtest',
				secretAccessKey: 'test-secret-access-key',
				expired: false,
				name: body.name
			};
		}
		response.writeHead(200, { 'Content-Type': 'application/json' });
		response.end(JSON.stringify(data));
	});
	await new Promise((resolve) => admin.listen(0, '127.0.0.1', resolve));
	t.after(
		() =>
			new Promise((resolve) => {
				admin.closeAllConnections();
				admin.close(resolve);
			})
	);
	const workspace = path.resolve();
	const root = mkdtempSync(path.join(workspace, '.tmp-files-browser-'));
	const source = (file) => readFileSync(file, 'utf8');
	const env = {
		...s3.env,
		DATABASE_URL: path.join(root, 'storage.db'),
		ORIGIN: 'http://localhost',
		BETTER_AUTH_SECRET: 'test-only-secret',
		GARAGE_ADMIN_ENDPOINT: `http://127.0.0.1:${admin.address().port}`,
		GARAGE_ADMIN_TOKEN: 'test-admin-token'
	};
	const fixtures = {
		'package.json': JSON.stringify({ type: 'module', imports: { '#lib/*': './src/lib/*' } }),
		'.env': Object.entries(env)
			.map(([key, value]) => `${key}=${value}`)
			.join('\n'),
		'src/env.ts': source('src/env.ts'),
		'src/app.html':
			'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">%sveltekit.head%</head><body><div>%sveltekit.body%</div></body></html>',
		'src/hooks.server.js':
			"export {ensureGarageBucket as init} from '#lib/server/garage/index.js';export const handle=({event,resolve})=>{event.locals.user={id:'browser-user'};event.locals.session={id:'test-session'};return resolve(event);};",
		'src/lib/server/auth.js':
			"import {error} from '@sveltejs/kit';export function validateUser(locals){if(!locals.user||!locals.session)error(401,'Unauthorized');}",
		'src/lib/schema.ts': source('src/lib/schema.ts'),
		'src/lib/Roles.ts': source('src/lib/Roles.ts'),
		'src/lib/email.ts': source('src/lib/email.ts'),
		'src/lib/server/db/index.ts': `import Database from 'better-sqlite3';import {drizzle} from 'drizzle-orm/better-sqlite3';import * as schema from '../../schema';const client=new Database(':memory:');client.exec(${JSON.stringify(source('drizzle/0033_garage_storage.sql'))});export const db=drizzle(client,{schema});`,
		'src/lib/server/garage/index.ts': source('src/lib/server/garage/index.ts'),
		'src/lib/server/garage/credentials.ts': source('src/lib/server/garage/credentials.ts'),
		'src/lib/server/garage/layout.ts': source('src/lib/server/garage/layout.ts'),
		'src/lib/server/garage/files.ts': source('src/lib/server/garage/files.ts'),
		'src/routes/+layout.svelte':
			'<script>import {onMount} from "svelte";let {children}=$props();onMount(()=>{window.appReady=true;});</script>{@render children()}',
		'src/routes/test/+page.svelte': '<h1>Test</h1>',
		'src/routes/+error.svelte': '<h1>Request failed</h1>',
		'src/routes/test/files/+page.svelte': source('src/routes/test/files/+page.svelte'),
		'src/routes/test/files/+page.server.ts': source('src/routes/test/files/+page.server.ts'),
		'src/routes/test/files/download/+server.ts': source('src/routes/test/files/download/+server.ts')
	};
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
			plugins: [sveltekit()],
			server: { host: '127.0.0.1', port: 0 }
		});
		await vite.listen();
		browser = await chromium.launch({ headless: true, channel: 'msedge' });
		const page = await browser.newPage();
		page.setDefaultTimeout(15_000);
		const clientErrors = [];
		page.on('pageerror', (error) => clientErrors.push(error.message));
		await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/test/files`);
		await page.waitForFunction(() => window.appReady);
		await expect(page.getByText('No files uploaded yet.')).toBeVisible();
		const bytes = Buffer.from([0, 255, 10, 13, 128, 60, 62]);
		await page
			.getByLabel('Choose a file')
			.setInputFiles({ name: 'browser.txt', mimeType: 'text/plain', buffer: bytes });
		await page.getByRole('button', { name: 'Upload file', exact: true }).click();
		await expect(page.getByText('Uploaded browser.txt.', { exact: true })).toBeVisible();
		const downloadEvent = page.waitForEvent('download');
		await page.getByRole('link', { name: 'Download browser.txt', exact: true }).click();
		const download = await downloadEvent;
		assert.equal(download.suggestedFilename(), 'browser.txt');
		const chunks = [];
		for await (const chunk of await download.createReadStream()) chunks.push(chunk);
		assert.deepEqual(Buffer.concat(chunks), bytes);
		assert.doesNotMatch(await page.content(), /GKtest|test-secret-access-key|test-admin-token/);
		assert.equal(adminCalls.filter((pathname) => pathname === '/v2/CreateKey').length, 1);
		assert.equal(assignedRole.capacity, 10_000_000_000);
		assert.equal(clusterLayout.version, 1);
		assert.ok(
			adminCalls.indexOf('/v2/ApplyClusterLayout') < adminCalls.indexOf('/v2/GetBucketInfo')
		);
		assert.deepEqual(clientErrors, []);
	} finally {
		await browser?.close();
		await vite?.close();
		assert.equal(path.dirname(root), workspace);
		rmSync(root, { recursive: true, force: true });
	}
});
