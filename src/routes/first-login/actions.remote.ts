import { auth, validateAction } from '#lib/server/auth.js';
import { command, getRequestEvent } from '$app/server';
import { fail } from '@sveltejs/kit';
import z from 'zod';

export const completeFirstLogin = command(
	z.object({
		password: z.string().min(8)
	}),
	async ({ password }) => {
		const { locals, request } = getRequestEvent();
		const authFailure = validateAction(locals);

		if (authFailure) {
			return authFailure;
		}

		try {
			await auth.api.changePassword({
				body: {
					currentPassword: '',
					newPassword: password
				},
				headers: request.headers
			});
		} catch {
			fail(400, {
				success: false,
				message: 'Failed to change password.'
			});
		}

		try {
			await auth.api.updateUser({
				body: {
					setupComplete: true
				},
				headers: request.headers
			});
		} catch {
			fail(400, {
				success: false,
				message: 'Failed to update user.'
			});
		}
	}
);
