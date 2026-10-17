import type { enrollment } from '#lib/schema.js';

// Shared by enrollment writes, page loads, and reactive staff views.
export function getEnrollmentLockReason(
	current: Pick<
		typeof enrollment.$inferSelect,
		'finalizedGrades' | 'submittedClearance' | 'status' | 'followUpCompletedAt'
	> | null,
	failedCount: number
) {
	if (current?.status === 'dropped' || current?.status === 'voided') return null;
	if (current && (!current.finalizedGrades || !current.submittedClearance))
		return 'Finalize grades and verify clearance for the current enrollment before enrolling this student again.';
	if (current && failedCount > 0 && !current.followUpCompletedAt)
		return 'Complete the meeting with the Registrar for the current enrollment’s failed grades before enrolling this student again. Send a meeting request, then mark the follow-up as completed after the meeting.';
	return null;
}

export function getGradeStatus(grade: number | null, finalized: boolean) {
	if (!finalized) return 'Pending';
	if (grade === null) return 'Incomplete';
	return grade > 3 ? 'Failed' : 'Passed';
}

export function getGradeConcerns(subjects: { grade: number | null }[], finalized: boolean) {
	return {
		failedCount: subjects.filter((subject) => getGradeStatus(subject.grade, finalized) === 'Failed')
			.length,
		incompleteCount: subjects.filter(
			(subject) => getGradeStatus(subject.grade, finalized) === 'Incomplete'
		).length
	};
}
