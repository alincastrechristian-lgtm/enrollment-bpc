import { eq } from 'drizzle-orm';
import { systemSettings } from '../schema';
import { db } from './db';
import { DATA_ENCRYPTION_KEY } from '$app/env/private';
import { SECRET_COLUMNS, encryptSecret, decryptSecret } from './secrets';

type SecretSettings = Partial<Record<keyof typeof SECRET_COLUMNS, string | null>>;
export function encryptSettingsSecrets<T extends SecretSettings>(settings: T): T {
	const result = { ...settings };
	for (const field of Object.keys(SECRET_COLUMNS) as (keyof typeof SECRET_COLUMNS)[]) {
		const value = settings[field];
		if (typeof value === 'string')
			Object.assign(result, { [field]: encryptSecret(value, DATA_ENCRYPTION_KEY, field) });
	}
	return result;
}

export function decryptSettingsSecrets<T extends SecretSettings>(settings: T): T {
	const result = { ...settings };
	for (const field of Object.keys(SECRET_COLUMNS) as (keyof typeof SECRET_COLUMNS)[]) {
		const value = settings[field];
		if (typeof value === 'string')
			Object.assign(result, { [field]: decryptSecret(value, DATA_ENCRYPTION_KEY, field) });
	}
	return result;
}

export async function getSystemSettings() {
	let settings = await db.query.systemSettings.findFirst({
		where: eq(systemSettings.id, 1)
	});

	if (settings) {
		return decryptSettingsSecrets(settings);
	}

	// if settings do not exist, insert a default row with id 1 and return it
	await db.insert(systemSettings).values({ id: 1 }).onConflictDoNothing();

	settings = await db.query.systemSettings.findFirst({
		where: eq(systemSettings.id, 1)
	});

	if (!settings) {
		throw new Error('System settings could not be initialized');
	}

	return decryptSettingsSecrets(settings);
}
