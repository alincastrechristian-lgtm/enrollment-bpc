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
export const definitionSchema = z
	.object({
		corners: z
			.tuple([point, point, point, point])
			.refine(validCorners, 'Confirm four valid form corners.'),
		semester: z.enum(['1', '2']),
		schoolYear: z
			.string()
			.regex(/^20\d{2}-20\d{2}$/, 'Enter an academic year such as 2025-2026.')
			.refine(
				(v) => Number(v.slice(5)) === Number(v.slice(0, 4)) + 1,
				'Use consecutive academic years.'
			),
		areas: z
			.array(areaSchema)
			.min(5, 'Add school name, form title, logo or structure, semester and academic year areas.')
			.max(20),
		personalFields: personalFieldsSchema.optional(),
		officeRows: officeRowsSchema.optional()
	})
	.strict()
	.superRefine(({ areas }, ctx) => {
		const kinds = areas.map((a) => a.kind);
		if (
			kinds.filter((k) => k === 'text').length < 2 ||
			!kinds.includes('image') ||
			kinds.filter((k) => k === 'semester').length !== 1 ||
			kinds.filter((k) => k === 'academicYear').length !== 1
		)
			ctx.addIssue({
				code: 'custom',
				message:
					'Mark at least two printed text areas (school and form title), one logo or structure area, one semester and one academic year.'
			});
		if (
			new Set(areas.map((a) => a.id)).size !== areas.length ||
			new Set(areas.map((a) => a.label.toLowerCase())).size !== areas.length
		)
			ctx.addIssue({ code: 'custom', message: 'Use unique area labels.' });
	});
export type TemplateDefinition = z.infer<typeof definitionSchema>;
export function templateTermIssue(
	definition: Pick<TemplateDefinition, 'semester' | 'schoolYear'>,
	enrollment: { semester: number; schoolYearStart: number }
) {
	const schoolYear = `${enrollment.schoolYearStart}-${enrollment.schoolYearStart + 1}`;
	if (Number(definition.semester) === enrollment.semester && definition.schoolYear === schoolYear)
		return null;
	return `Your enrollment requires Semester ${enrollment.semester}, SY ${schoolYear}. The available clearance template is Semester ${definition.semester}, SY ${definition.schoolYear}. Contact the Registrar to provide a matching template.`;
}
export type TemplateInfo = {
	revision: string;
	filename: string;
	definition: TemplateDefinition | null;
	semester?: number | null;
	schoolYearStart?: number | null;
};
export type Box = TemplateArea['box'];

const normalize = (text: string) =>
	text
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '');
export function checkAreaText(
	area: TemplateArea,
	reading: Reading,
	term: Pick<TemplateDefinition, 'semester' | 'schoolYear'>
): Check {
	let actual = reading.text;
	let expected = area.expected;
	if (area.kind === 'semester') {
		actual = reading.text.match(/^\s*([12])\s*(?:st|nd)?\s*Semester\b/i)?.[1] ?? '';
		expected = term.semester;
	} else if (area.kind === 'academicYear') {
		const year = reading.text.match(/\b(20\d{2})\s*[-–—]\s*(20\d{2})\b/);
		actual = year ? `${year[1]}-${year[2]}` : '';
		expected = term.schoolYear;
	}
	if (!normalize(actual) || reading.confidence < 65)
		return {
			label: area.label,
			verdict: 'review',
			detail: `Text unclear. Read “${reading.text.trim()}”. Check this area or use a clearer image.`
		};
	return {
		label: area.label,
		verdict: normalize(actual) === normalize(expected) ? 'pass' : 'fail',
		detail: `Read “${reading.text.trim()}”; expected “${expected}”.`
	};
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
	let best = -1;
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
					const r = reference[y * width + x],
						s = actual[(y + dy) * width + x + dx];
					n++;
					a += r;
					b += s;
					aa += r * r;
					bb += s * s;
					ab += r * s;
				}
			const av = aa - (a * a) / n,
				bv = bb - (b * b) / n;
			if (av / n < 25 || bv / n < 25) continue;
			best = Math.max(best, (ab - (a * b) / n) / Math.sqrt(av * bv));
		}
	return {
		score: Math.max(0, best),
		verdict: best < 0 ? 'review' : best >= 0.8 ? 'pass' : best < 0.45 ? 'fail' : 'review'
	};
}
