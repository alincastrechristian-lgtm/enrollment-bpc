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

export type CurriculumPrerequisiteEntry = {
	subjectId: string;
	yearLevel: number;
	semester: number;
	prerequisiteIds: string[];
};

export function getCurriculumPrerequisiteError(
	entries: CurriculumPrerequisiteEntry[]
): string | null {
	const subjects = new Map(entries.map((entry) => [entry.subjectId, entry]));
	for (const [index, entry] of entries.entries()) {
		const label = `Subject ${index + 1}`;
		if (new Set(entry.prerequisiteIds).size !== entry.prerequisiteIds.length)
			return `${label}: each prerequisite can only appear once.`;
		for (const id of entry.prerequisiteIds) {
			if (id === entry.subjectId) return `${label}: a subject cannot require itself.`;
			const required = subjects.get(id);
			if (!required)
				return `${label}: add every prerequisite to this curriculum or remove its link.`;
			// Strictly earlier placement also rules out direct and indirect dependency cycles.
			if (
				required.yearLevel > entry.yearLevel ||
				(required.yearLevel === entry.yearLevel && required.semester >= entry.semester)
			)
				return `${label}: prerequisites must be scheduled in an earlier year or semester of this curriculum.`;
		}
	}
	return null;
}

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
