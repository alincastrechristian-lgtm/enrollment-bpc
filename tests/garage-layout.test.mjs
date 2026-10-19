import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { ApiClient } from 'garage_administration_api';

const require = createRequire(import.meta.url);
const { outputText } = ts.transpileModule(readFileSync('src/lib/server/garage/layout.ts', 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
});
const exported = {};
new Function('require', 'exports', outputText)(require, exported);
const { ensureGarageLayout, GarageLayoutError } = exported;

const nodeId = 'a'.repeat(64);
const role = { id: nodeId, capacity: 10_000_000_000, zone: 'dc1', tags: ['bpc-bootstrap'] };
const fresh = { version: 0, roles: [], stagedRoleChanges: [], stagedParameters: null };
const staged = { ...fresh, stagedRoleChanges: [role] };
const active = { ...fresh, version: 1, roles: [role] };
const status = { layoutVersion: 0, nodes: [{ id: nodeId, isUp: true, draining: false }] };

async function fixture(t, responses) {
	const calls = [];
	const server = createServer(async (request, response) => {
		const chunks = [];
		for await (const chunk of request) chunks.push(chunk);
		calls.push({
			path: new URL(request.url, 'http://garage.test').pathname,
			method: request.method,
			authorization: request.headers.authorization,
			body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined
		});
		const next = responses.shift();
		if (!next) return request.socket.destroy();
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
	const client = new ApiClient(`http://127.0.0.1:${server.address().port}`);
	client.authentications.bearerAuth.accessToken = 'layout-test-token';
	client.timeout = 1000;
	return { client, calls, run: () => ensureGarageLayout(client) };
}

test('fresh single node receives 10G layout before version 1 is applied', async (t) => {
	const f = await fixture(t, [
		[200, fresh],
		[200, status],
		[200, staged],
		[200, staged],
		[200, { layout: active }],
		[200, active]
	]);
	await f.run();
	assert.deepEqual(
		f.calls.map((call) => call.path),
		[
			'/v2/GetClusterLayout',
			'/v2/GetClusterStatus',
			'/v2/UpdateClusterLayout',
			'/v2/GetClusterLayout',
			'/v2/ApplyClusterLayout'
		]
	);
	assert.deepEqual(f.calls[2].body, { roles: [role] });
	assert.deepEqual(f.calls[4].body, { version: 1 });
	assert.ok(f.calls.every((call) => call.authorization === 'Bearer layout-test-token'));
	await f.run();
	assert.equal(f.calls.filter((call) => call.method === 'POST').length, 2);
});

test('initialized layouts retain capacity and unrelated pending changes', async (t) => {
	const f = await fixture(t, [
		[
			200,
			{
				...active,
				version: 7,
				roles: [{ ...role, capacity: 50_000_000_000 }],
				stagedRoleChanges: [{ id: 'other', remove: true }],
				stagedParameters: { zoneRedundancy: { atLeast: 2 } }
			}
		]
	]);
	await f.run();
	assert.equal(f.calls.length, 1);
	assert.equal(f.calls[0].method, 'GET');
});

test('interrupted bootstrap resumes only its exact staged 10G assignment', async (t) => {
	const f = await fixture(t, [
		[200, staged],
		[200, status],
		[200, staged],
		[200, { layout: active }]
	]);
	await f.run();
	assert.ok(!f.calls.some((call) => call.path === '/v2/UpdateClusterLayout'));
	assert.equal(f.calls.at(-1).path, '/v2/ApplyClusterLayout');
});

test('unknown staging, layout parameters, or nonfresh empty layouts require manual setup', async (t) => {
	for (const layout of [
		{ ...staged, stagedRoleChanges: [{ ...role, capacity: 20_000_000_000 }] },
		{ ...staged, stagedRoleChanges: [{ ...role, tags: [] }] },
		{ ...staged, stagedRoleChanges: [{ id: nodeId, remove: true }] },
		{ ...staged, stagedRoleChanges: [role, { ...role, id: 'other' }] },
		{ ...fresh, stagedParameters: { zoneRedundancy: { atLeast: 2 } } },
		{ ...fresh, version: 2 }
	]) {
		const f = await fixture(t, [
			[200, layout],
			[200, status]
		]);
		await assert.rejects(f.run, GarageLayoutError);
		assert.ok(f.calls.every((call) => call.method === 'GET'));
	}
});

test('missing, offline, draining, or multiple nodes never receive automatic assignments', async (t) => {
	for (const nodes of [
		[],
		[{ id: nodeId, isUp: false, draining: false }],
		[{ id: nodeId, isUp: true, draining: true }],
		[status.nodes[0], { ...status.nodes[0], id: 'b'.repeat(64) }]
	]) {
		const f = await fixture(t, [
			[200, fresh],
			[200, { ...status, nodes }]
		]);
		await assert.rejects(f.run, /exactly one online node/);
		assert.equal(f.calls.length, 2);
		assert.ok(f.calls.every((call) => call.method === 'GET'));
	}
});

test('malformed layout metadata never causes writes', async (t) => {
	for (const layout of [
		{},
		{ ...fresh, version: -1 },
		{ ...fresh, roles: null },
		{ version: 0, roles: [], stagedRoleChanges: [] }
	]) {
		const f = await fixture(t, [[200, layout]]);
		await assert.rejects(f.run, /invalid cluster layout/);
		assert.equal(f.calls.length, 1);
	}
});

test('concurrent changes are rechecked before apply and never reverted', async (t) => {
	const f = await fixture(t, [
		[200, fresh],
		[200, status],
		[200, staged],
		[200, { ...staged, stagedRoleChanges: [{ ...role, capacity: 30_000_000_000 }] }]
	]);
	await assert.rejects(f.run, /other staged layout changes/);
	assert.ok(
		!f.calls.some((call) => call.path === '/v2/ApplyClusterLayout' || call.path.includes('Revert'))
	);
});

test('bootstrap accepts another instance applying version 1 first', async (t) => {
	const f = await fixture(t, [
		[200, staged],
		[200, status],
		[200, staged],
		[400, { code: 'InvalidRequest' }],
		[200, active]
	]);
	await f.run();
	assert.deepEqual(f.calls.find((call) => call.path === '/v2/ApplyClusterLayout').body, {
		version: 1
	});
});

test('SDK failures are sanitized and failed apply keeps staging for retry', async (t) => {
	for (const responses of [
		[[403, { message: 'layout-test-token' }]],
		[
			[200, fresh],
			[200, status],
			[403, { message: 'layout-test-token' }]
		],
		[
			[200, staged],
			[200, status],
			[200, staged],
			[500, { message: 'layout-test-token' }],
			[200, staged]
		]
	]) {
		const f = await fixture(t, responses);
		await assert.rejects(f.run, (error) => {
			assert.match(error.message, /Garage layout setup failed/);
			assert.doesNotMatch(error.stack, /layout-test-token/);
			assert.equal(error.cause, undefined);
			return true;
		});
		assert.ok(!f.calls.some((call) => call.path.includes('Revert')));
	}
});
