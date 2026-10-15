import { Role } from '#lib/Roles.js';
import { enrollment, studentData, user } from '#lib/schema.js';
import type { db, Transaction } from '#lib/server/db/index.js';
import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

export function canEditEnrollmentGrades(role: string | null | undefined, isCurrent: boolean) {
	return role === Role.ADMIN || (role === Role.REGISTRAR && isCurrent);
}

// Resolve enrollment ownership for both the view and the grade-writing transaction.
export function getStudentEnrollment(
	database: typeof db | Transaction,
	userId: string,
	enrollmentId: string
) {
	const result = database
		.select({
			enrollment,
			student: {
				studentId: studentData.studentId,
				currentEnrollmentId: studentData.currentEnrollmentId
			},
			user: { id: user.id, name: user.name, email: user.email }
		})
		.from(enrollment)
		.innerJoin(studentData, eq(studentData.studentId, enrollment.studentId))
		.innerJoin(user, eq(user.id, studentData.userId))
		.where(and(eq(enrollment.id, enrollmentId), eq(user.id, userId), eq(user.role, Role.STUDENT)))
		.get();
	if (!result) error(404, 'Student enrollment not found.');
	return result;
}
