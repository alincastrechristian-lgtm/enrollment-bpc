import type { getStudentEnrollmentHistory } from './student-enrollment';

type EnrollmentHistory = Awaited<ReturnType<typeof getStudentEnrollmentHistory>>;

export function buildStudentDashboard(name: string, record: EnrollmentHistory) {
	// The explicit current enrollment link is authoritative, even when a newer record exists.
	const current = record?.enrollments.find((entry) => entry.id === record.currentEnrollmentId);
	const finalized = current?.finalizedGrades ?? false;
	const subjects = (current?.subjects ?? []).map((subject) => {
		// Never expose provisional grades or derive results from them.
		const grade = finalized ? subject.grade : null;
		const status = !finalized
			? 'Pending'
			: grade === null
				? 'Incomplete'
				: grade > 3
					? 'Failed'
					: 'Passed';
		return {
			id: subject.id,
			code: subject.subjectCode,
			name: subject.subjectName,
			units: subject.units,
			grade: grade === null ? (finalized ? 'INC' : '—') : grade.toFixed(2),
			status
		};
	});
	const failed = subjects.filter((subject) => subject.status === 'Failed');
	const incomplete = subjects.filter((subject) => subject.status === 'Incomplete');
	const nextSteps: { id: string; title: string; detail: string }[] = [];
	if (incomplete.length)
		nextSteps.push({
			id: 'incomplete',
			title: 'Follow up on incomplete grades',
			detail: `Ask your instructors about outstanding requirements for ${incomplete.map((subject) => subject.code).join(', ')}.`
		});
	if (failed.length)
		nextSteps.push({
			id: 'failed',
			title: 'Get advice about your failing grades',
			detail: `Visit the Registrar's Office to discuss ${failed.map((subject) => subject.code).join(', ')} and your enrollment options.`
		});
	if (!nextSteps.length)
		nextSteps.push(
			!current
				? {
						id: 'enrollment',
						title: 'Check your enrollment status',
						detail:
							'No current enrollment is assigned. Review your enrollment history or contact the Registrar’s Office for assistance.'
					}
				: !finalized
					? {
							id: 'grades',
							title: 'Watch for your final grades',
							detail:
								'Your grades have not been finalized yet. They will appear here once they are released.'
						}
					: {
							id: 'history',
							title: 'Review your academic record',
							detail:
								'No failing or incomplete grades are recorded in your current enrollment. You can review previous terms in enrollment history.'
						}
		);
	return {
		studentName: name.trim().split(/\s+/)[0] || 'Student',
		studentNumber: record?.studentId ?? null,
		enrollment: current
			? {
					programCode: current.curriculum.programCode,
					yearLevel: current.yearLevel,
					section: current.section,
					term: `Semester ${current.semester}`,
					schoolYear: `${current.schoolYearStart}–${current.schoolYearStart + 1}`,
					status: current.status,
					finalizedGrades: finalized
				}
			: null,
		subjects,
		passedCount: finalized
			? subjects.filter((subject) => subject.status === 'Passed').length
			: null,
		failedCount: failed.length,
		incompleteCount: incomplete.length,
		attentionCount: failed.length + incomplete.length,
		totalUnits: subjects.reduce((total, subject) => total + subject.units, 0),
		nextSteps
	};
}

export type StudentDashboardData = ReturnType<typeof buildStudentDashboard>;
