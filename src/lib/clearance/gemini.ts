import { z } from 'zod';

export const geminiModelSchema = z.enum([
	'gemini-3.1-flash-lite',
	'gemini-3.5-flash-lite',
	'gemini-3.8-flash',
	'gemini-2.5-flash-lite',
	'gemini-2.5-flash'
]);
export type GeminiModel = z.infer<typeof geminiModelSchema>;
export const DEFAULT_GEMINI_MODEL: GeminiModel = 'gemini-3.1-flash-lite';
export const GEMINI_MODEL_LABELS: Record<GeminiModel, string> = {
	'gemini-3.1-flash-lite': 'Gemini 3.1 Flash-Lite (recommended)',
	'gemini-3.5-flash-lite': 'Gemini 3.5 Flash-Lite',
	'gemini-3.8-flash': 'Gemini 3.8 Flash',
	'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite (legacy access)',
	'gemini-2.5-flash': 'Gemini 2.5 Flash (legacy access)'
};
