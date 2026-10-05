import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { getSystemSettings } from '#lib/server/settings.js';

export async function load({ locals }) {
	validateUser(locals, [Role.ADMIN]);

	const settings = await getSystemSettings();

	const { senderPassword, ...safeSettings } = settings;

	return {
		settings: {
			...safeSettings,
			hasSenderPassword: Boolean(senderPassword)
		}
	};
}
