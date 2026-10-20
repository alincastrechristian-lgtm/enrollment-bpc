import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import {
	getClearanceTemplateInfo,
	saveClearanceTemplate,
	saveClearanceDefinition
} from '#lib/server/clearance-template.js';
import { definitionSchema } from '#lib/clearance/definition.js';
import { fileStorageConfigured, MAX_FILE_BYTES } from '#lib/server/garage/files.js';
import { command, form, getRequestEvent, query } from '$app/server';
import { error, isHttpError } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '#lib/server/db/index.js';
import { clearanceTemplate, enrollment, studentData, systemSettings } from '#lib/schema.js';
import { getClearancePolicy } from '#lib/server/clearance-settings.js';
import { getGeminiApiKey, recognizeIdentity } from '#lib/server/handwriting.js';
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
	return {
		configured: fileStorageConfigured(),
		template: getClearanceTemplateInfo(),
		...getClearancePolicy(db),
		hasGeminiKey: !!key
	};
});

const geminiKey = z
	.string()
	.trim()
	.max(512)
	.regex(/^[^\s]*$/, 'API key must not contain whitespace.');
export const saveClearanceVerification = command(
	z
		.object({
			automatedClearanceVerificationEnabled: z.boolean(),
			personalInfoVerificationEnabled: z.boolean(),
			geminiApiKey: geminiKey.optional(),
			clearGeminiKey: z.boolean().default(false)
		})
		.strict(),
	async (input) => {
		validateUser(getRequestEvent().locals, [Role.ADMIN]);
		await getGeminiApiKey();
		db.transaction(
			(tx) => {
				const existingKey =
					tx
						.select({ key: systemSettings.geminiApiKey })
						.from(systemSettings)
						.where(eq(systemSettings.id, 1))
						.get()?.key ?? '';
				const key = input.clearGeminiKey ? '' : input.geminiApiKey || existingKey;
				if (
					input.automatedClearanceVerificationEnabled &&
					input.personalInfoVerificationEnabled &&
					!key
				)
					error(400, 'Enter a Gemini API key before enabling personal information verification.');
				tx.update(systemSettings)
					.set({
						automatedClearanceVerificationEnabled: input.automatedClearanceVerificationEnabled,
						personalInfoVerificationEnabled: input.personalInfoVerificationEnabled,
						geminiApiKey: key
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

export const testClearanceGemini = command(
	z.object({ geminiApiKey: geminiKey.optional() }).strict(),
	async (input) => {
		validateUser(getRequestEvent().locals, [Role.ADMIN]);
		const key = input.geminiApiKey || (await getGeminiApiKey());
		if (!key) error(400, 'Enter or save a Gemini API key first.');
		// A blank sample exercises the same vision request without sending student information.
		const png = (
			await sharp({ create: { width: 128, height: 64, channels: 3, background: '#fff' } })
				.png()
				.toBuffer()
		).toString('base64');
		try {
			const result = await recognizeIdentity(
				{ name: png, studentNumber: png },
				getRequestEvent().request.signal,
				key
			);
			return {
				success: !result.warnings,
				message: result.warnings
					? 'Gemini responded but returned an unusable transcription. Try again.'
					: 'Gemini connection successful. The vision model accepted the test images.'
			};
		} catch (cause) {
			return {
				success: false,
				message: isHttpError(cause)
					? cause.body.message
					: 'Could not reach Gemini. Check server connectivity and try again.'
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
