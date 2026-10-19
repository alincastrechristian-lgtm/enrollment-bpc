import { Role } from '#lib/Roles.js';
import { clearanceSubmission, enrollment, studentData } from '#lib/schema.js';
import { db } from '#lib/server/db/index.js';
import { validateUser } from '#lib/server/auth.js';
import { downloadObject } from '#lib/server/garage/files.js';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params, request }) => {
	validateUser(locals, [Role.STUDENT, Role.ADMIN, Role.REGISTRAR]);
	const row = db
		.select({ submission: clearanceSubmission, ownerId: studentData.userId })
		.from(clearanceSubmission)
		.innerJoin(enrollment, eq(enrollment.id, clearanceSubmission.enrollmentId))
		.innerJoin(studentData, eq(studentData.studentId, enrollment.studentId))
		.where(eq(clearanceSubmission.id, params.id))
		.get();
	if (!row || (locals.user.role === Role.STUDENT && row.ownerId !== locals.user.id))
		error(404, 'Clearance not found.');
	const response = await downloadObject(row.submission.objectKey, request.signal);
	response.headers.set('Content-Type', row.submission.contentType);
	response.headers.set('Content-Disposition', 'inline');
	return response;
};
