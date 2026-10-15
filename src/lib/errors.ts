import { isHttpError } from '@sveltejs/kit';
import type { CaughtError } from '@sveltejs/kit/hooks';

export function getErrorMessage(cause: unknown, fallback: string): string {
	// Only app-authored 4xx messages are public. Native/provider errors may contain secrets.
	return isHttpError(cause) &&
		cause.status >= 400 &&
		cause.status < 500 &&
		typeof cause.body.message === 'string' &&
		cause.body.message.trim()
		? cause.body.message
		: fallback;
}

export function getPublicError({ kind, error }: CaughtError): App.Error {
	if (kind === 'validation') return { status: 400, message: 'Check your input and try again.' };
	if (kind === 'app' || kind === 'framework') {
		return {
			status: error.status,
			message: error.status < 500 ? error.message : 'Something went wrong. Please try again.'
		};
	}
	return { status: 500, message: 'Something went wrong. Please try again.' };
}

// Auth responses come from a separate API. Translate known codes, never provider messages.
const authMessages: Record<string, string> = {
	INVALID_EMAIL_OR_PASSWORD: 'Incorrect email or password.',
	EMAIL_NOT_VERIFIED: 'Verify your email before signing in.',
	INVALID_EMAIL: 'Enter a valid email address.',
	PASSWORD_TOO_SHORT: 'Use at least 8 characters for your password.',
	PASSWORD_TOO_LONG: 'Your password is too long. Use at most 128 characters.',
	INVALID_TOKEN: 'Invalid or expired reset link. Request a new password reset email.',
	USER_ALREADY_EXISTS: 'An account already exists with this email.',
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'An account already exists with this email.'
};

export function getAuthErrorMessage(cause: unknown, fallback: string): string {
	if (!cause || typeof cause !== 'object') return fallback;
	if ('status' in cause && typeof cause.status === 'number') {
		if (cause.status === 429) return 'Too many requests. Wait a moment before trying again.';
		if (cause.status >= 500) return fallback;
	}
	if (
		'code' in cause &&
		typeof cause.code === 'string' &&
		Object.hasOwn(authMessages, cause.code)
	) {
		return authMessages[cause.code];
	}
	return fallback;
}
