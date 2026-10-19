import {
	homography,
	project,
	UNIT_CORNERS,
	validCorners,
	type Corners,
	type Point
} from './clearance';
import type { Box, TemplateDefinition } from './definition';
import type { PrintedLine } from './suggestions';

type Word = { text: string; point: Point; line: number; office?: number };
type Match = { from: Point; to: Point; line: number; office?: number };
export type AnchorAlignment = { corners: Corners | null; detail: string };
const clean = (text: string) => text.toUpperCase().replace(/[^A-Z]/g, '');
const inside = (p: Point, b: Box) =>
	p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;

function words(lines: PrintedLine[], width: number, height: number): Word[] {
	return lines.flatMap((line, index) =>
		!Number.isFinite(line.confidence) || line.confidence < 65
			? []
			: line.words.flatMap((word) => {
					const text = clean(word.text);
					const point = {
						x: (word.bbox.x0 + word.bbox.x1) / (2 * width),
						y: (word.bbox.y0 + word.bbox.y1) / (2 * height)
					};
					return text.length >= 2 &&
						/^[A-Za-z.'’:-]+$/.test(word.text) &&
						Number.isFinite(point.x + point.y) &&
						inside(point, { x: 0, y: 0, width: 1, height: 1 })
						? [{ text, point, line: index }]
						: [];
				})
	);
}

// Least-squares projective fit. Coordinates are normalized before entering this module.
function fit(matches: Match[]): number[] | null {
	const rows: number[][] = [];
	for (const {
		from: { x, y },
		to: { x: u, y: v }
	} of matches) {
		rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
		rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
	}
	const normal = Array.from({ length: 8 }, (_, i) =>
		Array.from({ length: 9 }, (_, j) => rows.reduce((sum, row) => sum + row[i] * row[j], 0))
	);
	for (let col = 0; col < 8; col++) {
		let pivot = col;
		for (let row = col + 1; row < 8; row++)
			if (Math.abs(normal[row][col]) > Math.abs(normal[pivot][col])) pivot = row;
		[normal[col], normal[pivot]] = [normal[pivot], normal[col]];
		const divisor = normal[col][col];
		if (Math.abs(divisor) < 1e-10) return null;
		for (let j = col; j <= 8; j++) normal[col][j] /= divisor;
		for (let row = 0; row < 8; row++) {
			if (row === col) continue;
			const factor = normal[row][col];
			for (let j = col; j <= 8; j++) normal[row][j] -= factor * normal[col][j];
		}
	}
	return [...normal.map((row) => row[8]), 1];
}

function spread(matches: Match[]) {
	const points = matches.map((m) => m.from);
	return (
		matches.length >= 6 &&
		new Set(matches.map((m) => m.line)).size >= 4 &&
		Math.min(...points.map((p) => p.y)) < 0.3 &&
		Math.max(...points.map((p) => p.y)) > 0.65 &&
		Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)) > 0.35
	);
}

/** Estimate an outline only; matching anchors never approves a clearance. */
export function alignPrintedAnchors(
	reference: { lines: PrintedLine[]; width: number; height: number },
	upload: { lines: PrintedLine[]; width: number; height: number },
	definition: TemplateDefinition
): AnchorAlignment {
	const refWords = words(reference.lines, reference.width, reference.height);
	const uploaded = words(upload.lines, upload.width, upload.height);
	const permanent = refWords.filter((word) => {
		const office =
			definition.officeRows?.findIndex(
				(row) =>
					inside(word.point, row.office) &&
					row.label.split(/\s+/).some((part) => clean(part) === word.text)
			) ?? -1;
		if (office >= 0) {
			word.office = office;
			return true;
		}
		if (
			word.text.length >= 3 &&
			definition.areas.some(
				(area) =>
					area.kind === 'text' &&
					inside(word.point, area.box) &&
					area.expected.split(/\s+/).some((part) => clean(part) === word.text)
			)
		)
			return true;
		// Only fixed printed labels, never the personal values beside/above them.
		return (
			/student.?s?\s*(?:name|number)|name.*signature|course.*(?:yr|year)|contact.*number/i.test(
				reference.lines[word.line].text
			) &&
			/^(?:STUDENT|STUDENTS|NAME|NUMBER|SIGNATURE|COURSE|YEAR|SECTION|SEC|CONTACT)$/.test(word.text)
		);
	});
	const matches: Match[] = [];
	for (const word of permanent) {
		// Repeated words (e.g. Adviser or Number) cannot identify a unique location.
		if (refWords.filter((w) => w.text === word.text).length !== 1) continue;
		const targets = uploaded.filter((w) => w.text === word.text);
		if (targets.length !== 1) continue;
		matches.push({ from: word.point, to: targets[0].point, line: word.line, office: word.office });
	}
	const insufficient = {
		corners: null,
		detail:
			'Not enough matching printed anchors spread across the form. Draw the outline manually or upload a clearer, complete photo.'
	};
	if (!spread(matches)) return insufficient;
	const error = (matrix: number[], match: Match) => {
		const p = project(matrix, match.from);
		return Math.hypot(p.x - match.to.x, p.y - match.to.y);
	};
	let best: Match[] = [],
		bestError = Infinity,
		seed = 12345;
	// Bounded, deterministic RANSAC excludes OCR mistakes and text in the background.
	for (let trial = 0; trial < 800; trial++) {
		const indices = new Set<number>();
		while (indices.size < 4) {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
			indices.add(Math.floor((seed / 0x100000000) * matches.length));
		}
		const sample = [...indices].map((i) => matches[i]);
		let matrix: number[];
		try {
			matrix = homography(sample.map((m) => m.from) as Corners, sample.map((m) => m.to) as Corners);
		} catch {
			continue;
		}
		const inliers = matches.filter((m) => error(matrix, m) < 0.012);
		const residual = inliers.reduce((sum, m) => sum + error(matrix, m), 0);
		if (inliers.length > best.length || (inliers.length === best.length && residual < bestError)) {
			best = inliers;
			bestError = residual;
		}
	}
	if (!spread(best) || best.length < matches.length * 0.8) return insufficient;
	const offices = new Set(best.flatMap((m) => (m.office === undefined ? [] : [m.office])));
	if (
		definition.officeRows?.length &&
		offices.size <
			Math.max(
				Math.min(2, definition.officeRows.length),
				Math.ceil(definition.officeRows.length * 0.7)
			)
	)
		return {
			corners: null,
			detail:
				'Printed office layout could not be aligned reliably with this template. Check that the correct template is selected.'
		};
	const matrix = fit(best);
	if (
		!matrix ||
		best.some((m) => error(matrix, m) >= 0.012) ||
		UNIT_CORNERS.some((p) => matrix[6] * p.x + matrix[7] * p.y + 1 < 0.1)
	)
		return insufficient;
	const corners = UNIT_CORNERS.map((p) => project(matrix, p)) as Corners;
	if (!validCorners(corners))
		return {
			corners: null,
			detail:
				'Printed anchors suggest a cropped or unreliable form outline. Upload the complete form or draw its visible outline for review.'
		};
	return {
		corners,
		detail: `Outline estimated from ${best.length} printed anchors across ${new Set(best.map((m) => m.line)).size} lines. Confirm all corners before checking the clearance.`
	};
}
