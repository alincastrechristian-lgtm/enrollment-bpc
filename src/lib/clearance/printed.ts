import type { Page } from 'tesseract.js';
import type { Reading } from './clearance';

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
