import { Role } from '#lib/Roles.js';
import { systemSettings } from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import { command, getRequestEvent } from '$app/server';
import { createUpdateSchema } from 'drizzle-zod';
import { db } from '../server/db';

const applicationUpdateSchema = createUpdateSchema(systemSettings);

const updateEmailSettingsSchema = applicationUpdateSchema.pick({
	smtpHost: true,
	smtpPort: true,
	senderEmail: true,
	senderName: true,
	senderPassword: true
});

export const updateSystemSettings = command(updateEmailSettingsSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	const updateData = {
		...data,
		senderPassword: data.senderPassword || undefined
	};

	await db
		.insert(systemSettings)
		.values({ ...data, id: 1 })
		.onConflictDoUpdate({ target: systemSettings.id, set: updateData });
});
