import { Role } from '#lib/Roles.js';
import { db } from '#lib/server/db/index.js';
import { BETTER_AUTH_SECRET, ORIGIN } from '$app/env/private';
import { getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth/minimal';
import { admin } from 'better-auth/plugins/admin';
import { magicLink } from 'better-auth/plugins/magic-link';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { ac, adminRole, registrarRole, studentRole } from '../auth-permissions';
import { sendEmail } from './email';
import { createMagicLinkEmail, createResetPasswordEmail } from './email-templates';

const MAGIC_CODE_EXPIRY_SECONDS = 7 * 24 * 60 * 60;
const RESET_PASSWORD_EXPIRY_SECONDS = 60 * 60;

export const auth = betterAuth({
	baseURL: ORIGIN,
	secret: BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	emailAndPassword: {
		enabled: true,
		disableSignUp: process.env.NODE_ENV === 'production',
		revokeSessionsOnPasswordReset: true,
		resetPasswordTokenExpiresIn: RESET_PASSWORD_EXPIRY_SECONDS,
		sendResetPassword: async ({ user, url }) => {
			const message = createResetPasswordEmail(url, RESET_PASSWORD_EXPIRY_SECONDS, user.name);
			await sendEmail(user.email, message.subject, message.text, message.html);
		}
	},
	plugins: [
		admin({
			defaultRole: Role.STUDENT,
			ac,

			roles: {
				[Role.ADMIN]: adminRole,
				[Role.REGISTRAR]: registrarRole,
				[Role.STUDENT]: studentRole
			}
		}),
		magicLink({
			expiresIn: MAGIC_CODE_EXPIRY_SECONDS, // in seconds
			sendMagicLink: async ({ email, url }) => {
				const message = createMagicLinkEmail(url, MAGIC_CODE_EXPIRY_SECONDS);
				await sendEmail(email, message.subject, message.text, message.html);
			},
			disableSignUp: true
		}),
		twoFactor(),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	],
	user: {
		additionalFields: {
			setupComplete: {
				type: 'boolean',
				default: false
			}
		}
	}
});

export function validateUser(locals: App.Locals, roles: Role[] = []) {
	if (!locals.session || !locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (roles.length > 0 && !roles.includes(locals.user.role as Role)) {
		throw error(403, 'Forbidden');
	}

	return true;
}

// export function validateAction(locals: App.Locals, roles: Role[] = []) {
// 	if (!locals.session || !locals.user) {
// 		return fail(401, {
// 			message: 'You must be logged in.'
// 		});
// 	}

// 	if (roles.length > 0 && !roles.includes(locals.user.role as Role)) {
// 		return fail(403, {
// 			message: 'You do not have permission to perform this action.'
// 		});
// 	}

// 	return null;
// }
