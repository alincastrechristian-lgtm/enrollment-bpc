import type { Box, TemplateArea } from './definition';

export type PrintedLine = {
	text: string;
	confidence: number;
	bbox: { x0: number; y0: number; x1: number; y1: number };
	words: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[];
};
export type AreaSuggestions = {
	areas: TemplateArea[];
	semester?: '1' | '2';
	schoolYear?: string;
	hints: string[];
};

function paddedBox(b: PrintedLine['bbox'], width: number, height: number): Box {
	const margin = Math.max(4, (b.y1 - b.y0) * 0.2);
	const x = Math.max(0, (b.x0 - margin) / width),
		y = Math.max(0, (b.y0 - margin) / height);
	return {
		x,
		y,
		width: Math.min(1 - x, Math.max(0.015, (b.x1 + margin) / width - x)),
		height: Math.min(1 - y, Math.max(0.015, (b.y1 + margin) / height - y))
	};
}

export function suggestPrintedAreas(
	lines: PrintedLine[],
	width: number,
	height: number
): AreaSuggestions {
	const hints: string[] = [],
		ranked: { area: TemplateArea; priority: number }[] = [];
	let semester: '1' | '2' | undefined,
		schoolYear: string | undefined,
		foundSemester = false,
		foundYear = false;
	const labels = new Set<string>();
	function add(
		label: string,
		kind: TemplateArea['kind'],
		text: string,
		bbox: PrintedLine['bbox'],
		priority: number
	) {
		let unique = label,
			index = 2;
		while (labels.has(unique.toLowerCase())) unique = `${label} ${index++}`;
		labels.add(unique.toLowerCase());
		ranked.push({
			priority,
			area: {
				id: crypto.randomUUID(),
				label: unique,
				kind,
				expected: text.slice(0, 1000),
				box: paddedBox(bbox, width, height)
			}
		});
	}
	for (const line of lines) {
		const text = line.text.replace(/\s+/g, ' ').trim();
		const { bbox } = line;
		if (
			!Number.isFinite(line.confidence) ||
			line.confidence < 45 ||
			text.length < 3 ||
			text.length > 140 ||
			(!/[A-Za-z]{3}/.test(text) && !/20\d{2}/.test(text)) ||
			![bbox.x0, bbox.y0, bbox.x1, bbox.y1].every(Number.isFinite) ||
			bbox.x1 <= bbox.x0 ||
			bbox.y1 <= bbox.y0 ||
			bbox.x0 < 0 ||
			bbox.y0 < 0 ||
			bbox.x1 > width ||
			bbox.y1 > height
		)
			continue;
		const sem = text.match(/\b([12])\s*(?:st|nd)?\s+Seme\w*/i);
		const year = text.match(/\b(20\d{2})\s*[-–—]\s*(20\d{2})\b/);
		if (sem && !foundSemester) {
			add('Semester', 'semester', text, bbox, 0);
			foundSemester = true;
			if (/\b[12]\s*(?:st|nd)?\s+Semester\b/i.test(text) && line.confidence >= 65)
				semester = sem[1] as '1' | '2';
		}
		if (year && !foundYear) {
			const yearWords = line.words.filter(
				(w) => w.text.includes(year[1]) || w.text.includes(year[2])
			);
			const box = yearWords.length
				? {
						x0: Math.min(...yearWords.map((w) => w.bbox.x0)),
						y0: Math.min(...yearWords.map((w) => w.bbox.y0)),
						x1: Math.max(...yearWords.map((w) => w.bbox.x1)),
						y1: Math.max(...yearWords.map((w) => w.bbox.y1))
					}
				: bbox;
			add('Academic year', 'academicYear', year[0], box, 0);
			foundYear = true;
			if (line.confidence >= 65 && Number(year[2]) === Number(year[1]) + 1)
				schoolYear = `${year[1]}-${year[2]}`;
		}
		if (sem || year) continue;
		// Printed identity/signature labels and checkbox choices are poor format anchors.
		if (
			/student\s*(?:number|no\.?|name)|name\s*(?:and|&)\s*signature|signature|contact|course|section|\byr\b|^date$|\bcleared\b/i.test(
				text
			)
		)
			continue;
		const school = /\b(?:college|university|school|institute|polytechnic|academy)\b/i.test(text);
		const title = /\bclearance\b|\b(?:form|certificate)\b/i.test(text);
		if (!school && !title && line.confidence < 65) continue;
		add(
			school ? 'School name' : title ? 'Form title' : `Printed text`,
			'text',
			text,
			bbox,
			school ? 1 : title ? 2 : 3
		);
	}
	const areas = ranked
		.sort((a, b) => a.priority - b.priority)
		.slice(0, 17)
		.map((v) => v.area);
	if (!areas.some((a) => a.label.startsWith('School name')))
		hints.push('School name was not identified. Add or relabel a text area.');
	if (!areas.some((a) => a.label.startsWith('Form title')))
		hints.push('Form title was not identified. Add or relabel a text area.');
	if (!foundSemester) hints.push('Semester area was not found. Add it manually.');
	if (!foundYear) hints.push('Academic year area was not found. Add it manually.');
	if (foundSemester && !semester)
		hints.push('Semester reading is uncertain. Confirm the required semester below.');
	if (foundYear && !schoolYear)
		hints.push('Academic year reading is uncertain or invalid. Confirm the required year below.');
	return { areas, semester, schoolYear, hints };
}

function emptyCheckboxOutline(ink: Uint8Array, width: number, box: PrintedLine['bbox']) {
	const w = box.x1 - box.x0,
		h = box.y1 - box.y0;
	if (w / h < 0.7 || w / h > 1.4) return false;
	const countInk = (left: number, top: number, right: number, bottom: number) => {
		let count = 0;
		for (let y = top; y < bottom; y++)
			for (let x = left; x < right; x++) count += ink[y * width + x];
		return count;
	};
	// Components include a two-pixel dilation. Square corners distinguish a
	// checkbox frame from a small round seal with a similarly empty centre.
	const corner = Math.max(3, Math.ceil(Math.min(w, h) * 0.12));
	if (
		[
			[box.x0, box.y0],
			[box.x1 - corner, box.y0],
			[box.x0, box.y1 - corner],
			[box.x1 - corner, box.y1 - corner]
		].some(([x, y]) => !countInk(x, y, x + corner, y + corner))
	)
		return false;
	const dx = Math.ceil(w * 0.2),
		dy = Math.ceil(h * 0.2);
	return (
		countInk(box.x0 + dx, box.y0 + dy, box.x1 - dx, box.y1 - dy) / ((w - dx * 2) * (h - dy * 2)) <
		0.01
	);
}

// Find compact non-text ink components. Suggestions may be logos, seals or printed graphics;
// their purpose cannot be established from a single image and needs administrator review.
export function suggestGraphicAreas(
	ink: Uint8Array,
	width: number,
	height: number,
	textBoxes: Box[]
): Box[] {
	if (ink.length !== width * height || width < 80 || height < 80) return [];
	const remaining = ink.slice();
	for (const b of textBoxes) {
		for (
			let y = Math.max(0, Math.floor(b.y * height) - 3);
			y < Math.min(height, Math.ceil((b.y + b.height) * height) + 3);
			y++
		)
			remaining.fill(
				0,
				y * width + Math.max(0, Math.floor(b.x * width) - 3),
				y * width + Math.min(width, Math.ceil((b.x + b.width) * width) + 3)
			);
	}
	// Remove long rules before connecting nearby strokes, so table/page frames do not win.
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width;) {
			if (!remaining[y * width + x]) {
				x++;
				continue;
			}
			const start = x;
			while (x < width && remaining[y * width + x]) x++;
			if (x - start > width * 0.18) remaining.fill(0, y * width + start, y * width + x);
		}
	for (let x = 0; x < width; x++)
		for (let y = 0; y < height;) {
			if (!remaining[y * width + x]) {
				y++;
				continue;
			}
			const start = y;
			while (y < height && remaining[y * width + x]) y++;
			if (y - start > height * 0.18)
				for (let row = start; row < y; row++) remaining[row * width + x] = 0;
		}
	const mask = new Uint8Array(remaining.length);
	for (let y = 2; y < height - 2; y++)
		for (let x = 2; x < width - 2; x++)
			if (remaining[y * width + x])
				for (let dy = -2; dy <= 2; dy++)
					mask.fill(1, (y + dy) * width + x - 2, (y + dy) * width + x + 3);
	const queue = new Int32Array(mask.length),
		candidates: { box: Box; area: number }[] = [];
	for (let start = 0; start < mask.length; start++) {
		if (!mask[start]) continue;
		let head = 0,
			tail = 1,
			left = width,
			right = 0,
			top = height,
			bottom = 0,
			count = 0;
		queue[0] = start;
		mask[start] = 0;
		while (head < tail) {
			const i = queue[head++],
				x = i % width,
				y = Math.floor(i / width);
			count++;
			left = Math.min(left, x);
			right = Math.max(right, x);
			top = Math.min(top, y);
			bottom = Math.max(bottom, y);
			for (const next of [
				x > 0 ? i - 1 : -1,
				x < width - 1 ? i + 1 : -1,
				y > 0 ? i - width : -1,
				y < height - 1 ? i + width : -1
			])
				if (next >= 0 && mask[next]) {
					mask[next] = 0;
					queue[tail++] = next;
				}
		}
		const w = right - left + 1,
			h = bottom - top + 1,
			area = w * h;
		if (
			w < width * 0.035 ||
			h < height * 0.035 ||
			w > width * 0.4 ||
			h > height * 0.4 ||
			w / h < 0.4 ||
			w / h > 2.5 ||
			area > width * height * 0.15 ||
			count / area < 0.08 ||
			count / area > 0.85
		)
			continue;
		if (
			emptyCheckboxOutline(remaining, width, { x0: left, y0: top, x1: right + 1, y1: bottom + 1 })
		)
			continue;
		candidates.push({
			area,
			box: paddedBox({ x0: left, y0: top, x1: right + 1, y1: bottom + 1 }, width, height)
		});
	}
	return candidates
		.sort((a, b) => b.area - a.area)
		.slice(0, 3)
		.map((v) => v.box);
}
