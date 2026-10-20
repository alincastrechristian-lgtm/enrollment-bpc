import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {},
	ORIGIN: {},
	BETTER_AUTH_SECRET: {},
	DATA_ENCRYPTION_KEY: { schema: (value) => value?.trim() || undefined },
	GEMINI_API_KEY: { schema: (value) => value?.trim() || undefined },
	GARAGE_ADMIN_ENDPOINT: { schema: (value) => value?.trim() || undefined },
	GARAGE_ADMIN_TOKEN: { schema: (value) => value?.trim() || undefined },
	GARAGE_API_ENDPOINT: { schema: (value) => value?.trim() || undefined },
	GARAGE_REGION: { schema: (value) => value?.trim() || 'garage' }
});
