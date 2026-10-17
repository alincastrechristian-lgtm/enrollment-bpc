import { Role } from '#lib/Roles.js';
import { user } from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { canDeleteStudentAccount } from '#lib/students.js';

export const load: PageServerLoad = async ({ locals, params }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	const student = await db.query.user.findFirst({
		where: and(eq(user.id, params.userId), eq(user.role, Role.STUDENT)),
		with: {
			studentData: {
				with: {
					enrollments: {
						orderBy: (enrollment, { desc }) => [
							desc(enrollment.schoolYearStart),
							desc(enrollment.semester),
							desc(enrollment.enrolledAt),
							desc(enrollment.id)
						],
						with: {
							curriculum: { with: { program: true } },
							subjects: { orderBy: (entry, { asc }) => [asc(entry.subjectCode), asc(entry.id)] }
						}
					}
				}
			}
		}
	});
	if (!student) error(404, 'Student not found.');
	return {
		student,
		canEdit: locals.user.role === Role.ADMIN && !!student.studentData,
		canDelete: canDeleteStudentAccount({
			setupComplete: student.setupComplete,
			currentEnrollmentId: student.studentData?.currentEnrollmentId,
			hasEnrollment: !!student.studentData?.enrollments.length
		})
	};
};
