import { auth } from '#lib/server/auth.js';
import { getPublicError } from '#lib/errors.js';
import { ensureGarageBucket } from '#lib/server/garage/index.js';
import { building } from '$app/env';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';

export const init: ServerInit = async () => {
	if (!building) await ensureGarageBucket();
};

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = handleBetterAuth;

export const handleError: HandleServerError = (caught) => {
	// Diagnostics stay on the server; responses contain only public messages.
	if (caught.kind === 'unknown') console.error('Request failed:', caught.error);
	return getPublicError(caught);
};
