import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { requiredDocument } from '#lib/schema.js';
import { downloadObject } from '#lib/server/garage/files.js';
import { eq } from 'drizzle-orm';
import { error, isHttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params, request }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR, Role.STUDENT]);
	const row = db.select().from(requiredDocument).where(eq(requiredDocument.id, params.id)).get();
	if (
		!row ||
		!row.objectKey ||
		(locals.user.role === Role.STUDENT && row.userId !== locals.user.id)
	)
		error(404, 'Document not found.');
	try {
		return await downloadObject(row.objectKey, request.signal);
	} catch (cause) {
		if (isHttpError(cause)) throw cause;
		error(503, 'Could not load this document. Try again shortly.');
	}
};
