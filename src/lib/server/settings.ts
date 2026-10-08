import { eq } from 'drizzle-orm';
import { systemSettings } from '../schema';
import { db } from './db';

export async function getSystemSettings() {
	let settings = await db.query.systemSettings.findFirst({
		where: eq(systemSettings.id, 1)
	});

	if (settings) {
		return settings;
	}

	// if settings do not exist, insert a default row with id 1 and return it
	await db.insert(systemSettings).values({ id: 1 }).onConflictDoNothing();

	settings = await db.query.systemSettings.findFirst({
		where: eq(systemSettings.id, 1)
	});

	if (!settings) {
		throw new Error('System settings could not be initialized');
	}

	return settings;
}
