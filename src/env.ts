import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {},
	ORIGIN: {},
	BETTER_AUTH_SECRET: {},
	OLLAMA_BASE_URL: { schema: (value) => value || 'http://192.168.254.63:11434' },
	GARAGE_ADMIN_ENDPOINT: { schema: (value) => value?.trim() || undefined },
	GARAGE_ADMIN_TOKEN: { schema: (value) => value?.trim() || undefined },
	GARAGE_API_ENDPOINT: { schema: (value) => value?.trim() || undefined },
	GARAGE_REGION: { schema: (value) => value?.trim() || 'garage' }
});
