import { db } from '#lib/server/db/index.js';
import { BETTER_AUTH_SECRET, ORIGIN } from '$app/env/private';
import { getRequestEvent } from '$app/server';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth/minimal';
import { admin } from 'better-auth/plugins/admin';
import { sveltekitCookies } from 'better-auth/svelte-kit';

export const auth = betterAuth({
	baseURL: ORIGIN,
	secret: BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	emailAndPassword: { enabled: true, disableSignUp: process.env.NODE_ENV === 'production' },
	plugins: [
		admin({
			defaultRole: 'student'
		}),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
