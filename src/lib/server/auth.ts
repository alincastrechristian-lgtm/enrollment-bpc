import { Role } from '#lib/Roles.js';
import { db } from '#lib/server/db/index.js';
import { BETTER_AUTH_SECRET, ORIGIN } from '$app/env/private';
import { getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth/minimal';
import { admin } from 'better-auth/plugins/admin';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { ac, adminRole, registrarRole, studentRole } from '../auth-permissions';
import { sendEmail } from './email';
import { createFirstLoginEmail, createResetPasswordEmail } from './email-templates';

const RESET_PASSWORD_EXPIRY_SECONDS = 24 * 60 * 60;

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
			const account = await db.query.account.findFirst({
				where: (account, { eq, and }) =>
					and(eq(account.userId, user.id), eq(account.providerId, 'credential'))
			});

			const message = account?.password
				? createResetPasswordEmail(url, RESET_PASSWORD_EXPIRY_SECONDS, user.name)
				: createFirstLoginEmail(url, RESET_PASSWORD_EXPIRY_SECONDS, user.name);
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
