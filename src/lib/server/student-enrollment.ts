import { Role } from '#lib/Roles.js';
import { enrollment, studentData, user } from '#lib/schema.js';
import type { db, Transaction } from '#lib/server/db/index.js';
import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

type StudentEnrollmentRecord = ReturnType<typeof getStudentEnrollment>;

export function getEnrollmentGradeLockReason(
	record: StudentEnrollmentRecord,
	role: string | null | undefined
) {
	if (!record.user.setupComplete)
		return 'The student must complete account setup before grades can be edited or finalized.';
	if (record.enrollment.finalizedGrades && role !== Role.ADMIN)
		return 'Grades are finalized. Only administrators can edit them.';
	return null;
}

export function canEditEnrollmentGrades(
	role: string | null | undefined,
	record: StudentEnrollmentRecord
) {
	return (
		!getEnrollmentGradeLockReason(record, role) &&
		(role === Role.ADMIN ||
			(role === Role.REGISTRAR && record.student.currentEnrollmentId === record.enrollment.id))
	);
}

export function canFinalizeEnrollmentGrades(
	role: string | null | undefined,
	record: StudentEnrollmentRecord
) {
	return !record.enrollment.finalizedGrades && canEditEnrollmentGrades(role, record);
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
			user: { id: user.id, name: user.name, email: user.email, setupComplete: user.setupComplete }
		})
		.from(enrollment)
		.innerJoin(studentData, eq(studentData.studentId, enrollment.studentId))
		.innerJoin(user, eq(user.id, studentData.userId))
		.where(and(eq(enrollment.id, enrollmentId), eq(user.id, userId), eq(user.role, Role.STUDENT)))
		.get();
	if (!result) error(404, 'Student enrollment not found.');
	return result;
}
