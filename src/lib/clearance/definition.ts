import { z } from 'zod';
import { validCorners, type Check, type Reading } from './clearance';

const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
export const boxSchema = z
	.object({
		x: z.number().min(0).max(1),
		y: z.number().min(0).max(1),
		width: z.number().min(0.015, 'Draw or size each area on the reference.').max(1),
		height: z.number().min(0.015, 'Draw or size each area on the reference.').max(1)
	})
	.strict()
	.refine(
		(b) => b.x + b.width <= 1.000001 && b.y + b.height <= 1.000001,
		'Keep the area inside the form.'
	);
export const PERSONAL_FIELD_LABELS = {
	studentName: 'Student name',
	studentNumber: 'Student number',
	course: 'Course',
	year: 'Year level',
	section: 'Section',
	courseYearSection: 'Course, year and section (combined)'
} as const;
export const personalFieldSchema = z
	.object({
		id: z.string().uuid(),
		field: z.enum([
			'studentName',
			'studentNumber',
			'course',
			'year',
			'section',
			'courseYearSection'
		]),
		box: boxSchema
	})
	.strict();
export type PersonalFieldArea = z.infer<typeof personalFieldSchema>;
export type PersonalFieldKind = PersonalFieldArea['field'];
export const OFFICE_AREA_LABELS = {
	office: 'Office name',
	cleared: 'Cleared checkbox',
	signature: 'Signature / stamp'
} as const;
export type OfficeAreaKind = keyof typeof OFFICE_AREA_LABELS;
export const officeRowSchema = z
	.object({
		id: z.string().uuid(),
		label: z.string().trim().min(1).max(100),
		office: boxSchema,
		cleared: boxSchema.optional(),
		signature: boxSchema.optional()
	})
	.strict();
export type OfficeRow = z.infer<typeof officeRowSchema>;
export const officeRowsSchema = z
	.array(officeRowSchema)
	.max(30)
	.superRefine((rows, ctx) => {
		if (
			new Set(rows.map((row) => row.id)).size !== rows.length ||
			new Set(rows.map((row) => row.label.toLowerCase())).size !== rows.length
		)
			ctx.addIssue({ code: 'custom', message: 'Use unique office names and rows.' });
	});
export const personalFieldsSchema = z
	.array(personalFieldSchema)
	.max(5)
	.superRefine((fields, ctx) => {
		if (
			new Set(fields.map((a) => a.field)).size !== fields.length ||
			new Set(fields.map((a) => a.id)).size !== fields.length
		)
			ctx.addIssue({ code: 'custom', message: 'Use one area per personal field.' });
		if (
			fields.some((a) => a.field === 'courseYearSection') &&
			fields.some((a) => ['course', 'year', 'section'].includes(a.field))
		)
			ctx.addIssue({
				code: 'custom',
				message: 'Use either a combined course/year/section area or separate areas.'
			});
	});
export const areaSchema = z
	.object({
		id: z.string().uuid(),
		label: z.string().trim().min(1).max(60),
		kind: z.enum(['text', 'image', 'semester', 'academicYear']),
		expected: z.string().trim().max(1000),
		box: boxSchema
	})
	.strict()
	.refine((a) => a.kind !== 'text' || a.expected.length > 0, 'Enter expected printed text.');
export type TemplateArea = z.infer<typeof areaSchema>;
export const clearanceTermSchema = z.object({
	semester: z.string().regex(/^[1-9]\d*$/, 'Enter a valid semester.'),
	schoolYear: z
		.string()
		.regex(/^20\d{2}-20\d{2}$/, 'Enter an academic year such as 2025-2026.')
		.refine(
			(v) => Number(v.slice(5)) === Number(v.slice(0, 4)) + 1,
			'Use consecutive academic years.'
		)
});
export type ClearanceTerm = z.infer<typeof clearanceTermSchema>;
export function clearanceTermFromEnrollment(enrollment: {
	semester: number;
	schoolYearStart: number;
}): ClearanceTerm {
	return {
		semester: String(enrollment.semester),
		schoolYear: `${enrollment.schoolYearStart}-${enrollment.schoolYearStart + 1}`
	};
}
export const definitionSchema = z
	.object({
		corners: z
			.tuple([point, point, point, point])
			.refine(validCorners, 'Confirm four valid form corners.'),
		// Accept existing stored definitions and older clients; discard their fixed term values.
		semester: z.enum(['1', '2']).optional(),
		schoolYear: clearanceTermSchema.shape.schoolYear.optional(),
		areas: z
			.array(areaSchema)
			.min(4, 'Add school name, form title, semester and academic year areas.')
			.max(20),
		personalFields: personalFieldsSchema.optional(),
		officeRows: officeRowsSchema.optional()
	})
	.strict()
	.superRefine(({ areas }, ctx) => {
		const kinds = areas.map((a) => a.kind);
		if (
			kinds.filter((k) => k === 'text').length < 2 ||
			kinds.filter((k) => k === 'semester').length !== 1 ||
			kinds.filter((k) => k === 'academicYear').length !== 1
		)
			ctx.addIssue({
				code: 'custom',
				message:
					'Mark at least two printed text areas (school and form title), one semester and one academic year. Logo areas are optional.'
			});
		if (
			new Set(areas.map((a) => a.id)).size !== areas.length ||
			new Set(areas.map((a) => a.label.toLowerCase())).size !== areas.length
		)
			ctx.addIssue({ code: 'custom', message: 'Use unique area labels.' });
	})
	.transform(({ corners, areas, personalFields, officeRows }) => ({
		corners,
		areas: areas.map((area) =>
			area.kind === 'semester' || area.kind === 'academicYear' ? { ...area, expected: '' } : area
		),
		...(personalFields ? { personalFields } : {}),
		...(officeRows ? { officeRows } : {})
	}));
export type TemplateDefinition = z.infer<typeof definitionSchema>;
export function hasIdentityAreas(definition: Pick<TemplateDefinition, 'personalFields'>) {
	return ['studentName', 'studentNumber'].every((field) =>
		definition.personalFields?.some((area) => area.field === field)
	);
}
export type TemplateInfo = {
	revision: string;
	filename: string;
	definition: TemplateDefinition | null;
};
export type Box = TemplateArea['box'];

// Leave room for italic year strokes and OCR segmentation without changing the saved box.
export function printedAreaBox(area: TemplateArea): Box {
	if (area.kind !== 'academicYear') return area.box;
	const padding = area.box.height / 8;
	const x = Math.max(0, area.box.x - padding),
		y = Math.max(0, area.box.y - padding);
	return {
		x,
		y,
		width: Math.min(1, area.box.x + area.box.width + padding) - x,
		height: Math.min(1, area.box.y + area.box.height + padding) - y
	};
}

// Bound nearby text searches to 5% of form width and 3.5% of form height around the saved area.
// Saved boxes remain unchanged; text elsewhere on a different layout cannot satisfy the check.
export function printedSearchBox(area: TemplateArea): Box {
	if (area.kind === 'image') return area.box;
	const box = printedAreaBox(area);
	const x = Math.max(0, box.x - 0.05),
		y = Math.max(0, box.y - 0.035);
	return {
		x,
		y,
		width: Math.min(1, box.x + box.width + 0.05) - x,
		height: Math.min(1, box.y + box.height + 0.035) - y
	};
}

const normalize = (text: string) =>
	text
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '');
export function checkAreaText(area: TemplateArea, reading: Reading, term: ClearanceTerm): Check {
	let actual = reading.text;
	let expected = area.expected;
	if (area.kind === 'semester') {
		const semesters = [...reading.text.matchAll(/\b([1-9]\d*)\s*(?:st|nd|rd|th)?\s*Semester\b/gi)];
		actual = new Set(semesters.map((match) => match[1])).size === 1 ? semesters[0][1] : '';
		expected = term.semester;
	} else if (area.kind === 'academicYear') {
		const years = [...reading.text.matchAll(/\b(20\d{2})\s*[-–—]\s*(20\d{2})\b/g)].map(
			(match) => `${match[1]}-${match[2]}`
		);
		actual = new Set(years).size === 1 ? years[0] : '';
		expected = term.schoolYear;
	}
	if (!normalize(actual) || !normalize(expected) || reading.confidence < 65)
		return {
			label: area.label,
			verdict: 'review',
			detail: `Text unclear. Read “${reading.text.trim()}”. Check this area or use a clearer image.`
		};
	return {
		label: area.label,
		verdict: (
			area.kind === 'text'
				? normalize(actual).includes(normalize(expected))
				: normalize(actual) === normalize(expected)
		)
			? 'pass'
			: 'fail',
		detail: `Read “${reading.text.trim()}”; expected “${expected}”.`
	};
}

// Otsu thresholding compares printed shapes in black and white despite paper/exposure differences.
function blackAndWhite(gray: Uint8Array): Uint8Array {
	const histogram = new Uint32Array(256);
	let sum = 0,
		low = 255,
		high = 0;
	for (const value of gray) {
		histogram[value]++;
		sum += value;
		low = Math.min(low, value);
		high = Math.max(high, value);
	}
	if (high - low < 24) return new Uint8Array(gray.length).fill(255);
	let count = 0,
		backgroundSum = 0,
		best = -1,
		threshold = 127;
	for (let value = 0; value < 255; value++) {
		count += histogram[value];
		backgroundSum += value * histogram[value];
		if (!count || count === gray.length) continue;
		const difference = backgroundSum / count - (sum - backgroundSum) / (gray.length - count);
		const variance = count * (gray.length - count) * difference * difference;
		if (variance > best) {
			best = variance;
			threshold = value;
		}
	}
	return Uint8Array.from(gray, (value) => (value <= threshold ? 0 : 255));
}

// Normalized correlation preserves relative shapes while tolerating exposure changes.
// Both patches must contain detail: two empty areas must never count as a match.
export function compareVisual(
	reference: Uint8Array,
	actual: Uint8Array,
	width: number,
	height: number
): { score: number; verdict: Check['verdict'] } {
	if (
		reference.length !== width * height ||
		actual.length !== reference.length ||
		width < 8 ||
		height < 8
	)
		throw new Error('Invalid visual patches.');
	reference = blackAndWhite(reference);
	actual = blackAndWhite(actual);
	let best = -1;
	// Small local scale changes occur in photocopies even after page alignment.
	// Keep the same shape/detail and correlation requirements for every candidate.
	for (const scaleY of [0.9, 1, 1.1])
		for (const scaleX of [0.9, 1, 1.1])
			for (let dy = -2; dy <= 2; dy++)
				for (let dx = -2; dx <= 2; dx++) {
					let n = 0,
						a = 0,
						b = 0,
						aa = 0,
						bb = 0,
						ab = 0;
					for (let y = 2; y < height - 2; y++)
						for (let x = 2; x < width - 2; x++) {
							const sx = (x - (width - 1) / 2) * scaleX + (width - 1) / 2 + dx,
								sy = (y - (height - 1) / 2) * scaleY + (height - 1) / 2 + dy;
							if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) continue;
							const x0 = Math.floor(sx),
								y0 = Math.floor(sy),
								x1 = Math.min(width - 1, x0 + 1),
								y1 = Math.min(height - 1, y0 + 1),
								tx = sx - x0,
								ty = sy - y0;
							const r = reference[y * width + x],
								s =
									actual[y0 * width + x0] * (1 - tx) * (1 - ty) +
									actual[y0 * width + x1] * tx * (1 - ty) +
									actual[y1 * width + x0] * (1 - tx) * ty +
									actual[y1 * width + x1] * tx * ty;
							n++;
							a += r;
							b += s;
							aa += r * r;
							bb += s * s;
							ab += r * s;
						}
					if (n < (width - 4) * (height - 4) * 0.9) continue;
					const av = aa - (a * a) / n,
						bv = bb - (b * b) / n;
					if (av / n < 25 || bv / n < 25) continue;
					best = Math.max(best, (ab - (a * b) / n) / Math.sqrt(av * bv));
				}
	return {
		score: Math.max(0, best),
		verdict: best < 0 ? 'review' : best >= 0.65 ? 'pass' : best < 0.45 ? 'fail' : 'review'
	};
}
