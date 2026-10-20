import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import {
	encryptSecret,
	decryptSecret,
	encryptionKey,
	migrateSettingsSecrets
} from '../src/lib/server/secrets';

const key = 'a1'.repeat(32);
test('authenticated encryption is randomized, field-bound and preserves every credential character', () => {
	for (const material of [key, 'b2'.repeat(64)]) {
		const plain = '  secret-密碼-🔑\n ';
		const a = encryptSecret(plain, material, 'senderPassword');
		const b = encryptSecret(plain, material, 'senderPassword');
		assert.notEqual(a, b);
		assert.match(a, /^enc:v1:/);
		assert(!a.includes(plain));
		assert.equal(decryptSecret(a, material, 'senderPassword'), plain);
		for (const [changed, materialKey, field] of [
			[a, 'c3'.repeat(32), 'senderPassword'],
			[a, material, 'openaiApiKey'],
			[a.slice(0, -3) + 'xxx', material, 'senderPassword'],
			['enc:v2:unknown', material, 'senderPassword'],
			['enc:v1:broken', material, 'senderPassword']
		] as const) {
			assert.throws(
				() => decryptSecret(changed, materialKey, field),
				(cause: unknown) => {
					assert(cause instanceof Error);
					assert(!cause.message.includes(a));
					assert(!cause.message.includes(plain));
					return /could not be decrypted/.test(cause.message);
				}
			);
		}
	}
	for (const invalid of [undefined, '', 'password', 'ab'.repeat(31), 'zz'.repeat(32)])
		assert.throws(() => encryptionKey(invalid), /DATA_ENCRYPTION_KEY/);
	assert.equal(decryptSecret('legacy', key, 'geminiApiKey'), 'legacy');
	assert.equal(encryptSecret('', undefined, 'geminiApiKey'), '');
});

function fixture(t: test.TestContext) {
	const db = new Database(':memory:');
	t.after(() => db.close());
	migrate(drizzle(db), { migrationsFolder: 'drizzle' });
	db.prepare(
		'INSERT INTO system_settings(id, sender_password, resend_api_key, gemini_api_key, openai_api_key, sender_name) VALUES (1,?,?,?,?,?)'
	).run('smtp-secret', 'resend-secret', null, '', 'Keep this name');
	return db;
}

test('upgrade is atomic and idempotent; rollback preserves blanks, nulls and unrelated settings', (t) => {
	const db = fixture(t);
	const original = db.prepare('SELECT * FROM system_settings').get();
	assert.equal(migrateSettingsSecrets(db, key), 2);
	const encrypted = db.prepare('SELECT * FROM system_settings').get() as Record<string, unknown>;
	assert.match(encrypted.sender_password as string, /^enc:v1:/);
	assert.match(encrypted.resend_api_key as string, /^enc:v1:/);
	assert.equal(encrypted.gemini_api_key, null);
	assert.equal(encrypted.openai_api_key, '');
	assert.equal(encrypted.sender_name, 'Keep this name');
	assert.equal(migrateSettingsSecrets(db, key), 0);
	assert.deepEqual(db.prepare('SELECT * FROM system_settings').get(), encrypted);
	assert.throws(() => migrateSettingsSecrets(db, 'ff'.repeat(32)), /could not be decrypted/);
	assert.deepEqual(db.prepare('SELECT * FROM system_settings').get(), encrypted);
	assert.equal(migrateSettingsSecrets(db, key, 'decrypt'), 2);
	assert.deepEqual(db.prepare('SELECT * FROM system_settings').get(), original);
});

test('one damaged value rolls back the whole upgrade, with no partially encrypted fields', (t) => {
	const db = fixture(t);
	db.prepare("UPDATE system_settings SET openai_api_key='enc:v1:damaged'").run();
	const before = db.prepare('SELECT * FROM system_settings').get();
	assert.throws(() => migrateSettingsSecrets(db, key), /could not be decrypted/);
	assert.deepEqual(db.prepare('SELECT * FROM system_settings').get(), before);
});
