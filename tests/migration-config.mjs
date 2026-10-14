import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Historical migration tests must stop at their target, regardless of later migrations.
export function migrationConfigThrough(t, lastIndex) {
	const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
	const root = mkdtempSync(path.join(tmpdir(), 'enrollment-migrations-'));
	t.after(() => {
		const resolved = path.resolve(root);
		if (path.dirname(resolved) !== path.resolve(tmpdir()))
			throw new Error('Unexpected migration test directory');
		rmSync(resolved, { recursive: true, force: true });
	});
	mkdirSync(path.join(root, 'meta'));
	journal.entries = journal.entries.filter((entry) => entry.idx <= lastIndex);
	writeFileSync(path.join(root, 'meta', '_journal.json'), JSON.stringify(journal));
	for (const entry of journal.entries) {
		copyFileSync(path.join('drizzle', entry.tag + '.sql'), path.join(root, entry.tag + '.sql'));
	}
	return { migrationsFolder: root };
}
