import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';

test('defense database uses only synthetic records, keeps schema and relationships, and cannot overwrite files', (t) => {
	const parent = resolve('.tmp');
	mkdirSync(parent, { recursive: true });
	const directory = mkdtempSync(resolve(parent, 'defense-test-'));
	assert(directory.startsWith(parent));
	t.after(() => rmSync(directory, { recursive: true }));
	const file = resolve(directory, 'defense.db');
	execFileSync(process.execPath, ['scripts/defense-database.mjs', file], {
		env: { ...process.env, DATABASE_URL: 'must-not-be-opened.db', GEMINI_API_KEY: 'must-not-copy' }
	});
	const db = new Database(file, { readonly: true });
	try {
		assert.equal(db.prepare('SELECT count(*) AS n FROM user').get().n, 3);
		assert.equal(db.prepare('SELECT count(*) AS n FROM enrollment').get().n, 1);
		assert.equal(db.prepare('SELECT count(*) AS n FROM enrollment_subject').get().n, 1);
		assert.deepEqual(db.pragma('foreign_key_check'), []);
		for (const { email } of db.prepare('SELECT email FROM user').all())
			assert(email.endsWith('@example.invalid'));
		for (const table of [
			'session',
			'account',
			'verification',
			'clearance_submission',
			'required_document',
			'garage_storage'
		])
			assert.equal(db.prepare(`SELECT count(*) AS n FROM "${table}"`).get().n, 0, table);
		const settings = db.prepare('SELECT * FROM system_settings').get();
		for (const field of ['sender_password', 'resend_api_key', 'gemini_api_key', 'openai_api_key'])
			assert(!settings[field]);
		assert.throws(() => db.prepare("UPDATE user SET role='admin'").run(), /readonly/i);
	} finally {
		db.close();
	}
	const before = readFileSync(file);
	assert.throws(() =>
		execFileSync(process.execPath, ['scripts/defense-database.mjs', file], { stdio: 'pipe' })
	);
	assert.deepEqual(readFileSync(file), before);
	const compose = readFileSync('docker-compose.defense.yml', 'utf8');
	assert(compose.includes('127.0.0.1:4983:4983'));
	assert(compose.includes('./defense:/databases:ro'));
	assert(!compose.includes('DATA_ENCRYPTION_KEY'));
	assert(!compose.includes('./data:'));
});
