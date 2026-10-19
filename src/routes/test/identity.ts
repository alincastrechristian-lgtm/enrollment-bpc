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
	const actual = normalize(detected.slice(0, 320));
	const target = normalize(expected.slice(0, 320));
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
			detail: 'Matches after ignoring spacing, punctuation and case.'
		};
	if (number) {
		// The template prints MA-. A numeric-only extraction may omit it; never invent digits.
		const digits = target.startsWith('MA') ? target.slice(2) : target;
		const observedDigits = actual.startsWith('MA') ? actual.slice(2) : actual;
		if (
			/^\d{6,}$/.test(digits) &&
			/^[\d?]+$/.test(observedDigits) &&
			digits.length === observedDigits.length
		) {
			const digitEdits = distance(observedDigits, digits);
			if (digitEdits <= 1)
				return {
					...base,
					status: 'close',
					similarity,
					detail:
						digitEdits === 0
							? 'All digits match, but the printed MA- prefix was not read. Confirm the image.'
							: 'One digit differs or is unclear. Check the original image; do not approve automatically.'
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
			: 'Name differs beyond the test tolerance. Poor handwriting recognition can also cause this.'
	};
}

export function matchIdentity(
	detected: IdentityStudent,
	expected: IdentityStudent
): IdentityResult {
	const name = compareField(detected.name, expected.name, false);
	const studentNumber = compareField(detected.studentNumber, expected.studentNumber, true);
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
