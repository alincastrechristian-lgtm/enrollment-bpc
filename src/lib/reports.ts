export const reportTypes = [
	{
		value: 'summary',
		label: 'Enrollment summary',
		description: 'Enrollment counts by program, year level, section, and status.'
	},
	{
		value: 'grades',
		label: 'Grade report',
		description: 'Subject grades and outcomes, with draft and finalized grades clearly identified.'
	},
	{
		value: 'attention',
		label: 'Students needing attention',
		description: 'Grade concerns, unfinished follow-ups, and outstanding academic requirements.'
	},
	{
		value: 'completion',
		label: 'Enrollment completion',
		description:
			'Grade release, clearance, registrar follow-up, and readiness for next-term enrollment.'
	},
	{
		value: 'dropped',
		label: 'Dropped enrollments',
		description: 'Dropped enrollment records and their recorded drop dates.'
	}
] as const;

export type ReportKind = (typeof reportTypes)[number]['value'];
export type ReportRow = {
	id: string;
	cells: (string | number)[];
	userId?: string;
	enrollmentId?: string;
};
