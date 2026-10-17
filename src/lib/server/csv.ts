export function createCsv(rows: (string | number)[][]) {
	const cell = (value: string | number) => {
		const text = String(value);
		// Quoting alone does not prevent spreadsheet formulas in user-provided cells.
		const safe = /^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
		return `"${safe.replaceAll('"', '""')}"`;
	};
	return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
