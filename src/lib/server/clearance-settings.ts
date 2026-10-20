import { eq } from 'drizzle-orm';
import { systemSettings } from '#lib/schema.js';
import type { db, Transaction } from './db';

export function getClearancePolicy(database: typeof db | Transaction) {
	return (
		database
			.select({
				automatedClearanceVerificationEnabled: systemSettings.automatedClearanceVerificationEnabled,
				personalInfoVerificationEnabled: systemSettings.personalInfoVerificationEnabled
			})
			.from(systemSettings)
			.where(eq(systemSettings.id, 1))
			.get() ?? {
			automatedClearanceVerificationEnabled: true,
			personalInfoVerificationEnabled: true
		}
	);
}
