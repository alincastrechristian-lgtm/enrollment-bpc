import { Role } from '#lib/Roles.js';
import { EmailApiType } from '#lib/email.js';
import { systemSettings } from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '../server/db';
import { getSystemSettings } from '../server/settings';

const updateEmailSettingsSchema = z
	.object({
		emailApiType: z.enum(EmailApiType),
		senderEmail: z.string().trim().pipe(z.email()),
		senderName: z
			.string()
			.trim()
			.min(1)
			.regex(/^[^\r\n]+$/),
		smtpHost: z
			.string()
			.trim()
			.regex(/^[^\s/:]+$/)
			.optional(),
		smtpPort: z.number().int().min(1).max(65535).optional(),
		senderPassword: z.string().optional(),
		resendApiKey: z.string().trim().optional()
	})
	.superRefine((data, ctx) => {
		if (data.emailApiType === EmailApiType.SMTP) {
			if (!data.smtpHost)
				ctx.addIssue({ code: 'custom', path: ['smtpHost'], message: 'SMTP host is required' });
			if (!data.smtpPort)
				ctx.addIssue({ code: 'custom', path: ['smtpPort'], message: 'SMTP port is required' });
		}
	});

export const updateSystemSettings = command(updateEmailSettingsSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	const settings = await getSystemSettings();
	if (data.emailApiType === EmailApiType.RESEND && !data.resendApiKey && !settings.resendApiKey)
		error(400, 'Enter a Resend API key before selecting Resend.');
	if (data.emailApiType === EmailApiType.SMTP && !data.senderPassword && !settings.senderPassword)
		error(400, 'Enter a sender password before selecting SMTP.');

	const updateData = {
		...data,
		senderPassword: data.senderPassword || undefined,
		resendApiKey: data.resendApiKey || undefined
	};

	await db
		.insert(systemSettings)
		.values({ ...updateData, id: 1 })
		.onConflictDoUpdate({ target: systemSettings.id, set: updateData });
});
