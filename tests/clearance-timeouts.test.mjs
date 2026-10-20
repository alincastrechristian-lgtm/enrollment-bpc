import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import sharp from 'sharp';
import * as kit from '@sveltejs/kit';
const require = createRequire(import.meta.url);
function load(file, deps = {}) {
	const source = readFileSync(file, 'utf8').replaceAll(
		'import.meta.url',
		JSON.stringify(pathToFileURL(resolve(file)).href)
	);
	const code = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	}).outputText;
	const out = {};
	new Function('require', 'exports', code)((id) => deps[id] ?? require(id), out);
	return out;
}
const deadlines = load('src/lib/clearance/deadline.ts');
const core = load('src/lib/clearance/clearance.ts');
function checker(createWorker) {
	return load('src/lib/server/clearance-checker.ts', {
		'@sveltejs/kit': kit,
		'#lib/clearance/deadline.js': deadlines,
		'#lib/clearance/clearance.js': core,
		'#lib/clearance/definition.js': {},
		'#lib/clearance/report.js': { checkOfficeMarks: () => [] },
		'#lib/clearance/printed.js': {},
		'#lib/clearance/identity-presence.js': {},
		'tesseract.js': { createWorker, PSM: { SPARSE_TEXT: 11 } }
	});
}
const definition = { corners: core.UNIT_CORNERS, areas: [], officeRows: [] };
const term = { semester: '2', schoolYear: '2025-2026' };
async function sample(service) {
	const bytes = await sharp({
		create: { width: 600, height: 500, channels: 3, background: '#fff' }
	})
		.png()
		.toBuffer();
	return { bytes, image: await service.decodeClearance(bytes, 'image/png') };
}
test('deadline aborts pending work, rejects late results, and never runs work for an already cancelled request', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	let finish, signal;
	const active = deadlines.withDeadline((s) => {
		signal = s;
		return new Promise((resolve) => (finish = resolve));
	}, 100);
	const failed = assert.rejects(active, (cause) => cause.name === 'TimeoutError');
	t.mock.timers.tick(100);
	await failed;
	assert(signal.aborted);
	finish('late');
	const abort = new AbortController();
	abort.abort();
	await assert.rejects(
		deadlines.withDeadline(() => assert.fail('Cancelled work started'), 100, abort.signal)
	);
});
test('stalled OCR shutdown cannot hold the response or prevent a subsequent check', async () => {
	let terminations = 0;
	const service = checker(async () => ({
		terminate: () => {
			terminations++;
			return new Promise(() => {});
		}
	}));
	const { bytes, image } = await sample(service);
	const result = await service.checkClearance(
		bytes,
		image,
		core.UNIT_CORNERS,
		definition,
		term,
		false
	);
	assert.equal(result.identity, 'deferred');
	assert.equal(
		(await service.checkClearance(bytes, image, core.UNIT_CORNERS, definition, term, false))
			.identity,
		'deferred'
	);
	assert.equal(terminations, 2);
});
test('OCR initialization deadline releases the slot and terminates a worker that initializes late', async (t) => {
	let started,
		finish,
		terminations = 0,
		pending = true;
	const entered = new Promise((resolve) => (started = resolve));
	const worker = {
		terminate: async () => {
			terminations++;
		}
	};
	const service = checker(() => {
		started();
		return pending ? new Promise((resolve) => (finish = resolve)) : Promise.resolve(worker);
	});
	const { bytes, image } = await sample(service);
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const active = service.checkClearance(bytes, image, core.UNIT_CORNERS, definition, term, false);
	await entered;
	const failed = assert.rejects(active, (cause) => cause.name === 'TimeoutError');
	t.mock.timers.tick(120_000);
	await failed;
	finish(worker);
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(terminations, 1);
	pending = false;
	assert.equal(
		(await service.checkClearance(bytes, image, core.UNIT_CORNERS, definition, term, false))
			.identity,
		'deferred'
	);
});
