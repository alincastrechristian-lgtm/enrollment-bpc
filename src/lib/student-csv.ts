import { createStudentSchema } from './students';
import type { z } from 'zod';

export const STUDENT_CSV_MAX_BYTES = 256 * 1024;
export const STUDENT_CSV_MAX_ROWS = 100;
export const STUDENT_CSV_COLUMNS = [
	['first_name', 'firstName'],
	['middle_name', 'middleName'],
	['last_name', 'lastName'],
	['email', 'email'],
	['birth_date', 'birthDate'],
	['sex', 'sex'],
	['contact_number', 'contactNumber'],
	['address', 'address']
] as const;
export const STUDENT_CSV_TEMPLATE =
	'\uFEFF' +
	STUDENT_CSV_COLUMNS.map(([header]) => header).join(',') +
	'\r\nAna,Maria,Santos,ana.santos@example.com,2000-01-01,female,0917 123 4567,"Malolos, Bulacan"\r\n';
export type StudentCsvRow = { row: number; student: z.infer<typeof createStudentSchema> };
export type StudentCsvIssue = { row: number; message: string };

// RFC-style comma-separated records, including quoted commas, newlines and escaped quotes.
function records(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [],
		cell = '',
		quoted = false,
		closed = false;
	let nonemptyRecords = 0;
	const endCell = () => {
		row.push(cell);
		cell = '';
		closed = false;
	};
	const endRow = () => {
		endCell();
		rows.push(row);
		if (row.some((value) => value.trim())) nonemptyRecords++;
		row = [];
		if (nonemptyRecords > STUDENT_CSV_MAX_ROWS + 1)
			throw new Error(`Use at most ${STUDENT_CSV_MAX_ROWS} student rows per CSV.`);
	};
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (quoted) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					cell += '"';
					i++;
				} else {
					quoted = false;
					closed = true;
				}
			} else cell += char;
		} else if (char === ',') endCell();
		else if (char === '\n' || char === '\r') {
			if (char === '\r' && text[i + 1] === '\n') i++;
			endRow();
		} else if (closed) {
			if (char !== ' ' && char !== '\t')
				throw new Error('Unexpected text after a closing quote. Check the CSV format.');
		} else if (char === '"') {
			if (cell)
				throw new Error('Quotes inside a field must be escaped and the field enclosed in quotes.');
			quoted = true;
		} else cell += char;
	}
	if (quoted) throw new Error('A quoted CSV field is not closed.');
	if (cell || row.length || closed) endRow();
	return rows;
}

export function validateStudentCsv(text: string): {
	rows: StudentCsvRow[];
	issues: StudentCsvIssue[];
} {
	const rows: StudentCsvRow[] = [],
		issues: StudentCsvIssue[] = [];
	if (new TextEncoder().encode(text).length > STUDENT_CSV_MAX_BYTES)
		return { rows, issues: [{ row: 1, message: 'CSV must be 256 KB or smaller.' }] };
	let parsed: string[][];
	try {
		parsed = records(text.replace(/^\uFEFF/, ''));
	} catch (cause) {
		return { rows, issues: [{ row: 1, message: (cause as Error).message }] };
	}
	if (!parsed.length)
		return {
			rows,
			issues: [{ row: 1, message: 'Choose a CSV containing a header and student rows.' }]
		};
	const normalized = (value: string) => value.trim().replace(/[ _-]/g, '').toLowerCase();
	const headers = parsed[0].map(normalized);
	const columns = STUDENT_CSV_COLUMNS.map(([header, field]) => ({
		header,
		field,
		index: headers.indexOf(normalized(header))
	}));
	for (const column of columns)
		if (column.index < 0 && column.field !== 'middleName')
			issues.push({ row: 1, message: `Missing required column: ${column.header}.` });
	for (const [index, header] of headers.entries()) {
		if (headers.indexOf(header) !== index)
			issues.push({ row: 1, message: `Duplicate column: ${parsed[0][index]}.` });
		if (!columns.some((column) => normalized(column.header) === header))
			issues.push({
				row: 1,
				message: `Unknown column: ${parsed[0][index] || '(blank)'}. Use the CSV template.`
			});
	}
	if (issues.length) return { rows, issues };
	const emails = new Map<string, number>();
	for (let index = 1; index < parsed.length; index++) {
		const values = parsed[index],
			row = index + 1;
		if (values.every((value) => !value.trim())) continue;
		if (values.length !== headers.length) {
			issues.push({
				row,
				message: `Expected ${headers.length} columns; found ${values.length}. Quote addresses containing commas.`
			});
			continue;
		}
		const data = Object.fromEntries(
			columns.map((column) => [column.field, column.index < 0 ? '' : values[column.index].trim()])
		);
		const result = createStudentSchema.safeParse(data);
		if (!result.success) {
			for (const issue of result.error.issues)
				issues.push({ row, message: `${issue.path.join('.')}: ${issue.message}` });
			continue;
		}
		const previous = emails.get(result.data.email);
		if (previous) issues.push({ row, message: `Duplicate email; also used in row ${previous}.` });
		else {
			emails.set(result.data.email, row);
			rows.push({ row, student: result.data });
		}
	}
	if (!rows.length && !issues.length)
		issues.push({ row: 2, message: 'Add at least one student row below the header.' });
	return { rows, issues };
}
