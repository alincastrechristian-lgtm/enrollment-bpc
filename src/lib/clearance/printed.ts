import type { Page } from 'tesseract.js';
import type { Reading } from './clearance';
import type { TemplateArea } from './definition';

const normalize = (text: string) =>
	text
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '');

// Crops include a bounded neighborhood. Select the expected printed phrase without requiring
// unrelated nearby labels to match or lower confidence in otherwise readable words.
export function printedAreaReading(
	area: TemplateArea,
	data: Pick<Page, 'text' | 'confidence' | 'blocks'>
): Reading {
	if (area.kind === 'academicYear') return academicYearReading(data);
	const reading = { text: data.text.trim(), confidence: data.confidence };
	const words = (data.blocks ?? []).flatMap((block) =>
		block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words))
	);
	if (area.kind === 'semester') {
		const values = new Set(
			[...reading.text.matchAll(/\b([1-9]\d*)\s*(?:st|nd|rd|th)?\s*Semester\b/gi)].map(
				(match) => match[1]
			)
		);
		if (values.size !== 1) return reading;
	}
	for (let start = 0; start < words.length; start++) {
		const selected = [];
		for (let end = start; end < words.length; end++) {
			selected.push(words[end]);
			const text = selected.map((word) => word.text).join(' ');
			const matches =
				area.kind === 'semester'
					? /^\s*[1-9]\d*\s*(?:st|nd|rd|th)?\s*Semester\b/i.test(text)
					: normalize(text) === normalize(area.expected);
			if (matches)
				return {
					text,
					confidence: selected.reduce((sum, word) => sum + word.confidence, 0) / selected.length
				};
			if (
				area.kind === 'semester'
					? selected.length >= 3
					: normalize(text).length >= normalize(area.expected).length
			)
				break;
		}
	}
	return reading;
}

// A stray punctuation mark must not lower confidence in a clearly recognized year token.
// Select by syntax, never by the administrator's expected year.
export function academicYearReading(data: Pick<Page, 'text' | 'confidence' | 'blocks'>): Reading {
	const reading = { text: data.text.trim(), confidence: data.confidence };
	const years = reading.text.match(/\b20\d{2}\s*[-–—]\s*20\d{2}\b/g) ?? [];
	if (years.length !== 1) return reading;
	const words = (data.blocks ?? []).flatMap((block) =>
		block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words))
	);
	const candidates = words.filter(
		(word) => word.text.trim().replace(/\s/g, '') === years[0].replace(/\s/g, '')
	);
	if (candidates.length === 1) reading.confidence = candidates[0].confidence;
	return reading;
}

// Match browser and server OCR preprocessing while preserving faint strokes on blank crops.
export function enhancePrintedContrast(gray: Uint8Array) {
	const histogram = new Uint32Array(256);
	for (const value of gray) histogram[value]++;
	const percentile = (fraction: number) => {
		let count = 0;
		for (let value = 0; value < 256; value++) {
			count += histogram[value];
			if (count >= gray.length * fraction) return value;
		}
		return 255;
	};
	const white = percentile(0.9),
		dark = percentile(0.01);
	const black = white - dark >= 32 ? dark : 0;
	for (let i = 0; i < gray.length; i++)
		gray[i] = Math.max(
			0,
			Math.min(255, Math.round(((gray[i] - black) * 255) / Math.max(1, white - black)))
		);
}
