import { Role } from '#lib/Roles.js';
import { enrollment, studentData, user } from '#lib/schema.js';
import { db, type Transaction } from '#lib/server/db/index.js';
import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

type StudentEnrollmentRecord = ReturnType<typeof getStudentEnrollment>;

export function getEnrollmentGradeLockReason(record: StudentEnrollmentRecord) {
	if (record.enrollment.status === 'dropped' || record.enrollment.status === 'voided')
		return 'Dropped or voided enrollments cannot be edited or finalized.';
	if (!record.user.setupComplete)
		return 'The student must complete account setup before grades can be edited or finalized.';
	if (record.enrollment.finalizedGrades)
		return 'Grades are finalized. An administrator must reopen this enrollment before making corrections.';
	return null;
}

export function canEditEnrollmentGrades(
	role: string | null | undefined,
	record: StudentEnrollmentRecord
) {
	return (
		!getEnrollmentGradeLockReason(record) &&
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

export function canDropEnrollment(
	role: string | null | undefined,
	record: StudentEnrollmentRecord
) {
	return (
		(role === Role.ADMIN || role === Role.REGISTRAR) &&
		record.student.currentEnrollmentId === record.enrollment.id &&
		record.enrollment.status === 'enrolled'
	);
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

export async function getStudentEnrollmentHistory(userId: string) {
	// Scope history to the authenticated student, never a supplied account ID.
	const record = await db.query.studentData.findFirst({
		where: eq(studentData.userId, userId),
		columns: { studentId: true, currentEnrollmentId: true },
		with: {
			enrollments: {
				orderBy: (enrollment, { desc }) => [
					desc(enrollment.schoolYearStart),
					desc(enrollment.semester),
					desc(enrollment.enrolledAt),
					desc(enrollment.id)
				],
				with: {
					curriculum: {
						columns: { name: true, programCode: true },
						with: { program: { columns: { code: true, name: true } } }
					},
					subjects: {
						columns: {
							id: true,
							subjectCode: true,
							subjectName: true,
							source: true,
							units: true,
							grade: true
						},
						orderBy: (entry, { asc }) => [asc(entry.subjectCode), asc(entry.id)]
					}
				}
			}
		}
	});
	return record
		? {
				...record,
				enrollments: record.enrollments.map((enrollment) => ({
					...enrollment,
					subjects: enrollment.subjects.map((subject) => ({
						...subject,
						grade: enrollment.finalizedGrades ? subject.grade : null
					}))
				}))
			}
		: null;
}
