export type IdentityStudent = { name: string; studentNumber: string };
export type IdentityReadings = IdentityStudent & {
	warnings?: Partial<Record<keyof IdentityStudent, string>>;
};
export type IdentityField = {
	detected: string;
	expected: string;
	status: 'exact' | 'close' | 'different' | 'unreadable';
	similarity: number | null;
	detail: string;
};
export type IdentityResult = {
	warnings?: IdentityReadings['warnings'];
	verdict: 'match' | 'review' | 'mismatch';
	detail: string;
	name: IdentityField;
	studentNumber: IdentityField;
};

const normalize = (value: string) =>
	value
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toUpperCase()
		.replace(/[^\p{L}\p{N}?]/gu, '');

function distance(a: string, b: string): number {
	let row = Array.from({ length: b.length + 1 }, (_, index) => index);
	for (let i = 0; i < a.length; i++) {
		const next = [i + 1];
		for (let j = 0; j < b.length; j++)
			next[j + 1] = Math.min(next[j] + 1, row[j + 1] + 1, row[j] + Number(a[i] !== b[j]));
		row = next;
	}
	return row[b.length];
}

function compareField(detected: string, expected: string, number: boolean): IdentityField {
	// Bound comparison work; callers also validate model output length.
	let actual = normalize(detected.slice(0, 320));
	let target = normalize(expected.slice(0, 320));
	const numericNumber = number && /^(?:MA)?\d+$/.test(target);
	if (numericNumber) {
		// MA- may be preprinted, written by the student, or present in both places.
		// Strip only this known prefix; never discard arbitrary letters or change digits.
		target = target.replace(/^MA/, '');
		actual = actual.replace(/^(?:MA){1,2}(?=[\d?]+$)/, '');
	}
	const base = { detected, expected };
	if (!target || !actual.replace(/\?/g, '') || (number && !/\d/.test(actual)))
		return {
			...base,
			status: 'unreadable',
			similarity: null,
			detail: 'Not enough readable text to compare.'
		};
	const edits = distance(actual, target);
	const similarity = Math.round((1 - edits / Math.max(actual.length, target.length)) * 100);
	if (actual === target && !actual.includes('?'))
		return {
			...base,
			status: 'exact',
			similarity,
			detail: numericNumber
				? 'All student-number digits match. Optional printed or handwritten MA- prefix ignored.'
				: 'Matches after ignoring spacing, punctuation and case.'
		};
	if (number) {
		if (/^\d{6,}$/.test(target) && /^[\d?]+$/.test(actual) && target.length === actual.length) {
			if (edits === 1)
				return {
					...base,
					status: 'close',
					similarity,
					detail:
						'One digit differs or is unclear. Check the original image; do not approve automatically.'
				};
		}
	} else if (actual.length >= 6 && target.length >= 6 && similarity >= 80) {
		return {
			...base,
			status: 'close',
			similarity,
			detail: `${edits} character edit${edits === 1 ? '' : 's'} from the recorded name. Confirm spelling.`
		};
	}
	return {
		...base,
		status: 'different',
		similarity,
		detail: number
			? 'Student number differs beyond the one-digit tolerance, or digits are missing.'
			: 'Name differs beyond the matching tolerance. Poor handwriting recognition can also cause this.'
	};
}

export function matchIdentity(
	detected: IdentityReadings,
	expected: IdentityStudent
): IdentityResult {
	const name = compareField(detected.name, expected.name, false);
	const studentNumber = compareField(detected.studentNumber, expected.studentNumber, true);
	if (detected.warnings && Object.keys(detected.warnings).length)
		return {
			verdict: 'review',
			detail:
				'Some handwriting could not be read reliably. Check the original image or upload a clearer copy.',
			warnings: detected.warnings,
			name,
			studentNumber
		};
	if (studentNumber.status === 'exact' && name.status !== 'different')
		return {
			verdict: 'match',
			detail:
				'Student number matches this record. Identity evidence only; clearance remains unverified.',
			name,
			studentNumber
		};
	if (
		[name.status, studentNumber.status].some((status) => status === 'exact' || status === 'close')
	)
		return {
			verdict: 'review',
			detail:
				studentNumber.status === 'exact'
					? 'Student number matches, but the name differs. Review the original image.'
					: 'Some details match closely. Confirm against the original image before accepting.',
			name,
			studentNumber
		};
	if (name.status === 'unreadable' && studentNumber.status === 'unreadable')
		return {
			verdict: 'review',
			detail: 'No usable identity text. Adjust the border or upload a clearer image.',
			name,
			studentNumber
		};
	return {
		verdict: 'mismatch',
		detail:
			'No sufficient match to this student record. Inspect the image or retry with a clearer scan.',
		name,
		studentNumber
	};
}
