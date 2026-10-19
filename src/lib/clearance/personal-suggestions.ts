import {
	PERSONAL_FIELD_LABELS,
	type PersonalFieldArea,
	type PersonalFieldKind,
	type Box
} from './definition';
import type { PrintedLine } from './suggestions';

export type PersonalFieldSuggestions = { fields: PersonalFieldArea[]; hints: string[] };
type Label = { field: PersonalFieldKind; box: PrintedLine['bbox']; above: boolean };
const clean = (text: string) =>
	text
		.toLowerCase()
		.replace(/[’']/g, '')
		.replace(/[^a-z0-9]/g, '');

function labelsFor(line: PrintedLine): Label[] {
	const text = line.text.toLowerCase().replace(/[’']/g, '');
	if (/semester|academic|school\s*year|20\d{2}/i.test(text)) return [];
	const words = line.words;
	const standaloneYear = /^\s*(?:year(?:\s*level)?|yr)[\s:.,_]*$/.test(text);
	if (
		/\b(?:course|program)\b.*(?:\byear\b|\byr\b|\bsec\b|\bsection\b)/i.test(text) &&
		(text.match(/:/g)?.length ?? 0) <= 1
	)
		return [{ field: 'courseYearSection', box: line.bbox, above: false }];
	const labels: Label[] = [];
	for (let i = 0; i < words.length; i++) {
		const word = clean(words[i].text),
			next = clean(words[i + 1]?.text ?? '');
		let field: PersonalFieldKind | undefined,
			end = i;
		if (/^students?$/.test(word) && /^(?:number|no|id|name)/.test(next)) {
			field = next.startsWith('name') ? 'studentName' : 'studentNumber';
			end = i + 1;
		} else if (/^(?:studentnumber|studentno|studentid)/.test(word)) field = 'studentNumber';
		else if (
			/^(?:studentname|studentsname|name)$/.test(word) &&
			!/school|college|adviser|registrar|head/.test(text)
		)
			field = 'studentName';
		else if (/^(?:course|program)$/.test(word) && !/program\s+head/.test(text)) field = 'course';
		else if (/^(?:year|yr|yearlevel)$/.test(word)) {
			end = next === 'level' ? i + 1 : i;
			if (
				/\b(?:enrollees?|enrolled|only)\b/.test(text) ||
				(!standaloneYear && !/[:：]/.test(words[end].text))
			)
				continue;
			field = 'year';
		} else if (/^(?:section|sec)$/.test(word)) field = 'section';
		if (!field) continue;
		const group = words.slice(i, end + 1);
		labels.push({
			field,
			box: {
				x0: Math.min(...group.map((w) => w.bbox.x0)),
				y0: Math.min(...group.map((w) => w.bbox.y0)),
				x1: Math.max(...group.map((w) => w.bbox.x1)),
				y1: Math.max(...group.map((w) => w.bbox.y1))
			},
			above: field === 'studentName' && /signature/.test(text)
		});
		i = end;
	}
	// OCR can join an entire label into one token or omit its word hierarchy.
	if (!labels.length) {
		let field: PersonalFieldKind | undefined;
		if (/student\s*(?:number|no\b|id\b)/.test(text)) field = 'studentNumber';
		else if (
			/\b(?:students?\s+)?name\b/.test(text) &&
			!/school|college|adviser|registrar|head/.test(text)
		)
			field = 'studentName';
		else if (/\bcourse\b/.test(text)) field = 'course';
		else if (standaloneYear) field = 'year';
		else if (/^\s*(?:section|sec)\s*[:.]*\s*$/.test(text)) field = 'section';
		if (field)
			labels.push({
				field,
				box: line.bbox,
				above: field === 'studentName' && /signature/.test(text)
			});
	}
	return labels;
}

function writingLine(
	ink: Uint8Array,
	width: number,
	height: number,
	x0: number,
	x1: number,
	y0: number,
	y1: number
) {
	let start = -1,
		last = -1,
		best: { left: number; right: number } | undefined;
	for (let x = Math.max(0, Math.floor(x0)); x < Math.min(width, Math.ceil(x1)); x++) {
		let hit = false;
		for (let y = Math.max(0, Math.floor(y0)); y < Math.min(height, Math.ceil(y1)); y++)
			if (ink[y * width + x]) {
				hit = true;
				break;
			}
		if (hit) {
			if (start < 0) start = x;
			last = x;
		}
		if (start >= 0 && ((!hit && x - last > 4) || x >= Math.min(width, Math.ceil(x1)) - 1)) {
			if (last - start > width * 0.08 && (!best || last - start > best.right - best.left))
				best = { left: start, right: last + 1 };
			start = -1;
		}
	}
	return best;
}

export function suggestPersonalFields(
	lines: PrintedLine[],
	width: number,
	height: number,
	ink: Uint8Array
): PersonalFieldSuggestions {
	if (width < 80 || height < 80 || ink.length !== width * height)
		throw new Error('Invalid personal-field detection image.');
	const labels = lines
		.filter(
			(l) =>
				l.confidence >= 40 && [l.bbox.x0, l.bbox.y0, l.bbox.x1, l.bbox.y1].every(Number.isFinite)
		)
		.flatMap(labelsFor)
		.filter(
			(label) =>
				[label.box.x0, label.box.y0, label.box.x1, label.box.y1].every(Number.isFinite) &&
				label.box.x0 >= 0 &&
				label.box.y0 >= 0 &&
				label.box.x1 <= width &&
				label.box.y1 <= height &&
				label.box.x1 > label.box.x0 &&
				label.box.y1 > label.box.y0
		);
	const fields: PersonalFieldArea[] = [],
		hints = [
			'These boxes are estimates of writing areas, not the printed labels. Review and adjust them before saving.'
		];
	for (const label of labels) {
		if (
			fields.some((a) => a.field === label.field) ||
			(label.field === 'courseYearSection' &&
				fields.some((a) => ['course', 'year', 'section'].includes(a.field))) ||
			(['course', 'year', 'section'].includes(label.field) &&
				fields.some((a) => a.field === 'courseYearSection'))
		)
			continue;
		const b = label.box,
			h = Math.max(10, b.y1 - b.y0),
			margin = Math.max(4, h * 0.15);
		let left: number, right: number, top: number, bottom: number;
		if (label.above) {
			const line = writingLine(
				ink,
				width,
				height,
				width * 0.01,
				width * 0.97,
				b.y0 - Math.max(h * 2.5, height * 0.075),
				b.y0 - margin
			);
			left = line?.left ?? Math.max(width * 0.01, b.x0 - (b.x1 - b.x0) * 0.5);
			right = line?.right ?? Math.min(width * 0.97, b.x1 + (b.x1 - b.x0) * 0.5);
			top = b.y0 - Math.max(h * 2.5, height * 0.075);
			bottom = b.y0 - margin;
		} else {
			left = b.x1 + margin;
			const next = labels
				.filter(
					(other) => other !== label && Math.abs(other.box.y0 - b.y0) < h && other.box.x0 > left
				)
				.sort((a, b) => a.box.x0 - b.box.x0)[0];
			const limit = next ? next.box.x0 - margin : width * 0.97;
			const line = writingLine(ink, width, height, left, limit, b.y0 - h * 0.5, b.y1 + h * 0.4);
			right = line?.right ?? Math.min(limit, left + Math.max(width * 0.25, (b.x1 - b.x0) * 1.5));
			top = b.y0 - h * 0.6;
			bottom = b.y1 + h * 0.35;
			const below = labels
				.filter((other) => other.box.y0 > b.y1 && other.box.x0 < right && other.box.x1 > left)
				.sort((a, b) => a.box.y0 - b.box.y0)[0];
			if (below) bottom = Math.min(bottom, below.box.y0 - margin);
		}
		left = Math.max(0, left);
		right = Math.min(width, right);
		top = Math.max(0, top);
		bottom = Math.min(height, bottom);
		if (right - left < width * 0.015 || bottom - top < height * 0.015) continue;
		const box: Box = {
			x: left / width,
			y: top / height,
			width: (right - left) / width,
			height: (bottom - top) / height
		};
		fields.push({ id: crypto.randomUUID(), field: label.field, box });
	}
	const covered = new Set(
		fields.flatMap((f) =>
			f.field === 'courseYearSection' ? ['course', 'year', 'section'] : [f.field]
		)
	);
	for (const kind of ['studentName', 'studentNumber', 'course', 'year', 'section'] as const)
		if (!covered.has(kind))
			hints.push(`${PERSONAL_FIELD_LABELS[kind]} was not located. Mark it manually.`);
	if (fields.some((f) => f.field === 'courseYearSection'))
		hints.push(
			'Course, year and section share one writing area on this form. One combined box is kept instead of guessing a split.'
		);
	return { fields: fields.slice(0, 5), hints };
}
