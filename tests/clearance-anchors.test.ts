import assert from 'node:assert/strict';
import test from 'node:test';
import { alignPrintedAnchors } from '../src/lib/clearance/anchors';
import { homography, project, UNIT_CORNERS, type Corners } from '../src/lib/clearance/clearance';
import type { TemplateDefinition } from '../src/lib/clearance/definition';
import type { PrintedLine } from '../src/lib/clearance/suggestions';

const width = 1200,
	height = 1000;
function line(text: string, x: number, y: number): PrintedLine {
	const words = text.split(' ').map((text, i) => ({
		text,
		bbox: {
			x0: (x + i * 0.13) * width,
			x1: (x + i * 0.13 + 0.1) * width,
			y0: y * height,
			y1: (y + 0.025) * height
		}
	}));
	return {
		text,
		confidence: 95,
		words,
		bbox: {
			x0: words[0].bbox.x0,
			x1: words.at(-1)!.bbox.x1,
			y0: y * height,
			y1: (y + 0.025) * height
		}
	};
}
const lines = [
	line('BULACAN POLYTECHNIC COLLEGE', 0.35, 0.05),
	line('STUDENT CLEARANCE FORM', 0.35, 0.17),
	line('Library', 0.08, 0.35),
	line('Registrar', 0.08, 0.47),
	line('Finance', 0.08, 0.59),
	line('Student Number', 0.04, 0.76),
	line('Course Yr Sec', 0.04, 0.84),
	line('Contact Number', 0.04, 0.92)
];
const definition: TemplateDefinition = {
	corners: UNIT_CORNERS,
	areas: lines
		.slice(0, 2)
		.map((l, i) => ({
			id: String(i),
			label: l.text,
			kind: 'text',
			expected: l.text,
			box: {
				x: l.bbox.x0 / width,
				y: l.bbox.y0 / height,
				width: (l.bbox.x1 - l.bbox.x0) / width,
				height: 0.04
			}
		})),
	officeRows: lines
		.slice(2, 5)
		.map((l, i) => ({
			id: String(i),
			label: l.text,
			office: { x: 0.05, y: l.bbox.y0 / height, width: 0.2, height: 0.04 }
		}))
};
const corners: Corners = [
	{ x: 0.12, y: 0.08 },
	{ x: 0.88, y: 0.04 },
	{ x: 0.93, y: 0.91 },
	{ x: 0.08, y: 0.96 }
];
const reference = { lines, width, height };
function transformed(points = corners, input = lines) {
	const matrix = homography(UNIT_CORNERS, points);
	const box = (b: PrintedLine['bbox']) => {
		const p = [
			{ x: b.x0 / width, y: b.y0 / height },
			{ x: b.x1 / width, y: b.y0 / height },
			{ x: b.x1 / width, y: b.y1 / height },
			{ x: b.x0 / width, y: b.y1 / height }
		].map((p) => project(matrix, p));
		return {
			x0: Math.min(...p.map((p) => p.x)) * width,
			x1: Math.max(...p.map((p) => p.x)) * width,
			y0: Math.min(...p.map((p) => p.y)) * height,
			y1: Math.max(...p.map((p) => p.y)) * height
		};
	};
	return {
		width,
		height,
		lines: input.map((l) => ({
			...l,
			bbox: box(l.bbox),
			words: l.words.map((w) => ({ ...w, bbox: box(w.bbox) }))
		}))
	};
}

test('distributed printed anchors estimate perspective corners without any border pixels', () => {
	const result = alignPrintedAnchors(reference, transformed(), definition);
	assert(result.corners, result.detail);
	result.corners.forEach((p, i) =>
		assert(Math.hypot(p.x - corners[i].x, p.y - corners[i].y) < 0.012)
	);
	assert.match(result.detail, /Confirm all corners/);
});

test('header-only, low-confidence and ambiguous matches never estimate an outline', () => {
	for (const input of [
		lines.slice(0, 2),
		lines.map((l) => ({ ...l, confidence: 30 })),
		[...lines, ...lines]
	])
		assert.equal(
			alignPrintedAnchors(reference, transformed(corners, input), definition).corners,
			null
		);
});

test('wrong office arrangement is rejected even when the school header and lower labels match', () => {
	const upload = transformed();
	[upload.lines[2], upload.lines[4]] = [
		{
			...upload.lines[2],
			bbox: upload.lines[4].bbox,
			words: upload.lines[4].words.map((w) => ({ ...w, text: 'Library' }))
		},
		{
			...upload.lines[4],
			bbox: upload.lines[2].bbox,
			words: upload.lines[2].words.map((w) => ({ ...w, text: 'Finance' }))
		}
	];
	assert.equal(alignPrintedAnchors(reference, upload, definition).corners, null);
});

test('one OCR position outlier is ignored, but an out-of-frame inferred border is rejected', () => {
	const upload = transformed();
	upload.lines[1].words[2].bbox.x0 += 200;
	upload.lines[1].words[2].bbox.x1 += 200;
	assert(alignPrintedAnchors(reference, upload, definition).corners);
	const cropped = corners.map((p, i) => ({ ...p, y: i > 1 ? p.y + 0.15 : p.y })) as Corners;
	assert.equal(alignPrintedAnchors(reference, transformed(cropped), definition).corners, null);
});

test('handwritten values and changing enrollment term cannot supply missing lower anchors', () => {
	const variable = [
		line('JONNEL PALILEO', 0.04, 0.72),
		line('MA 23016578', 0.04, 0.8),
		line('Second Semester', 0.4, 0.9)
	];
	const blank = { ...reference, lines: [...lines.slice(0, 5), ...variable] };
	assert.equal(
		alignPrintedAnchors(blank, transformed(corners, blank.lines), definition).corners,
		null
	);
});
