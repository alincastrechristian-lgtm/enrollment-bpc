import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';
import type { CertificateOfRegistration } from './cor';
import { formatBirthDate, formatStudentSex } from '#lib/student-demographics.js';

// Resolve packaged fonts at runtime; deployment needs no browser or system fonts.
const fontFiles = createRequire(import.meta.url);
const regular = fontFiles.resolve('@fontsource/noto-serif/files/noto-serif-latin-400-normal.woff');
const bold = fontFiles.resolve('@fontsource/noto-serif/files/noto-serif-latin-700-normal.woff');
const units = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 10 });
const clean = (value: string) => value.normalize('NFC').replace(/\s+/gu, ' ').trim();

export function createCORPdf(
	record: CertificateOfRegistration,
	generatedAt = new Date()
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({
			size: 'LETTER',
			margins: { top: 42, bottom: 60, left: 42, right: 42 },
			bufferPages: true,
			info: {
				Title: `Certificate of Registration - ${record.student.studentId}`,
				Author: 'Bulacan Polytechnic College',
				Creator: 'BPC Enrollment System'
			}
		});
		const chunks: Buffer[] = [];
		doc.on('data', (chunk: Buffer) => chunks.push(chunk));
		doc.on('error', reject);
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		try {
			doc.registerFont('COR-Regular', regular).registerFont('COR-Bold', bold);
			const left = 42;
			const width = doc.page.width - left * 2;
			const bottom = doc.page.height - 60;
			const lineHeight = 15;
			let y = 42;
			const text = (
				value: string,
				x: number,
				top: number,
				maxWidth: number,
				strong = false,
				size = 10,
				align: 'left' | 'center' | 'right' = 'left'
			) => {
				doc
					.font(strong ? 'COR-Bold' : 'COR-Regular')
					.fontSize(size)
					.fillColor('#171717')
					.text(value, x, top, { width: maxWidth, lineBreak: false, align });
			};
			// Wrap long tokens too, so names, email addresses, and subject codes are never clipped.
			function wrap(value: string, maxWidth: number, strong = false) {
				doc.font(strong ? 'COR-Bold' : 'COR-Regular').fontSize(10);
				const lines: string[] = [];
				let line = '';
				for (const word of clean(value).split(' ')) {
					const candidate = line ? `${line} ${word}` : word;
					if (doc.widthOfString(candidate) <= maxWidth) {
						line = candidate;
						continue;
					}
					if (line) {
						lines.push(line);
						line = '';
					}
					for (const char of word) {
						if (line && doc.widthOfString(line + char) > maxWidth) {
							lines.push(line);
							line = '';
						}
						line += char;
					}
				}
				if (line || !lines.length) lines.push(line);
				return lines;
			}
			function heading(continued: boolean) {
				text('Bulacan Polytechnic College', left, 42, width, true, 17, 'center');
				text('MALOLOS CAMPUS', left, 68, width, true, 11, 'center');
				text(
					`School Year ${record.enrollment.schoolYearStart}–${record.enrollment.schoolYearStart + 1} | Semester ${record.enrollment.semester}`,
					left,
					89,
					width,
					false,
					11,
					'center'
				);
				text('CERTIFICATE OF REGISTRATION (COR)', left, 121, width, true, 13, 'center');
				y = 158;
				if (continued) {
					text(`Student ID: ${record.student.studentId} | Continued`, left, y, width, true, 9);
					y += 26;
				}
			}
			function newPage() {
				doc.addPage();
				heading(true);
			}
			function detail(label: string, value: string) {
				const lines = wrap(value || 'Not provided', width - 140);
				for (let i = 0; i < lines.length; i++) {
					if (y + lineHeight > bottom) newPage();
					if (i === 0) text(label, left, y, 132, true);
					text(lines[i], left + 140, y, width - 140);
					y += lineHeight;
				}
				y += 4;
			}
			heading(false);
			detail('Student ID', record.student.studentId);
			detail('Name', record.student.name);
			detail(
				'Course / Year / Section',
				`${record.enrollment.programCode} ${record.enrollment.yearLevel}${record.enrollment.section}`
			);
			detail('Program', `${record.enrollment.programName} (${record.enrollment.programCode})`);
			detail('Sex', formatStudentSex(record.student.sex));
			detail('Birth date', formatBirthDate(record.student.birthDate));
			detail('Address', record.student.address);
			detail('Email', record.student.email);
			detail('Contact number', record.student.contactNumber);
			detail(
				'Enrollment status',
				record.enrollment.status === 'enrolled' ? 'OFFICIALLY ENROLLED' : 'COMPLETED'
			);
			detail('Campus', 'MALOLOS');
			y += 17;
			const columns = [112, width - 174, 62];
			function tableHeader() {
				text('SUBJECTS ENROLLED', left, y, width, true, 12, 'center');
				y += 27;
				let x = left;
				for (const [index, title] of ['Subject code', 'Subject title', 'Units'].entries()) {
					doc.rect(x, y, columns[index], 27).fillAndStroke('#f0f0f0', '#666666');
					text(title, x + 8, y + 6, columns[index] - 16, true, 10, index === 2 ? 'right' : 'left');
					x += columns[index];
				}
				y += 27;
			}
			function continueTable() {
				newPage();
				tableHeader();
			}
			if (y + 100 > bottom) newPage();
			tableHeader();
			function tableRow(values: string[], strong = false) {
				const lines = values.map((value, i) => wrap(value, columns[i] - 16, strong));
				const length = Math.max(...lines.map((column) => column.length));
				let offset = 0;
				// Oversized subject titles may span pages; repeat the document/table headings.
				while (offset < length) {
					const room = Math.floor((bottom - y - 12) / lineHeight);
					if (room < 1) {
						continueTable();
						continue;
					}
					const count = Math.min(room, length - offset);
					const height = count * lineHeight + 12;
					let x = left;
					for (let col = 0; col < columns.length; col++) {
						doc.lineWidth(0.5).rect(x, y, columns[col], height).stroke('#888888');
						for (let row = 0; row < count; row++) {
							const value = lines[col][offset + row];
							if (value)
								text(
									value,
									x + 8,
									y + 6 + row * lineHeight,
									columns[col] - 16,
									strong,
									10,
									col === 2 ? 'right' : 'left'
								);
						}
						x += columns[col];
					}
					y += height;
					offset += count;
				}
			}
			for (const subject of record.subjects)
				tableRow([subject.code, subject.name, units.format(subject.units)]);
			tableRow(
				[
					'',
					'Total units',
					units.format(record.subjects.reduce((sum, subject) => sum + subject.units, 0))
				],
				true
			);
			if (y + 36 > bottom) continueTable();
			text('*** NOTHING FOLLOWS ***', left, y + 10, width, true, 9, 'center');
			const pages = doc.bufferedPageRange();
			const issued = new Intl.DateTimeFormat('en-PH', {
				dateStyle: 'medium',
				timeStyle: 'short',
				timeZone: 'Asia/Manila'
			}).format(generatedAt);
			for (let i = pages.start; i < pages.start + pages.count; i++) {
				doc.switchToPage(i);
				// Footer sits below the body margin; suppress automatic text pagination here.
				const margin = doc.page.margins.bottom;
				doc.page.margins.bottom = 0;
				text(`Generated ${issued} (Asia/Manila)`, left, doc.page.height - 36, width - 80, false, 7);
				text(
					`Page ${i + 1} of ${pages.count}`,
					doc.page.width - 122,
					doc.page.height - 36,
					80,
					false,
					7,
					'right'
				);
				doc.page.margins.bottom = margin;
			}
			doc.end();
		} catch (cause) {
			doc.destroy();
			reject(cause);
		}
	});
}
