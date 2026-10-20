import { z } from 'zod';

export const aiProviderSchema = z.enum(['gemini', 'openai', 'ollama']);
export type AiProvider = z.infer<typeof aiProviderSchema>;
export const AI_PROVIDER_LABELS = {
	gemini: 'Gemini',
	openai: 'OpenAI / ChatGPT',
	ollama: 'Ollama'
};
export const aiModelSchema = z
	.string()
	.trim()
	.min(1)
	.max(120)
	.regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/);
export const ollamaUrlSchema = z
	.string()
	.trim()
	.max(500)
	.transform((value, ctx) => {
		try {
			const url = new URL(value);
			if (
				!['http:', 'https:'].includes(url.protocol) ||
				url.username ||
				url.password ||
				url.search ||
				url.hash ||
				url.pathname !== '/'
			)
				throw new Error();
			return url.origin;
		} catch {
			ctx.addIssue({
				code: 'custom',
				message:
					'Enter an HTTP or HTTPS server origin, without credentials, path, query or fragment.'
			});
			return z.NEVER;
		}
	});
export const aiKeySchema = z
	.string()
	.trim()
	.max(512)
	.regex(/^[^\s]*$/, 'API key must not contain whitespace.');
export const aiSettingsShape = {
	aiProvider: aiProviderSchema.optional(),
	openaiApiKey: aiKeySchema.optional(),
	openaiModel: aiModelSchema.optional(),
	ollamaBaseUrl: ollamaUrlSchema.optional(),
	ollamaModel: aiModelSchema.optional()
};
export type AiOverrides = {
	aiProvider?: AiProvider;
	openaiApiKey?: string;
	openaiModel?: string;
	ollamaBaseUrl?: string;
	ollamaModel?: string;
};
