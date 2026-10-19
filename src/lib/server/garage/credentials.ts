import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { and, eq, lte } from 'drizzle-orm';
import { GARAGE_API_ENDPOINT } from '$app/env/private';
import { garageStorage } from '../../schema';
import { db } from '../db';

export type GarageCredentials = { accessKeyId: string; secretAccessKey: string };
let credentials: GarageCredentials | undefined;

export function getGarageCredentials(): GarageCredentials | undefined {
	return credentials;
}

export async function withGarageLock<T>(work: (assertOwned: () => void) => Promise<T>): Promise<T> {
	if (!GARAGE_API_ENDPOINT) throw new Error('Set GARAGE_API_ENDPOINT to provision file storage.');
	const endpoint = new URL(GARAGE_API_ENDPOINT).href.replace(/\/+$/, '');
	const token = randomUUID();
	const deadline = Date.now() + 125_000;
	db.insert(garageStorage)
		.values({ endpoint, keyName: `bpc-app-${randomUUID()}` })
		.onConflictDoNothing()
		.run();

	while (Date.now() < deadline) {
		// Atomic lease across processes; no DB transaction stays open during HTTP calls.
		// Two minutes exceeds all bounded Admin SDK calls in a provisioning attempt.
		const stored = db
			.update(garageStorage)
			.set({ leaseToken: token, leaseExpiresAt: Date.now() + 120_000 })
			.where(
				and(eq(garageStorage.endpoint, endpoint), lte(garageStorage.leaseExpiresAt, Date.now()))
			)
			.returning({ keyName: garageStorage.keyName, accessKeyId: garageStorage.accessKeyId })
			.get();
		if (!stored) {
			await setTimeout(100);
			continue;
		}
		const owned = and(eq(garageStorage.endpoint, endpoint), eq(garageStorage.leaseToken, token));
		const assertOwned = () => {
			const lease = db
				.select({ expires: garageStorage.leaseExpiresAt })
				.from(garageStorage)
				.where(owned)
				.get();
			if (!lease || lease.expires <= Date.now())
				throw new Error('Garage operation lease was lost. Retry the operation.');
		};
		try {
			const result = await work(assertOwned);
			assertOwned();
			return result;
		} finally {
			db.update(garageStorage).set({ leaseToken: null, leaseExpiresAt: 0 }).where(owned).run();
		}
	}
	throw new Error('Garage provisioning is busy in another app instance. Retry startup.');
}

export async function provisionGarageCredentials(
	provision: (
		stored: Pick<typeof garageStorage.$inferSelect, 'keyName' | 'accessKeyId'>
	) => Promise<GarageCredentials>
): Promise<void> {
	await withGarageLock(async (assertOwned) => {
		const endpoint = new URL(GARAGE_API_ENDPOINT!).href.replace(/\/+$/, '');
		const stored = db
			.select()
			.from(garageStorage)
			.where(eq(garageStorage.endpoint, endpoint))
			.get()!;
		const next = await provision(stored);
		assertOwned();
		db.update(garageStorage)
			.set({ accessKeyId: next.accessKeyId })
			.where(eq(garageStorage.endpoint, endpoint))
			.run();
		credentials = next;
	});
}
