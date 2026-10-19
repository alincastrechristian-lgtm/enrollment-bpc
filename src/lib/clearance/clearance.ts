export type Point = { x: number; y: number };
export type Corners = [Point, Point, Point, Point];
export type Region = { x: number; y: number; width: number; height: number };
export type Verdict = 'pass' | 'review' | 'fail';
export type Check = { label: string; verdict: Verdict; detail: string };
export type Expected = {
	name: string;
	studentNumber: string;
	course: string;
	year: string;
	section: string;
	semester: string;
	schoolYear: string;
};
export type Reading = { text: string; confidence: number };
export type Scan = {
	school: Reading;
	formTitle: Reading;
	semester: Reading;
	academicYear: Reading;
	departments: Reading;
	name: Reading;
	studentNumber: Reading;
	classDetails: Reading;
	rows: { department: string; cleared: number; notCleared: number; signature: number }[];
};

export const WIDTH = 1000;
export const HEIGHT = 820;
export const DEPARTMENTS = ['SG Adviser', 'PTCA', 'Adviser', 'Research', 'Program Head'];
// Printed border corners in the supplied photograph, clockwise from top left.
export const REFERENCE_CORNERS: Corners = [
	{ x: 53 / 976, y: 21 / 750 },
	{ x: 895 / 976, y: 0 },
	{ x: 957 / 976, y: 646 / 750 },
	{ x: 74 / 976, y: 718 / 750 }
];

export function validCorners(points: Corners): boolean {
	if (points.some(({ x, y }) => !Number.isFinite(x + y) || x < 0 || x > 1 || y < 0 || y > 1))
		return false;
	let area = 0;
	for (let i = 0; i < 4; i++) {
		const a = points[i],
			b = points[(i + 1) % 4],
			c = points[(i + 2) % 4];
		if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0.001) return false;
		area += a.x * b.y - b.x * a.y;
	}
	return area / 2 > 0.05;
}

// Projective transform from four source points to four destination points.
export function homography(from: Corners, to: Corners): number[] {
	const rows: number[][] = [];
	for (let i = 0; i < 4; i++) {
		const { x, y } = from[i],
			{ x: u, y: v } = to[i];
		rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
		rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
	}
	for (let col = 0; col < 8; col++) {
		let pivot = col;
		for (let row = col + 1; row < 8; row++)
			if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
		[rows[col], rows[pivot]] = [rows[pivot], rows[col]];
		const divisor = rows[col][col];
		if (Math.abs(divisor) < 1e-10)
			throw new Error('Form corners overlap. Select four distinct corners.');
		for (let j = col; j <= 8; j++) rows[col][j] /= divisor;
		for (let row = 0; row < 8; row++) {
			if (row === col) continue;
			const factor = rows[row][col];
			for (let j = col; j <= 8; j++) rows[row][j] -= factor * rows[col][j];
		}
	}
	return [...rows.map((row) => row[8]), 1];
}

export function project(matrix: number[], { x, y }: Point): Point {
	const w = matrix[6] * x + matrix[7] * y + 1;
	return {
		x: (matrix[0] * x + matrix[1] * y + matrix[2]) / w,
		y: (matrix[3] * x + matrix[4] * y + matrix[5]) / w
	};
}

export const UNIT_CORNERS: Corners = [
	{ x: 0, y: 0 },
	{ x: 1, y: 0 },
	{ x: 1, y: 1 },
	{ x: 0, y: 1 }
];
const referenceMap = homography(REFERENCE_CORNERS, UNIT_CORNERS);

function region(left: number, top: number, right: number, bottom: number): Region {
	const a = project(referenceMap, { x: left / 976, y: top / 750 });
	const b = project(referenceMap, { x: right / 976, y: bottom / 750 });
	return {
		x: Math.round(a.x * WIDTH),
		y: Math.round(a.y * HEIGHT),
		width: Math.round((b.x - a.x) * WIDTH),
		height: Math.round((b.y - a.y) * HEIGHT)
	};
}

// Separate printed lines in the straightened form; exclude border and italic address.
export const PRINTED_REGIONS = {
	school: { x: 285, y: 8, width: 450, height: 36 },
	formTitle: { x: 320, y: 102, width: 370, height: 40 },
	// Keep the complete term line: isolated italic "Semester" loses strokes during OCR.
	semester: { x: 330, y: 141, width: 355, height: 36 },
	academicYear: { x: 535, y: 141, width: 135, height: 36 },
	departments: region(90, 211, 294, 416)
};
export const REGIONS = {
	...PRINTED_REGIONS,
	// Include signatures above the handwritten name; stop before the printed name label.
	name: { x: 25, y: 550, width: 625, height: 105 },
	studentNumber: region(260, 563, 548, 586),
	classDetails: region(278, 600, 542, 620)
} satisfies Record<Exclude<keyof Scan, 'rows'>, Region>;
export type PrintedReadings = Pick<Scan, keyof typeof PRINTED_REGIONS>;
export const READING_LABELS: Record<keyof typeof REGIONS, string> = {
	school: 'School name',
	formTitle: 'Form title',
	semester: 'Semester',
	academicYear: 'Academic year',
	departments: 'Department labels',
	name: 'Student name',
	studentNumber: 'Student number',
	classDetails: 'Course, year and section'
};
export const ROW_REGIONS = DEPARTMENTS.map((department, i) => ({
	department,
	cleared: region(310 + i * 2, 219 + i * 41, 329 + i * 2, 234 + i * 41),
	notCleared: region(435 + i * 2, 214 + i * 41, 454 + i * 2, 229 + i * 41),
	signature: region(591, 193 + i * 41, 774, 212 + i * 41)
}));

const normalize = (value: string) =>
	value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '');

function compare(label: string, reading: Reading, expected: string): Check {
	if (!expected.trim())
		return { label, verdict: 'review', detail: 'Enter expected value to compare.' };
	if (!normalize(reading.text))
		return {
			label,
			verdict: 'review',
			detail: 'No readable text. Inspect crop or try a clearer scan.'
		};
	if (reading.confidence < 65)
		return {
			label,
			verdict: 'review',
			detail: `Low OCR confidence (${Math.round(reading.confidence)}%). Inspect reading.`
		};
	return normalize(reading.text) === normalize(expected)
		? { label, verdict: 'pass', detail: `Matches ${expected}.` }
		: { label, verdict: 'fail', detail: `Read “${reading.text.trim()}”; expected “${expected}”.` };
}

export function evaluatePrinted(
	scan: PrintedReadings,
	expected: Pick<Expected, 'semester' | 'schoolYear'>
): Check[] {
	const school = compare('School name', scan.school, 'BULACAN POLYTECHNIC COLLEGE');
	const title = compare('Form title', scan.formTitle, 'Student Clearance Form');
	const labels = scan.departments.text.split(/\r?\n/).map(normalize).filter(Boolean);
	const layout =
		labels.length === DEPARTMENTS.length &&
		DEPARTMENTS.every((name, i) => labels[i] === normalize(name));
	const semester = scan.semester.text.match(/^\s*([12])\s*(?:st|nd)?\s*Semester\b/i)?.[1];
	const year = scan.academicYear.text.match(/\b(20\d{2})\s*[-–—]\s*(20\d{2})\b/);
	const term = year ? `${year[1]}-${year[2]}` : '';
	const yearCheck: Check =
		year && Number(year[2]) !== Number(year[1]) + 1
			? {
					label: 'Academic year',
					verdict: 'fail',
					detail: 'Academic year must contain two consecutive years.'
				}
			: compare(
					'Academic year',
					{ text: term, confidence: scan.academicYear.confidence },
					expected.schoolYear
				);
	return [
		school,
		title,
		{
			label: 'Department layout',
			verdict: layout && scan.departments.confidence >= 65 ? 'pass' : 'review',
			detail: layout
				? 'All five department labels found in expected area.'
				: 'Department labels incomplete. Check alignment or form version.'
		},
		compare(
			'Semester',
			{ text: semester ?? '', confidence: scan.semester.confidence },
			expected.semester
		),
		yearCheck
	];
}

export function evaluate(scan: Scan, expected: Expected): Check[] {
	const classCheck: Check =
		expected.course.trim() && expected.year.trim() && expected.section.trim()
			? compare(
					'Course, year and section',
					scan.classDetails,
					`${expected.course} ${expected.year} ${expected.section}`
				)
			: {
					label: 'Course, year and section',
					verdict: 'review',
					detail: 'Enter expected course, year and section.'
				};
	const checks: Check[] = [
		...evaluatePrinted(scan, expected),
		compare('Student name', scan.name, expected.name),
		compare('Student number', scan.studentNumber, expected.studentNumber),
		classCheck
	];
	const aligned = checks.slice(0, 3).every((check) => check.verdict === 'pass');
	for (const row of scan.rows) {
		let verdict: Verdict = 'pass';
		let detail = 'Cleared marked; Not Cleared blank; signature/stamp ink detected.';
		if (!aligned) {
			verdict = 'review';
			detail = 'Template not confirmed. Check alignment before interpreting marks.';
		} else if (row.notCleared >= 0.04) {
			verdict = 'fail';
			detail =
				row.cleared >= 0.04 ? 'Both checkboxes appear marked.' : 'Not Cleared appears marked.';
		} else if (row.cleared < 0.015 || row.signature < 0.003) {
			verdict = 'fail';
			detail =
				row.cleared < 0.015
					? 'Cleared checkbox appears blank.'
					: 'No signature/stamp ink detected.';
		} else if (row.cleared < 0.04 || row.notCleared >= 0.015 || row.signature < 0.008) {
			verdict = 'review';
			detail = 'Faint or ambiguous marks. Inspect highlighted areas.';
		}
		checks.push({ label: row.department, verdict, detail });
	}
	return checks;
}

export function overall(checks: Check[]): Verdict {
	return checks.some((check) => check.verdict === 'fail')
		? 'fail'
		: checks.some((check) => check.verdict === 'review') || !checks.length
			? 'review'
			: 'pass';
}

// Local adaptive threshold ignores page lighting; a dilated reference mask removes printed ink.
export function addedInk(
	scan: Uint8Array,
	reference: Uint8Array,
	width: number,
	height: number,
	box: Region
): number {
	let ink = 0,
		count = 0;
	for (let y = Math.max(0, box.y); y < Math.min(height, box.y + box.height); y++) {
		for (let x = Math.max(0, box.x); x < Math.min(width, box.x + box.width); x++) {
			let printed = false;
			for (let dy = -2; dy <= 2 && !printed; dy++)
				for (let dx = -2; dx <= 2; dx++)
					if (
						x + dx >= 0 &&
						x + dx < width &&
						y + dy >= 0 &&
						y + dy < height &&
						reference[(y + dy) * width + x + dx]
					) {
						printed = true;
						break;
					}
			if (!printed) {
				count++;
				if (scan[y * width + x]) ink++;
			}
		}
	}
	return count ? ink / count : 0;
}
