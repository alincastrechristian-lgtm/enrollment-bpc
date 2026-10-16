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
