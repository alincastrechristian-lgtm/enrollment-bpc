import { auth, validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { user } from '#lib/server/db/schema.js';
import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

export const resetPasswordAndSignIn = command(
	z.object({ token: z.string().min(1), newPassword: z.string().min(1) }),
	async ({ token, newPassword }) => {
		const { request } = getRequestEvent();
		// Resolve the account from the reset token, never from client-supplied identity.
		const verification = await db.query.verification.findFirst({
			where: (verification, { and, eq, gt }) =>
				and(
					eq(verification.identifier, `reset-password:${token}`),
					gt(verification.expiresAt, new Date())
				)
		});
		if (!verification)
			error(400, 'Invalid or expired reset link. Request a new password reset email.');
		const user = await db.query.user.findFirst({
			where: (user, { eq }) => eq(user.id, verification.value)
		});
		if (!user) error(400, 'Invalid or expired reset link. Request a new password reset email.');

		// Better Auth validates and consumes the token and revokes old sessions first.
		try {
			await auth.api.resetPassword({ body: { token, newPassword }, headers: request.headers });
		} catch (err) {
			if (isAPIError(err) && err.statusCode >= 400 && err.statusCode < 500) {
				error(err.statusCode, err.message);
			}
			throw err;
		}
		try {
			const result = await auth.api.signInEmail({
				body: { email: user.email, password: newPassword },
				headers: request.headers
			});
			if ('twoFactorRedirect' in result && result.twoFactorRedirect) {
				return {
					status: 'sign-in-required' as const,
					message: 'Your password was reset. Sign in to complete two-factor verification.'
				};
			}
			return { status: 'signed-in' as const };
		} catch {
			// The reset already succeeded; do not ask the user to reuse its consumed token.
			return {
				status: 'sign-in-required' as const,
				message:
					'Your password was reset, but automatic sign-in failed. Sign in with your new password.'
			};
		}
	}
);

export const completeFirstLogin = command(async () => {
	const { locals, request } = getRequestEvent();
	validateUser(locals);
	if (locals.user!.setupComplete) return;

	const account = await db.query.account.findFirst({
		where: (account, { eq, and }) =>
			and(eq(account.userId, locals.user!.id), eq(account.providerId, 'credential'))
	});
	if (!account?.password) error(400, 'Set a password before completing account setup.');

	try {
		await auth.api.updateUser({ body: { setupComplete: true }, headers: request.headers });
		await db.update(user).set({ emailVerified: true }).where(eq(user.id, locals.user!.id));
	} catch (err) {
		if (isAPIError(err) && err.statusCode >= 400 && err.statusCode < 500) {
			error(err.statusCode, err.message);
		}
		throw err;
	}
});
