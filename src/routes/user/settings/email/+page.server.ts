import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { getSystemSettings } from '#lib/server/settings.js';

export async function load({ locals }) {
	validateUser(locals, [Role.ADMIN]);

	const settings = await getSystemSettings();

	const { senderPassword, resendApiKey } = settings;

	return {
		settings: {
			id: settings.id,
			seeded: settings.seeded,
			emailApiType: settings.emailApiType,
			smtpHost: settings.smtpHost,
			smtpPort: settings.smtpPort,
			senderName: settings.senderName,
			senderEmail: settings.senderEmail,
			hasSenderPassword: Boolean(senderPassword),
			hasResendApiKey: Boolean(resendApiKey)
		}
	};
}
