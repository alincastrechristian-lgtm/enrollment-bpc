import { Role } from '#lib/Roles.js';
import { db } from '#lib/server/db/index.js';
import { BETTER_AUTH_SECRET, ORIGIN } from '$app/env/private';
import { getRequestEvent } from '$app/server';
import { error, fail } from '@sveltejs/kit';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth/minimal';
import { admin } from 'better-auth/plugins/admin';
import { magicLink } from 'better-auth/plugins/magic-link';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { sveltekitCookies } from 'better-auth/svelte-kit';

const MAGIC_CODE_EXPIRY_SECONDS = 7 * 24 * 60 * 60 * 60; // 7 days in seconds

export const auth = betterAuth({
	baseURL: ORIGIN,
	secret: BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	emailAndPassword: {
		enabled: true,
		disableSignUp: process.env.NODE_ENV === 'production',
		revokeSessionsOnPasswordReset: true,
		sendResetPassword: async ({ user, url }) => {
			console.log(`Reset password link for ${user.email}: ${url}`);
		}
	},
	plugins: [
		admin({
			defaultRole: Role.STUDENT
		}),
		magicLink({
			expiresIn: MAGIC_CODE_EXPIRY_SECONDS, // in seconds
			sendMagicLink: async ({ email, url }) => {
				console.log(`Magic link for ${email}: ${url}`);

				// await sendEmail(
				// 	email,
				// 	'Your Magic Link for RTC Database',
				// 	[
				// 		'Use this magic link to sign in to RTC Database:',
				// 		'',
				// 		url,
				// 		'',
				// 		`This link expires in ${String(MAGIC_CODE_EXPIRY_SECONDS)} seconds.`,
				// 		'Open the RTC Database login page on a device connected to the same local network, choose Magic Link, and click this link.'
				// 	].join('\n')
				// );
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

export function validateAction(locals: App.Locals, roles: Role[] = []) {
	if (!locals.session || !locals.user) {
		return fail(401, {
			message: 'You must be logged in.'
		});
	}

	if (roles.length > 0 && !roles.includes(locals.user.role as Role)) {
		return fail(403, {
			message: 'You do not have permission to perform this action.'
		});
	}

	return null;
}
