import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {},
	ORIGIN: {},
	BETTER_AUTH_SECRET: {}
});
