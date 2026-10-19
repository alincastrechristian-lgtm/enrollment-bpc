import { Role } from '#lib/Roles.js';
import { enrollment, enrollmentSubject, user } from '#lib/schema.js';
import { and, eq, exists, isNotNull, isNull, ne, or, sql, type SQLWrapper } from 'drizzle-orm';

export const hasFailedGrades = exists(sql`(select 1 from ${enrollmentSubject}
	where ${enrollmentSubject.enrollmentId} = ${enrollment.id} and ${enrollmentSubject.grade} > 3)`);

export function currentEnrollmentWorklist(fields: {
	setupComplete: SQLWrapper;
	status: SQLWrapper;
	finalized: SQLWrapper;
	clearance: SQLWrapper;
	followUpCompletedAt: SQLWrapper;
	hasFailedGrades: SQLWrapper;
}) {
	return {
		Grades: and(
			eq(fields.status, 'enrolled'),
			eq(fields.finalized, false),
			eq(fields.setupComplete, true)
		)!,
		Clearance: and(
			eq(fields.status, 'enrolled'),
			eq(fields.finalized, true),
			eq(fields.clearance, false)
		)!,
		'Account setup': eq(fields.setupComplete, false),
		'Next term': and(
			eq(fields.status, 'completed'),
			eq(fields.finalized, true),
			eq(fields.clearance, true),
			or(eq(fields.hasFailedGrades, 0), isNotNull(fields.followUpCompletedAt))
		)!
	};
}

// Follow-ups include historical enrollments, independently of the current enrollment link.
export const needsEnrollmentFollowUp = and(
	eq(user.role, Role.STUDENT),
	ne(enrollment.status, 'dropped'),
	ne(enrollment.status, 'voided'),
	eq(enrollment.finalizedGrades, true),
	isNull(enrollment.followUpCompletedAt),
	exists(sql`(select 1 from ${enrollmentSubject}
		where ${enrollmentSubject.enrollmentId} = ${enrollment.id}
		and (${enrollmentSubject.grade} > 3 or ${enrollmentSubject.grade} is null))`)
)!;
