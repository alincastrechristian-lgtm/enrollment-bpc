// registrar.remote.ts
import { Role } from '#lib/Roles.js';
import { auth, validateAction } from '#lib/server/auth.js';
import { command, getRequestEvent } from '$app/server';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';

export const resendMagicLink = command(
	z.object({
		email: z.email()
	}),
	async ({ email }) => {
		const { locals, request } = getRequestEvent();
		const authFailure = validateAction(locals, [Role.ADMIN]);

		if (authFailure) {
			return authFailure;
		}

		if (!email) {
			return fail(400, {
				success: false,
				message: 'Email is required.'
			});
		}

		try {
			await auth.api.signInMagicLink({
				body: {
					email
				},
				headers: request.headers
			});
		} catch {
			return fail(400, {
				success: false,
				message: 'Failed to send magic link email.'
			});
		}

		return {
			success: true
		};
	}
);
