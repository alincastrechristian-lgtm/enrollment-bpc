import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import {
	getClearanceTemplateInfo,
	getClearanceTemplate,
	saveClearanceTemplate,
	saveClearanceDefinition
} from '#lib/server/clearance-template.js';
import { definitionSchema, hasIdentityAreas } from '#lib/clearance/definition.js';
import { fileStorageConfigured, MAX_FILE_BYTES } from '#lib/server/garage/files.js';
import { command, form, getRequestEvent, query } from '$app/server';
import { error, isHttpError } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '#lib/server/db/index.js';
import { clearanceTemplate, enrollment, studentData, systemSettings } from '#lib/schema.js';
import { getClearancePolicy } from '#lib/server/clearance-settings.js';
import { getGeminiApiKey, getGeminiModel, recognizeIdentity } from '#lib/server/handwriting.js';
import {
	aiSettingsShape,
	aiKeySchema,
	ollamaUrlSchema,
	aiModelSchema,
	MAX_HANDWRITING_CROP_BASE64_LENGTH,
	AI_PROVIDER_LABELS
} from '#lib/clearance/ai.js';
import { geminiModelSchema } from '#lib/clearance/gemini.js';
import sharp from 'sharp';
import { and, eq } from 'drizzle-orm';
import { validCorners } from '#lib/clearance/clearance.js';
import {
	getSubmission,
	submissionInfo,
	requestClearanceEnrollment,
	rejectClearanceSubmission
} from '#lib/server/clearance-workflow.js';
import { uploadStudentClearance } from '#lib/server/clearance-upload.js';

export const getStudentClearance = query(() => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.STUDENT]);
	const student = db.select().from(studentData).where(eq(studentData.userId, locals.user.id)).get();
	const current = student?.currentEnrollmentId
		? db
				.select()
				.from(enrollment)
				.where(
					and(
						eq(enrollment.id, student.currentEnrollmentId),
						eq(enrollment.studentId, student.studentId)
					)
				)
				.get()
		: null;
	const template = db.select().from(clearanceTemplate).where(eq(clearanceTemplate.id, 1)).get();
	return {
		...getClearancePolicy(db),
		current,
		template: template
			? {
					revision: template.revision,
					filename: template.filename,
					definition: definitionSchema.safeParse(template.definition).data ?? null
				}
			: null,
		submission: current ? submissionInfo(getSubmission(db, current.id)) : null
	};
});
const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
export const uploadClearance = form(
	z
		.object({
			file: z.file().min(1).max(MAX_FILE_BYTES).mime(['image/jpeg', 'image/png', 'image/webp']),
			enrollmentId: z.string().min(1),
			revision: z.string().regex(/^\d+$/).transform(Number),
			templateRevision: z.string().uuid(),
			corners: z.string().transform((value, ctx) => {
				try {
					return z
						.tuple([point, point, point, point])
						.refine(validCorners)
						.parse(JSON.parse(value));
				} catch {
					ctx.addIssue({ code: 'custom', message: 'Confirm four valid clearance corners.' });
					return z.NEVER;
				}
			})
		})
		.strict(),
	async (input) => {
		const { locals } = getRequestEvent();
		validateUser(locals, [Role.STUDENT]);
		try {
			const result = await uploadStudentClearance(
				locals.user.id,
				input,
				getRequestEvent().request?.signal
			);
			await getStudentClearance().refresh();
			return result;
		} catch (cause) {
			if (isHttpError(cause)) throw cause;
			console.error('Student clearance upload failed.');
			error(503, 'Could not check or save clearance. Try again shortly.');
		}
	}
);
export const requestEnrollment = command(
	z.object({ submissionId: z.string().uuid() }).strict(),
	async ({ submissionId }) => {
		const { locals } = getRequestEvent();
		validateUser(locals, [Role.STUDENT]);
		const result = requestClearanceEnrollment(db, locals.user.id, submissionId);
		await getStudentClearance().refresh();
		return result;
	}
);
export const rejectClearance = command(
	z
		.object({
			userId: z.string().min(1),
			enrollmentId: z.string().min(1),
			revision: z.number().int().nonnegative(),
			submissionId: z.string().uuid(),
			reason: z.string().trim().min(5).max(1000)
		})
		.strict(),
	(input) => {
		const { locals } = getRequestEvent();
		validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
		return rejectClearanceSubmission(db, input, locals.user);
	}
);

export const getClearanceSettings = query(async () => {
	validateUser(getRequestEvent().locals, [Role.ADMIN]);
	const key = await getGeminiApiKey();
	const settings = db.select().from(systemSettings).where(eq(systemSettings.id, 1)).get()!;
	return {
		configured: fileStorageConfigured(),
		template: getClearanceTemplateInfo(),
		...getClearancePolicy(db),
		aiProvider: settings.aiProvider as 'gemini' | 'openai' | 'ollama',
		hasOpenaiKey: !!settings.openaiApiKey,
		openaiModel: settings.openaiModel,
		ollamaBaseUrl: settings.ollamaBaseUrl,
		ollamaModel: settings.ollamaModel,
		hasGeminiKey: !!key,
		geminiModel: await getGeminiModel()
	};
});

const geminiKey = aiKeySchema;
export const fetchClearanceOpenaiModels = command(
	z.object({ openaiApiKey: aiKeySchema.optional() }).strict(),
	async ({ openaiApiKey }) => {
		const { locals, request } = getRequestEvent();
		validateUser(locals, [Role.ADMIN]);
		const key =
			openaiApiKey ||
			db
				.select({ key: systemSettings.openaiApiKey })
				.from(systemSettings)
				.where(eq(systemSettings.id, 1))
				.get()?.key;
		if (!key) error(400, 'Enter or save an OpenAI API key first.');
		try {
			const response = await fetch('https://api.openai.com/v1/models', {
				headers: { Authorization: `Bearer ${key}` },
				redirect: 'error',
				signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)])
			});
			if (!response.ok) {
				const advice =
					response.status === 401
						? 'Check that the API key is active and complete.'
						: response.status === 403
							? 'Check that the key has permission to list models in this project.'
							: response.status === 429
								? 'Request limit reached. Retry after the limit resets.'
								: 'Check OpenAI availability and server connectivity, then retry.';
				return {
					success: false as const,
					message: `OpenAI model listing failed (HTTP ${response.status}). ${advice}`
				};
			}
			const parsed = z
				.object({ data: z.array(z.object({ id: z.string().min(1).max(120) })).max(10_000) })
				.safeParse(await response.json().catch(() => null));
			if (!parsed.success)
				return {
					success: false as const,
					message: 'OpenAI returned an unreadable model list. Try again later.'
				};
			const models = [...new Set(parsed.data.data.map((model) => model.id))].sort();
			return { success: true as const, models };
		} catch (cause) {
			request.signal.throwIfAborted();
			return {
				success: false as const,
				message:
					cause instanceof Error && cause.name === 'TimeoutError'
						? 'OpenAI model listing timed out after 20 seconds. Try again later.'
						: 'Could not connect to OpenAI to fetch models. Check server connectivity, DNS, firewall and proxy settings.'
			};
		}
	}
);

export const fetchClearanceOllamaModels = command(
	z.object({ ollamaBaseUrl: ollamaUrlSchema.optional() }).strict(),
	async ({ ollamaBaseUrl }) => {
		const { locals, request } = getRequestEvent();
		validateUser(locals, [Role.ADMIN]);
		const address = ollamaUrlSchema.parse(
			ollamaBaseUrl ??
				db
					.select({ url: systemSettings.ollamaBaseUrl })
					.from(systemSettings)
					.where(eq(systemSettings.id, 1))
					.get()?.url ??
				'http://localhost:11434'
		);
		try {
			const response = await fetch(`${address}/api/tags`, {
				redirect: 'error',
				signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)])
			});
			if (!response.ok)
				return {
					success: false as const,
					message: `Ollama model listing failed (HTTP ${response.status}). Check the server address, access permissions and Ollama availability.`
				};
			const parsed = z
				.object({ models: z.array(z.object({ name: aiModelSchema })).max(10_000) })
				.safeParse(await response.json().catch(() => null));
			if (!parsed.success)
				return {
					success: false as const,
					message:
						'Ollama returned an unreadable model list. Check the server address and try again.'
				};
			return {
				success: true as const,
				models: [...new Set(parsed.data.models.map((model) => model.name))].sort()
			};
		} catch (cause) {
			request.signal.throwIfAborted();
			return {
				success: false as const,
				message:
					cause instanceof Error && cause.name === 'TimeoutError'
						? 'Ollama model listing timed out after 20 seconds. Check the server and try again.'
						: 'Could not connect to Ollama to fetch models. Check the server address, listening interface and firewall. The address must be reachable from the application server.'
			};
		}
	}
);

export const saveClearanceVerification = command(
	z
		.object({
			automatedClearanceVerificationEnabled: z.boolean(),
			personalInfoVerificationEnabled: z.boolean(),
			...aiSettingsShape,
			clearOpenaiKey: z.boolean().default(false),
			geminiApiKey: geminiKey.optional(),
			geminiModel: geminiModelSchema.optional(),
			clearGeminiKey: z.boolean().default(false)
		})
		.strict(),
	async (input) => {
		validateUser(getRequestEvent().locals, [Role.ADMIN]);
		await getGeminiApiKey();
		db.transaction(
			(tx) => {
				const existingKey = tx.select().from(systemSettings).where(eq(systemSettings.id, 1)).get();
				const key = input.clearGeminiKey
					? ''
					: input.geminiApiKey || existingKey?.geminiApiKey || '';
				const openaiKey = input.clearOpenaiKey
					? ''
					: input.openaiApiKey || existingKey?.openaiApiKey || '';
				const provider = input.aiProvider ?? existingKey?.aiProvider ?? 'gemini';
				if (
					input.automatedClearanceVerificationEnabled &&
					input.personalInfoVerificationEnabled &&
					(provider === 'gemini' ? !key : provider === 'openai' ? !openaiKey : false)
				)
					error(
						400,
						'Enter an API key for the selected provider before enabling personal information verification.'
					);
				tx.update(systemSettings)
					.set({
						automatedClearanceVerificationEnabled: input.automatedClearanceVerificationEnabled,
						personalInfoVerificationEnabled: input.personalInfoVerificationEnabled,
						geminiApiKey: key,
						aiProvider: input.aiProvider,
						openaiApiKey: openaiKey,
						openaiModel: input.openaiModel,
						ollamaBaseUrl: input.ollamaBaseUrl,
						ollamaModel: input.ollamaModel,
						geminiModel: input.geminiModel
					})
					.where(eq(systemSettings.id, 1))
					.run();
			},
			{ behavior: 'immediate' }
		);
		await getClearanceSettings().refresh();
		return { success: true };
	}
);

export const testClearanceAi = command(
	z
		.object({
			...aiSettingsShape,
			geminiApiKey: geminiKey.optional(),
			geminiModel: geminiModelSchema.optional()
		})
		.strict(),
	async (input) => {
		validateUser(getRequestEvent().locals, [Role.ADMIN]);
		await getGeminiApiKey();
		const settings = db.select().from(systemSettings).where(eq(systemSettings.id, 1)).get()!;
		const provider = input.aiProvider ?? (settings.aiProvider as 'gemini' | 'openai' | 'ollama');
		const label = AI_PROVIDER_LABELS[provider];
		if (provider === 'gemini' && !(input.geminiApiKey || (await getGeminiApiKey())))
			error(400, 'Enter or save a Gemini API key first.');
		if (provider === 'openai' && !(input.openaiApiKey || settings.openaiApiKey))
			error(400, 'Enter or save an OpenAI API key first.');
		const png = (
			await sharp({ create: { width: 128, height: 64, channels: 3, background: '#fff' } })
				.png()
				.toBuffer()
		).toString('base64');
		try {
			const result = await recognizeIdentity(
				{ name: png, studentNumber: png },
				getRequestEvent().request.signal,
				provider === 'gemini'
					? input.geminiApiKey || (await getGeminiApiKey())
					: { ...input, aiProvider: provider },
				input.geminiModel
			);
			return {
				success: !result.warnings,
				message: result.warnings
					? `${label} responded but returned an unusable transcription. Try again.`
					: `${label} connection successful. The vision model accepted the test images.`
			};
		} catch (cause) {
			return {
				success: false,
				message: isHttpError(cause)
					? cause.body.message
					: `Could not reach ${label}. Check server connectivity and try again.`
			};
		}
	}
);

const testCrop = z
	.string()
	.min(1)
	.max(MAX_HANDWRITING_CROP_BASE64_LENGTH)
	.regex(/^[A-Za-z0-9+/]+={0,2}$/);
export const readClearanceTestHandwriting = command(
	z
		.object({
			revision: z.string().uuid(),
			crops: z.object({ name: testCrop, studentNumber: testCrop }).strict()
		})
		.strict(),
	async ({ revision, crops }) => {
		const { locals, request } = getRequestEvent();
		validateUser(locals, [Role.ADMIN]);
		const template = getClearanceTemplate();
		if (!template || template.revision !== revision)
			error(409, 'Template changed. Reload the clearance test.');
		const definition = definitionSchema.safeParse(template.definition);
		if (!definition.success || !hasIdentityAreas(definition.data))
			error(400, 'Mark and save the student name and number areas before testing handwriting.');
		const images = { ...crops };
		for (const field of ['name', 'studentNumber'] as const) {
			try {
				const image = sharp(Buffer.from(crops[field], 'base64'), { limitInputPixels: 2_000_000 });
				const metadata = await image.metadata();
				if (
					metadata.format !== 'png' ||
					!metadata.width ||
					!metadata.height ||
					metadata.width > 2400 ||
					metadata.height > 1000
				)
					error(400, 'Use PNG field crops up to 2400 × 1000 pixels.');
				images[field] = (
					await image.flatten({ background: '#fff' }).greyscale().png().toBuffer()
				).toString('base64');
			} catch (cause) {
				if (isHttpError(cause)) throw cause;
				error(
					400,
					'Could not read the handwriting field images. Upload a clear image and try again.'
				);
			}
		}
		try {
			return { success: true as const, readings: await recognizeIdentity(images, request.signal) };
		} catch (cause) {
			// Admin diagnostics return only service-authored messages, bypassing generic 5xx masking.
			return {
				success: false as const,
				message: isHttpError(cause)
					? cause.body.message
					: 'The server could not connect to the selected AI provider. Check server connectivity and AI settings.'
			};
		}
	}
);

export const saveClearanceAreas = command(
	z.object({ revision: z.string().uuid(), definition: definitionSchema }).strict(),
	async ({ revision, definition }) => {
		validateUser(getRequestEvent().locals, [Role.ADMIN]);
		try {
			const result = saveClearanceDefinition(revision, definition);
			await getClearanceSettings().refresh();
			return result;
		} catch (caught) {
			if (isHttpError(caught)) throw caught;
			error(503, 'Could not save template areas. Try again.');
		}
	}
);

export const uploadClearanceTemplate = form(
	z.object({
		file: z
			.file()
			.min(1, 'Choose a blank clearance image.')
			.max(MAX_FILE_BYTES, 'Maximum template size is 10 MiB.')
			.mime(['image/jpeg', 'image/png', 'image/webp'], 'Choose a JPG, PNG or WebP image.'),
		revision: z.string().max(36)
	}),
	async ({ file, revision }) => {
		const { locals } = getRequestEvent();
		validateUser(locals, [Role.ADMIN]);
		try {
			const result = await saveClearanceTemplate(file, revision, locals.user.id);
			await getClearanceSettings().refresh();
			return result;
		} catch (caught) {
			if (isHttpError(caught)) throw caught;
			error(503, 'Could not save the template. Check storage connectivity and retry.');
		}
	}
);
