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
import { clearanceTemplate, enrollment, studentData } from '#lib/schema.js';
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
			const result = await uploadStudentClearance(locals.user.id, input);
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

export const getClearanceSettings = query(() => {
	validateUser(getRequestEvent().locals, [Role.ADMIN]);
	return { configured: fileStorageConfigured(), template: getClearanceTemplateInfo() };
});

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
