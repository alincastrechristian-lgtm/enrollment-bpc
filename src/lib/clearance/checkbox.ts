import {
	addedInk,
	homography,
	project,
	UNIT_CORNERS,
	type Check,
	type Region,
	type Point,
	type Corners
} from './clearance';

type Edge = { offset: number; slope: number; score: number };

// Fit nearby printed edges before inspecting the interior. Geometry selection must not
// prefer checked boxes over empty boxes. Peer bounds prevent jumping into another office.
function frame(
	ink: Uint8Array,
	width: number,
	height: number,
	box: Region,
	bounds: Region
): Corners | undefined {
	const cx = box.x + (box.width - 1) / 2,
		cy = box.y + (box.height - 1) / 2;
	const band = Math.max(1, Math.round(Math.min(box.width, box.height) * 0.035));
	const inside = (p: Point) =>
		p.x >= band && p.y >= band && p.x < width - band && p.y < height - band;
	const hit = (x: number, y: number, vertical: boolean) => {
		const px = Math.round(x),
			py = Math.round(y);
		if (px < band || py < band || px >= width - band || py >= height - band) return false;
		for (let d = -band; d <= band; d++)
			if (ink[vertical ? py * width + px + d : (py + d) * width + px]) return true;
		return false;
	};
	function edges(vertical: boolean, side: number): Edge[] {
		const span = vertical ? box.height : box.width,
			size = vertical ? box.width : box.height;
		const expected = (side * (size - 1)) / 2,
			candidates: Edge[] = [];
		// Search translation and edge angle independently; intersecting edges adjusts each corner.
		for (const slope of [-0.24, -0.18, -0.12, -0.06, 0, 0.06, 0.12, 0.18, 0.24]) {
			for (
				let offset = Math.round(expected - size * 0.45);
				offset <= expected + size * 0.45;
				offset += Math.max(1, Math.round(size / 64))
			) {
				let votes = 0;
				const step = Math.max(1, Math.round(span / 64));
				for (let q = -span * 0.95; q <= span * 0.95; q += step) {
					const p = offset + slope * q;
					if (hit(cx + (vertical ? p : q), cy + (vertical ? q : p), vertical)) votes++;
				}
				if (votes * step >= span * 0.65)
					candidates.push({
						offset,
						slope,
						score: (votes * step) / span - (Math.abs(offset - expected) / size) * 0.08
					});
			}
		}
		candidates.sort((a, b) => b.score - a.score);
		const selected: Edge[] = [];
		for (const candidate of candidates) {
			if (
				selected.some(
					(e) =>
						Math.abs(e.offset - candidate.offset) < band * 2 + 1 &&
						Math.abs(e.slope - candidate.slope) * span < band * 3
				)
			)
				continue;
			selected.push(candidate);
			if (selected.length === 6) break;
		}
		return selected;
	}
	const intersection = (vertical: Edge, horizontal: Edge): Point => {
		const x =
			(vertical.offset + vertical.slope * horizontal.offset) /
			(1 - vertical.slope * horizontal.slope);
		return { x: cx + x, y: cy + horizontal.offset + horizontal.slope * x };
	};
	const length = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
	function coverage(a: Point, b: Point, start = 0.04, end = 0.96) {
		const vertical = Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
		let covered = 0,
			count = 0;
		const samples = Math.min(96, Math.ceil(length(a, b)));
		for (let i = Math.ceil(start * samples); i <= Math.floor(end * samples); i++) {
			const f = i / samples;
			if (hit(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, vertical)) covered++;
			count++;
		}
		return count ? covered / count : 0;
	}
	const left = edges(true, -1),
		right = edges(true, 1),
		top = edges(false, -1),
		bottom = edges(false, 1);
	let best: Corners | undefined,
		bestScore = -Infinity;
	for (const l of left)
		for (const r of right)
			for (const t of top)
				for (const b of bottom) {
					const points: Corners = [
						intersection(l, t),
						intersection(r, t),
						intersection(r, b),
						intersection(l, b)
					];
					if (!points.every(inside)) continue;
					const sizes = points.map((point, i) => length(point, points[(i + 1) % 4]));
					if (
						sizes.some(
							(size, i) =>
								size < (i % 2 ? box.height : box.width) * 0.6 ||
								size > (i % 2 ? box.height : box.width) * 1.4
						)
					)
						continue;
					if (
						points.some((a, i) => {
							const b = points[(i + 1) % 4],
								c = points[(i + 2) % 4];
							return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0;
						})
					)
						continue;
					const center = {
						x: points.reduce((sum, p) => sum + p.x, 0) / 4,
						y: points.reduce((sum, p) => sum + p.y, 0) / 4
					};
					if (
						center.x < bounds.x ||
						center.x >= bounds.x + bounds.width ||
						center.y < bounds.y ||
						center.y >= bounds.y + bounds.height
					)
						continue;
					if (
						Math.abs(center.x - cx) > box.width * 0.45 ||
						Math.abs(center.y - cy) > box.height * 0.45
					)
						continue;
					const scores = points.map((point, i) => {
						const next = points[(i + 1) % 4];
						return Math.min(
							coverage(point, next),
							coverage(point, next, 0.04, 0.25),
							coverage(point, next, 0.75, 0.96)
						);
					});
					if (scores.some((score) => score < 0.8)) continue;
					const score =
						scores.reduce((sum, value) => sum + value, 0) / 4 -
						Math.hypot((center.x - cx) / box.width, (center.y - cy) / box.height) * 0.08 -
						sizes.reduce(
							(sum, size, i) => sum + Math.abs(size / (i % 2 ? box.height : box.width) - 1),
							0
						) *
							0.02;
					if (score > bestScore) {
						bestScore = score;
						best = points;
					}
				}
	if (!best) return;
	const smallest = Math.min(...best.map((point, i) => length(point, best![(i + 1) % 4])));
	if (smallest - 2 * (Math.ceil(smallest * 0.2) + band) < 6) return;
	return best;
}

function patch(ink: Uint8Array, width: number, corners: Corners) {
	const result = new Uint8Array(32 * 32);
	const smallest = Math.min(
		...corners.map((point, i) =>
			Math.hypot(point.x - corners[(i + 1) % 4].x, point.y - corners[(i + 1) % 4].y)
		)
	);
	const inset = (Math.ceil(smallest * 0.2) + Math.max(1, Math.round(smallest * 0.035))) / smallest;
	const matrix = homography(UNIT_CORNERS, corners);
	for (let y = 0; y < 32; y++)
		for (let x = 0; x < 32; x++) {
			const point = project(matrix, {
				x: inset + (x / 31) * (1 - 2 * inset),
				y: inset + (y / 31) * (1 - 2 * inset)
			});
			result[y * 32 + x] = ink[Math.round(point.y) * width + Math.round(point.x)];
		}
	return result;
}

function searchBounds(box: Region, peers: Region[], width: number, height: number): Region {
	const cx = box.x + box.width / 2,
		cy = box.y + box.height / 2;
	let left = 0,
		top = 0,
		right = width,
		bottom = height;
	for (const peer of peers) {
		if (
			peer === box ||
			(peer.x === box.x &&
				peer.y === box.y &&
				peer.width === box.width &&
				peer.height === box.height)
		)
			continue;
		const px = peer.x + peer.width / 2,
			py = peer.y + peer.height / 2;
		if (Math.abs(px - cx) < (box.width + peer.width) / 2) {
			if (py < cy) top = Math.max(top, (cy + py) / 2);
			else if (py > cy) bottom = Math.min(bottom, (cy + py) / 2);
		}
		if (Math.abs(py - cy) < (box.height + peer.height) / 2) {
			if (px < cx) left = Math.max(left, (cx + px) / 2);
			else if (px > cx) right = Math.min(right, (cx + px) / 2);
		}
	}
	return { x: left, y: top, width: right - left, height: bottom - top };
}

function connectedMark(ink: Uint8Array) {
	const seen = new Uint8Array(ink.length);
	for (let start = 0; start < ink.length; start++) {
		if (!ink[start] || seen[start]) continue;
		const queue = [start];
		seen[start] = 1;
		let x0 = 32,
			y0 = 32,
			x1 = 0,
			y1 = 0;
		for (let i = 0; i < queue.length; i++) {
			const p = queue[i],
				x = p % 32,
				y = Math.floor(p / 32);
			x0 = Math.min(x0, x);
			x1 = Math.max(x1, x);
			y0 = Math.min(y0, y);
			y1 = Math.max(y1, y);
			for (let dy = -1; dy <= 1; dy++)
				for (let dx = -1; dx <= 1; dx++) {
					const nx = x + dx,
						ny = y + dy,
						next = ny * 32 + nx;
					if (nx < 0 || nx >= 32 || ny < 0 || ny >= 32 || seen[next] || !ink[next]) continue;
					seen[next] = 1;
					queue.push(next);
				}
		}
		if (queue.length >= 6 && Math.max(x1 - x0, y1 - y0) >= 8) return true;
	}
	return false;
}

export function checkCheckbox(
	label: string,
	reference: Uint8Array,
	actual: Uint8Array,
	width: number,
	height: number,
	box: Region,
	peers: Region[] = []
): Check {
	const bounds = searchBounds(box, peers, width, height);
	const blankBox = frame(reference, width, height, box, bounds),
		scanBox = frame(actual, width, height, box, bounds);
	if (!blankBox || !scanBox)
		return {
			label,
			verdict: 'review',
			detail:
				'Four checkbox edges could not be located near this office. Check the template office layout and form outline, or upload a clearer image.'
		};
	const blank = patch(reference, width, blankBox),
		scan = patch(actual, width, scanBox);
	// Reject a marked or noisy reference instead of using it to erase student marks.
	if (blank.reduce((sum, pixel) => sum + pixel, 0) / blank.length > 0.01)
		return {
			label,
			verdict: 'review',
			detail:
				'The saved checkbox interior is not blank. Ask the administrator to review the template.'
		};
	const ink = addedInk(scan, blank, 32, 32, { x: 0, y: 0, width: 32, height: 32 });
	const marked = ink >= 0.012 && connectedMark(scan);
	return {
		label,
		verdict: marked ? 'pass' : ink > 0 ? 'review' : 'fail',
		detail: marked
			? 'A mark was detected inside the cleared checkbox. Staff must review the document.'
			: ink > 0
				? 'A faint or isolated mark inside the checkbox needs review.'
				: 'The cleared checkbox is empty.'
	};
}
