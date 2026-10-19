import { type Box, type OfficeRow } from './definition';
import type { PrintedLine } from './suggestions';

export type OfficeSuggestions = { rows: OfficeRow[]; hints: string[] };
type Rect = PrintedLine['bbox'];
type Word = PrintedLine['words'][number];
type Choice = { kind: 'cleared' | 'notCleared'; bbox: Rect };
const clean = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '');
const clearedCaption = (text: string) => /^(?:cleared|c[litr]eared)$/.test(clean(text));
const cy = (r: Rect) => (r.y0 + r.y1) / 2;
const cx = (r: Rect) => (r.x0 + r.x1) / 2;
const union = (rects: Rect[]): Rect => ({
	x0: Math.min(...rects.map((r) => r.x0)),
	y0: Math.min(...rects.map((r) => r.y0)),
	x1: Math.max(...rects.map((r) => r.x1)),
	y1: Math.max(...rects.map((r) => r.y1))
});

// Connected outlines distinguish checkboxes from text glyphs and table rules.
function squares(ink: Uint8Array, width: number, height: number): Rect[] {
	const seen = new Uint8Array(ink.length),
		queue = new Int32Array(ink.length),
		result: Rect[] = [];
	const min = Math.max(8, Math.min(width, height) * 0.012),
		max = Math.min(width, height) * 0.09;
	for (let start = 0; start < ink.length; start++) {
		if (!ink[start] || seen[start]) continue;
		let head = 0,
			tail = 1,
			x0 = width,
			y0 = height,
			x1 = 0,
			y1 = 0;
		queue[0] = start;
		seen[start] = 1;
		while (head < tail) {
			const p = queue[head++],
				x = p % width,
				y = Math.floor(p / width);
			x0 = Math.min(x0, x);
			x1 = Math.max(x1, x);
			y0 = Math.min(y0, y);
			y1 = Math.max(y1, y);
			for (let dy = -1; dy <= 1; dy++)
				for (let dx = -1; dx <= 1; dx++) {
					const nx = x + dx,
						ny = y + dy,
						n = ny * width + nx;
					if (nx < 0 || nx >= width || ny < 0 || ny >= height || seen[n] || !ink[n]) continue;
					seen[n] = 1;
					queue[tail++] = n;
				}
		}
		const w = x1 - x0 + 1,
			h = y1 - y0 + 1;
		if (
			w < min ||
			h < min ||
			w > max ||
			h > max ||
			w / h < 0.7 ||
			w / h > 1.4 ||
			tail / (w * h) > 0.6
		)
			continue;
		const inset = Math.max(2, Math.ceil(Math.min(w, h) * 0.2));
		let top = 0,
			bottom = 0,
			left = 0,
			right = 0;
		for (let x = x0 + inset; x <= x1 - inset; x++) {
			let a = false,
				b = false;
			for (let d = 0; d < inset; d++) {
				a ||= !!ink[(y0 + d) * width + x];
				b ||= !!ink[(y1 - d) * width + x];
			}
			top += +a;
			bottom += +b;
		}
		for (let y = y0 + inset; y <= y1 - inset; y++) {
			let a = false,
				b = false;
			for (let d = 0; d < inset; d++) {
				a ||= !!ink[y * width + x0 + d];
				b ||= !!ink[y * width + x1 - d];
			}
			left += +a;
			right += +b;
		}
		if (
			Math.min(
				top / (w - 2 * inset),
				bottom / (w - 2 * inset),
				left / (h - 2 * inset),
				right / (h - 2 * inset)
			) >= 0.7
		)
			result.push({ x0, y0, x1: x1 + 1, y1: y1 + 1 });
	}
	return result;
}

// Allow short gaps from faint printing. Long table borders remain available as cell evidence.
function horizontalRules(ink: Uint8Array, width: number, height: number): Rect[] {
	const result: Rect[] = [];
	for (let y = 0; y < height; y++) {
		let start = -1,
			last = -1;
		for (let x = 0; x <= width; x++) {
			if (x < width && ink[y * width + x]) {
				if (start < 0) start = x;
				last = x;
			}
			if (start >= 0 && (x - last > 3 || x === width)) {
				if (last - start >= width * 0.08)
					result.push({ x0: start, x1: last + 1, y0: y, y1: y + 1 });
				start = -1;
			}
		}
	}
	return result;
}

export function suggestOfficeRows(
	lines: PrintedLine[],
	width: number,
	height: number,
	ink: Uint8Array
): OfficeSuggestions {
	if (
		!Number.isInteger(width) ||
		!Number.isInteger(height) ||
		width < 80 ||
		height < 80 ||
		ink.length !== width * height
	)
		throw new Error('Invalid office detection image.');
	const validRect = (b: Rect) =>
		[b.x0, b.y0, b.x1, b.y1].every(Number.isFinite) &&
		b.x0 >= 0 &&
		b.y0 >= 0 &&
		b.x1 <= width &&
		b.y1 <= height &&
		b.x1 > b.x0 &&
		b.y1 > b.y0;
	const words = lines
		.filter((l) => l.confidence >= 45 && Number.isFinite(l.confidence) && validRect(l.bbox))
		.flatMap((l) => (l.words.length ? l.words : [{ text: l.text, bbox: l.bbox }]))
		.filter((w) => validRect(w.bbox) && clean(w.text));
	const choices: Choice[] = [],
		used = new Set<Word>();
	// Pair "Not Cleared" first, even when OCR block order lists "Cleared" first.
	for (const word of [...words].sort(
		(a, b) => +(clean(b.text) === 'not') - +(clean(a.text) === 'not')
	)) {
		if (used.has(word)) continue;
		const text = clean(word.text);
		if (text === 'not') {
			const next = words.find(
				(w) =>
					clearedCaption(w.text) &&
					w.bbox.x0 >= word.bbox.x1 &&
					w.bbox.x0 - word.bbox.x1 < width * 0.03 &&
					Math.abs(cy(w.bbox) - cy(word.bbox)) < word.bbox.y1 - word.bbox.y0
			);
			if (next) {
				choices.push({ kind: 'notCleared', bbox: union([word.bbox, next.bbox]) });
				used.add(next);
				used.add(word);
			}
		} else if (text === 'notcleared' || clearedCaption(word.text)) {
			choices.push({ kind: text === 'notcleared' ? 'notCleared' : 'cleared', bbox: word.bbox });
			used.add(word);
		}
	}
	const headers = words.filter((w) =>
		/^(?:departments?|offices?|units?|departmentoffices|departmentoffice)$/.test(clean(w.text))
	);
	const signatureHeaders = words.filter((w) => /signature|stamp/.test(clean(w.text)));
	const textHeights = words.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
	const minSize = (textHeights[Math.floor(textHeights.length / 2)] ?? 0) * 1.15;
	const boxes = squares(ink, width, height)
		.filter((b) => b.y1 - b.y0 >= minSize && b.x1 - b.x0 >= minSize)
		.sort((a, b) => cy(a) - cy(b) || a.x0 - b.x0);
	// OCR can read a checkbox outline as text such as "[od". It sits left
	// of the next checkbox but cannot supply that checkbox's office name.
	for (const word of words)
		if (
			boxes.some((box) => {
				const overlapWidth = Math.max(
					0,
					Math.min(word.bbox.x1, box.x1) - Math.max(word.bbox.x0, box.x0)
				);
				const overlapHeight = Math.max(
					0,
					Math.min(word.bbox.y1, box.y1) - Math.max(word.bbox.y0, box.y0)
				);
				return (
					overlapWidth * overlapHeight >=
					(word.bbox.x1 - word.bbox.x0) * (word.bbox.y1 - word.bbox.y0) * 0.5
				);
			})
		)
			used.add(word);
	const rules = horizontalRules(ink, width, height);
	const candidates: {
		row: OfficeRow;
		square: Rect;
		right: number;
		checkboxes: { square: Rect; choice?: Choice['kind'] }[];
	}[] = [];
	const normalizeBox = (r: Rect, pad = 2): Box => {
		const w = Math.max(width * 0.015, r.x1 - r.x0 + pad * 2),
			h = Math.max(height * 0.015, r.y1 - r.y0 + pad * 2);
		const x = Math.max(0, Math.min(width - w, r.x0 - pad)),
			y = Math.max(0, Math.min(height - h, r.y0 - pad));
		return { x: x / width, y: y / height, width: w / width, height: h / height };
	};
	for (const square of boxes) {
		const size = square.y1 - square.y0;
		// Prefer adjacent choice captions; use column headings only when no row caption exists.
		const inline = choices
			.filter(
				(c) =>
					c.bbox.x0 >= square.x0 - size * 0.2 &&
					c.bbox.x1 > square.x1 &&
					c.bbox.x0 - square.x1 < width * 0.06 &&
					Math.abs(cy(c.bbox) - cy(square)) < size * 0.85
			)
			.sort((a, b) => a.bbox.x0 - b.bbox.x0)[0];
		const heading = choices
			.filter(
				(c) =>
					c.bbox.y1 < square.y0 &&
					square.y0 - c.bbox.y1 < height * 0.3 &&
					Math.abs(cx(c.bbox) - cx(square)) < Math.max(size, (c.bbox.x1 - c.bbox.x0) / 2)
			)
			.sort((a, b) => b.bbox.y1 - a.bbox.y1)[0];
		const choice = inline ?? heading;
		const header = headers
			.filter((w) => w.bbox.x0 < square.x0 && w.bbox.y1 < square.y0)
			.sort((a, b) => b.bbox.y1 - a.bbox.y1 || b.bbox.x0 - a.bbox.x0)[0];
		// Do not turn isolated decorative squares into offices without table/choice evidence.
		if (!choice && !header) continue;
		const nearby = words.filter(
			(w) =>
				!used.has(w) &&
				!headers.includes(w) &&
				!signatureHeaders.includes(w) &&
				!/^(?:date|status|remarks)$/.test(clean(w.text)) &&
				w.bbox.x1 < square.x0 &&
				square.x0 - w.bbox.x1 < width * 0.4 &&
				Math.abs(cy(w.bbox) - cy(square)) < size * 0.9 &&
				(!header || w.bbox.x0 >= header.bbox.x0 - width * 0.04)
		);
		// Nearest group on the left belongs to this table; a wide gap separates adjacent tables.
		nearby.sort((a, b) => b.bbox.x1 - a.bbox.x1);
		const group: Word[] = [];
		for (const word of nearby) {
			if (group.length && group[group.length - 1].bbox.x0 - word.bbox.x1 > width * 0.045) break;
			group.push(word);
		}
		if (!group.length) continue;
		group.sort((a, b) =>
			Math.abs(cy(a.bbox) - cy(b.bbox)) > size * 0.35
				? a.bbox.y0 - b.bbox.y0
				: a.bbox.x0 - b.bbox.x0
		);
		const label = group
			.map((w) => w.text)
			.join(' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 100);
		if (
			label.length < 2 ||
			/student\s*(?:name|number)|contact\s*number|semester|academic\s*year|certify|obligation/i.test(
				label
			)
		)
			continue;
		const office = union(group.map((w) => w.bbox));
		let candidate = candidates.find(
			(c) =>
				Math.abs(cy(c.square) - cy(square)) < size * 0.85 &&
				Math.abs(c.row.office.x * width - office.x0) < size
		);
		if (!candidate) {
			if (candidates.length >= 30) continue;
			candidate = {
				row: { id: crypto.randomUUID(), label, office: normalizeBox(office) },
				square,
				right: office.x1,
				checkboxes: []
			};
			candidates.push(candidate);
		}
		candidate.checkboxes.push({ square, choice: choice?.kind });
		if (choice?.kind === 'cleared' && !candidate.row.cleared)
			candidate.row.cleared = normalizeBox(square);
		candidate.right = Math.max(candidate.right, square.x1, inline?.bbox.x1 ?? 0);
	}
	for (const candidate of candidates) {
		const { row, square } = candidate,
			size = square.y1 - square.y0;
		// A lone checkbox in an office row needs no repeated "Cleared" caption.
		if (
			!row.cleared &&
			candidate.checkboxes.length === 1 &&
			candidate.checkboxes[0].choice !== 'notCleared'
		)
			row.cleared = normalizeBox(candidate.checkboxes[0].square);
		const nextTable = candidates
			.filter(
				(c) =>
					c !== candidate &&
					Math.abs(cy(c.square) - cy(square)) < size &&
					c.row.office.x * width > candidate.right
			)
			.sort((a, b) => a.row.office.x - b.row.office.x)[0];
		const limit = nextTable ? nextTable.row.office.x * width - 4 : width * 0.98;
		const header = signatureHeaders
			.filter((w) => w.bbox.x0 > row.office.x * width && w.bbox.x0 < limit && w.bbox.y1 < square.y0)
			.sort((a, b) => b.bbox.y1 - a.bbox.y1 || a.bbox.x0 - b.bbox.x0)[0];
		const matching = rules.filter(
			(r) =>
				r.y0 >= cy(square) - size * 0.4 &&
				r.y0 <= cy(square) + size * 1.15 &&
				(header
					? r.x0 <= cx(header.bbox) && r.x1 >= cx(header.bbox)
					: r.x0 > candidate.right + size * 0.15) &&
				r.x0 < limit
		);
		// Separate signature underlines precede date lines. Full-width rules require a signature column.
		const rule = matching
			.filter((r) => header || r.x1 - r.x0 < width * 0.5)
			.sort(
				(a, b) =>
					(a.x1 - a.x0 > width * 0.55 ? 1 : 0) - (b.x1 - b.x0 > width * 0.55 ? 1 : 0) ||
					a.x0 - b.x0 ||
					Math.abs(a.y0 - square.y1) - Math.abs(b.y0 - square.y1)
			)[0];
		if (!rule) continue;
		let left = Math.max(rule.x0, candidate.right + 4),
			right = Math.min(rule.x1, limit);
		if (rule.x1 - rule.x0 > width * 0.55) {
			if (!header) continue;
			// Table-cell borders determine the signature column around its heading.
			const vertical: number[] = [];
			for (let x = Math.ceil(candidate.right + 4); x < limit; x++) {
				let count = 0;
				const top = Math.max(0, Math.floor(cy(square) - size * 0.6)),
					bottom = Math.min(height, Math.ceil(cy(square) + size * 0.6));
				for (let y = top; y < bottom; y++) count += +!!ink[y * width + x];
				if (count / (bottom - top) >= 0.75) vertical.push(x);
			}
			const before = vertical.filter((x) => x < cx(header.bbox)),
				after = vertical.filter((x) => x > cx(header.bbox));
			if (!before.length || !after.length) continue;
			left = Math.max(...before) + 3;
			right = Math.min(...after) - 3;
		}
		const previous = candidates
			.filter(
				(c) =>
					c !== candidate &&
					Math.abs(c.row.office.x - row.office.x) < 0.1 &&
					cy(c.square) < cy(square) - size
			)
			.sort((a, b) => cy(b.square) - cy(a.square))[0];
		const top = Math.max(
			0,
			rule.y0 - Math.max(size * 1.35, height * 0.028),
			previous ? (cy(previous.square) + cy(square)) / 2 : 0
		);
		const bottom = rule.y0 - 2;
		if (right - left >= width * 0.04 && bottom - top >= height * 0.015)
			row.signature = normalizeBox({ x0: left, x1: right, y0: top, y1: bottom }, 0);
	}
	const rows = candidates.map((c) => c.row);
	const counts = new Map<string, number>();
	for (const row of rows) {
		const key = row.label.toLowerCase(),
			count = (counts.get(key) ?? 0) + 1;
		counts.set(key, count);
		if (count > 1) row.label = `${row.label.slice(0, 95)} (${count})`;
	}
	const hints = [
		'Review each office and linked box. Row alignment, checkbox outlines and printed rules are estimates, not approval evidence.'
	];
	if (!rows.length)
		hints.push('No reliable office rows found. Add offices and mark their boxes manually.');
	for (const row of rows) {
		if (!row.cleared)
			hints.push(`${row.label}: cleared checkbox was not identified. Mark it manually.`);
		if (!row.signature)
			hints.push(`${row.label}: signature / stamp space was not located. Mark it manually.`);
	}
	return { rows, hints };
}
