import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { execFileSync, spawnSync } from 'node:child_process';
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function runtimeFixture(t) {
	const workspace = path.resolve();
	// Keep installed dependencies reachable without copying node_modules.
	const runtime = mkdtempSync(path.join(workspace, '.container-runtime-test-'));
	t.after(() => {
		if (path.dirname(path.resolve(runtime)) !== workspace)
			throw new Error('Unexpected container test directory');
		rmSync(runtime, { recursive: true, force: true });
	});
	cpSync('package.json', path.join(runtime, 'package.json'));
	const dockerfile = readFileSync('Dockerfile', 'utf8');
	const copies = dockerfile.matchAll(
		/^COPY --from=build --chown=node:node \/app\/(src\/\S+) \.\/(src\/\S+)\r?$/gm
	);
	for (const [, source, destination] of copies) {
		const target = path.join(runtime, destination);
		mkdirSync(path.dirname(target), { recursive: true });
		cpSync(source, target, { recursive: true });
	}
	return runtime;
}

function start(runtime, overrides = {}) {
	return spawnSync(process.execPath, [path.join(runtime, 'scripts/migrate.mjs')], {
		cwd: runtime,
		encoding: 'utf8',
		timeout: 30000,
		env: {
			...process.env,
			DATABASE_URL: path.join(runtime, 'seed.sqlite'),
			ORIGIN: 'http://localhost:3000',
			BETTER_AUTH_SECRET: 'container-seed-test-secret-for-local-testing-only',
			INITIAL_ADMIN_EMAIL: 'seed.admin@example.com',
			INITIAL_ADMIN_PASSWORD: 'SeedTestPassword123',
			...overrides
		}
	});
}

test('container runtime includes the schema dependencies needed by seeding', (t) => {
	const runtime = runtimeFixture(t);
	const output = execFileSync(
		process.execPath,
		['--import', 'tsx', path.join(runtime, 'src/lib/schema.ts')],
		{ cwd: runtime, encoding: 'utf8', timeout: 30000 }
	);
	assert.equal(output, '');
});

test('startup tolerates seed loading and execution failures, retries, then skips completed seeds', (t) => {
	const runtime = runtimeFixture(t);
	cpSync('drizzle', path.join(runtime, 'drizzle'), { recursive: true });
	cpSync('scripts', path.join(runtime, 'scripts'), { recursive: true });
	const email = path.join(runtime, 'src/lib/email.ts');
	renameSync(email, email + '.hidden');
	const missingModule = start(runtime);
	assert.equal(missingModule.status, 0, missingModule.stderr);
	assert.match(missingModule.stderr, /ERR_MODULE_NOT_FOUND/);
	assert.match(missingModule.stderr, /Continuing startup/);
	renameSync(email + '.hidden', email);

	const failedSeed = start(runtime, { INITIAL_ADMIN_PASSWORD: 'short' });
	assert.equal(failedSeed.status, 0, failedSeed.stderr);
	assert.match(failedSeed.stderr, /Seeding failed:/);
	assert.match(failedSeed.stderr, /Continuing startup/);
	const sqlite = new Database(path.join(runtime, 'seed.sqlite'));
	try {
		assert.equal(sqlite.prepare('SELECT seeded FROM system_settings WHERE id = 1').get().seeded, 0);
		assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM user').get().count, 0);

		const retry = start(runtime);
		assert.equal(retry.status, 0, retry.stderr);
		assert.match(retry.stdout, /Seeding complete!/);
		assert.equal(sqlite.prepare('SELECT seeded FROM system_settings WHERE id = 1').get().seeded, 1);
		assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM user').get().count, 1);
		assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM applicant').get().count, 20);
		assert.deepEqual(sqlite.pragma('foreign_key_check'), []);

		const completed = start(runtime, { INITIAL_ADMIN_PASSWORD: 'short' });
		assert.equal(completed.status, 0, completed.stderr);
		assert.match(completed.stdout, /Database already seeded; skipping/);
		assert.doesNotMatch(completed.stderr, /Continuing startup/);
	} finally {
		sqlite.close();
	}
});

test('startup still fails when database migration fails', (t) => {
	const runtime = runtimeFixture(t);
	cpSync('drizzle', path.join(runtime, 'drizzle'), { recursive: true });
	cpSync('scripts', path.join(runtime, 'scripts'), { recursive: true });
	writeFileSync(path.join(runtime, 'seed.sqlite'), 'invalid database');
	const result = start(runtime);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /not a database/);
	assert.doesNotMatch(result.stderr, /Continuing startup/);
});
