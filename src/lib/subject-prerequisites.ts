import { getGradeStatus } from '#lib/enrollment-grades.js';

export type EnrollmentTerm = { schoolYearStart: number; semester: number };
export type PrerequisiteRequirement = {
	subjectId: string;
	prerequisiteId: string;
	code: string;
	name: string;
};
export type PrerequisiteAttempt = EnrollmentTerm & {
	subjectId: string;
	grade: number | null;
	finalizedGrades: boolean;
};

function compareTerm(first: EnrollmentTerm, second: EnrollmentTerm) {
	return first.schoolYearStart - second.schoolYearStart || first.semester - second.semester;
}

// Only the latest valid attempt before the target term can satisfy a prerequisite.
export function getMissingPrerequisites(
	requirements: PrerequisiteRequirement[],
	attempts: PrerequisiteAttempt[],
	term: EnrollmentTerm
) {
	const latest = new Map<string, PrerequisiteAttempt>();
	for (const attempt of attempts) {
		if (compareTerm(attempt, term) >= 0) continue;
		const previous = latest.get(attempt.subjectId);
		if (!previous || compareTerm(attempt, previous) > 0) latest.set(attempt.subjectId, attempt);
	}
	return requirements.flatMap((requirement) => {
		const attempt = latest.get(requirement.prerequisiteId);
		const status = attempt
			? getGradeStatus(attempt.grade, attempt.finalizedGrades)
			: 'Not completed';
		return status === 'Passed' ? [] : [{ ...requirement, status }];
	});
}
