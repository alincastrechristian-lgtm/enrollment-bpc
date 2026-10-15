import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('container runtime includes the schema dependencies needed by seeding', (t) => {
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
	const output = execFileSync(
		process.execPath,
		['--import', 'tsx', path.join(runtime, 'src/lib/schema.ts')],
		{ cwd: runtime, encoding: 'utf8', timeout: 30000 }
	);
	assert.equal(output, '');
});
