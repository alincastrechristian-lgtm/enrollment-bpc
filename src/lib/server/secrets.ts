import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';

export const SECRET_COLUMNS = {
	senderPassword: 'sender_password',
	resendApiKey: 'resend_api_key',
	geminiApiKey: 'gemini_api_key',
	openaiApiKey: 'openai_api_key'
} as const;
export type SecretField = keyof typeof SECRET_COLUMNS;
const prefix = 'enc:v1:';

export function encryptionKey(material: string | undefined): Buffer {
	if (!material || !/^(?:[a-f\d]{2}){32,64}$/i.test(material))
		throw new Error('DATA_ENCRYPTION_KEY must contain 32 to 64 random bytes encoded as hex.');
	// Support both 32-byte and 64-byte high-entropy deployment secrets without truncation.
	return createHash('sha256').update(Buffer.from(material, 'hex')).digest();
}

export function encryptSecret(
	value: string,
	material: string | undefined,
	field: SecretField
): string {
	if (!value) return value;
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', encryptionKey(material), iv);
	cipher.setAAD(Buffer.from(`enrollment-system:system_settings:${field}:v1`));
	const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	// getAuthTag is available only after final(). IV is generated independently for every write.
	return `${prefix}${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSecret(
	value: string,
	material: string | undefined,
	field: SecretField
): string {
	// Compatibility for existing rows until the atomic startup migration has run.
	if (!value || !value.startsWith('enc:')) return value;
	try {
		if (!value.startsWith(prefix)) throw new Error();
		const parts = value.slice(prefix.length).split(':');
		if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part)))
			throw new Error();
		const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, 'base64url'));
		if (iv.length !== 12 || tag.length !== 16 || !encrypted.length) throw new Error();
		const decipher = createDecipheriv('aes-256-gcm', encryptionKey(material), iv);
		decipher.setAAD(Buffer.from(`enrollment-system:system_settings:${field}:v1`));
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
	} catch {
		// Never include ciphertext, keys, provider credentials, or crypto internals in errors.
		throw new Error(
			'Stored credentials could not be decrypted. Check DATA_ENCRYPTION_KEY; keep the original key when restoring a database.'
		);
	}
}

export function migrateSettingsSecrets(
	database: Database.Database,
	material: string | undefined,
	direction: 'encrypt' | 'decrypt' = 'encrypt'
) {
	encryptionKey(material);
	const columns = Object.values(SECRET_COLUMNS);
	return database
		.transaction(() => {
			const rows = database
				.prepare(`SELECT id, ${columns.join(', ')} FROM system_settings`)
				.all() as ({ id: number } & Record<(typeof columns)[number], string | null>)[];
			let changed = 0;
			for (const row of rows) {
				const values = Object.entries(SECRET_COLUMNS).map(([field, column]) => {
					const stored = row[column as (typeof columns)[number]];
					if (!stored) return stored;
					const plain = decryptSecret(stored, material, field as SecretField);
					const next =
						direction === 'decrypt'
							? plain
							: stored.startsWith(prefix)
								? stored
								: encryptSecret(plain, material, field as SecretField);
					if (next !== stored) changed++;
					return next;
				});
				if (values.some((value, i) => value !== row[columns[i]]))
					database
						.prepare(
							`UPDATE system_settings SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`
						)
						.run(...values, row.id);
			}
			return changed;
		})
		.immediate();
}
