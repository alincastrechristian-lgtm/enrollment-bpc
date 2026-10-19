import { command, form, getRequestEvent, query } from '$app/server';
import { error, isHttpError } from '@sveltejs/kit';
import { z } from 'zod';
import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { DOCUMENT_KINDS } from '#lib/documents.js';
import {
	getDocumentState,
	requestStudentDocuments,
	reviewStudentDocument
} from '#lib/server/documents.js';
import { uploadRequiredDocument } from '#lib/server/document-upload.js';
import { MAX_FILE_BYTES } from '#lib/server/garage/files.js';

export const getStudentDocuments = query(() => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.STUDENT]);
	return getDocumentState(db, locals.user.id);
});
export const getStudentDocumentReview = query(z.string().min(1), (userId) => {
	validateUser(getRequestEvent().locals, [Role.ADMIN, Role.REGISTRAR]);
	return getDocumentState(db, userId);
});
export const requestDocuments = command(
	z
		.object({
			userId: z.string().min(1),
			enrollmentId: z.string().min(1),
			kinds: z
				.array(z.enum(DOCUMENT_KINDS))
				.min(1)
				.max(3)
				.refine((kinds) => new Set(kinds).size === kinds.length)
		})
		.strict(),
	async (input) => {
		const { locals } = getRequestEvent();
		validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
		const result = requestStudentDocuments(db, input, locals.user);
		await getStudentDocumentReview(input.userId).refresh();
		return result;
	}
);
export const reviewDocument = command(
	z
		.object({
			id: z.string().uuid(),
			revision: z.number().int().nonnegative(),
			decision: z.enum(['verified', 'rejected']),
			reason: z.string().trim().min(5).max(1000).optional()
		})
		.strict(),
	async (input) => {
		const { locals } = getRequestEvent();
		validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
		const result = reviewStudentDocument(db, input, locals.user);
		await getStudentDocumentReview(result.userId).refresh();
		return { success: true };
	}
);
export const uploadDocument = form(
	z
		.object({
			id: z.string().uuid(),
			revision: z.string().regex(/^\d+$/).transform(Number),
			file: z
				.file()
				.min(1)
				.max(MAX_FILE_BYTES)
				.mime(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
		})
		.strict(),
	async (input) => {
		const { locals, request } = getRequestEvent();
		validateUser(locals, [Role.STUDENT]);
		try {
			const result = await uploadRequiredDocument(locals.user.id, input, request.signal);
			await getStudentDocuments().refresh();
			return result;
		} catch (cause) {
			if (isHttpError(cause)) throw cause;
			error(503, 'Could not save this document. Try again shortly.');
		}
	}
);
