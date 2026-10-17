export const studentSexValues = ['female', 'male'] as const;
export type StudentSex = (typeof studentSexValues)[number];

export function formatStudentSex(value: StudentSex | null | undefined) {
	return value === 'female' ? 'Female' : value === 'male' ? 'Male' : 'Not recorded';
}

// Birth dates are calendar dates, never timestamps in a viewer's local timezone.
export function formatBirthDate(value: string | null | undefined) {
	return value
		? new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', dateStyle: 'medium' }).format(
				new Date(`${value}T00:00:00Z`)
			)
		: 'Not recorded';
}

export function todayInManila() {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Asia/Manila',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(new Date());
	return ['year', 'month', 'day']
		.map((type) => parts.find((part) => part.type === type)!.value)
		.join('-');
}
