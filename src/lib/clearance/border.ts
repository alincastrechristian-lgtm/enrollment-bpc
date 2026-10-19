import { validCorners, type Corners, type Point } from './clearance';

type Line = { cos: number; sin: number; rho: number; votes: number; middle: number };
type Candidate = { points: Corners; area: number };

function intersection(a: Line, b: Line): Point {
	const determinant = a.cos * b.sin - b.cos * a.sin;
	return {
		x: (a.rho * b.sin - b.rho * a.sin) / determinant,
		y: (a.cos * b.rho - b.cos * a.rho) / determinant
	};
}

// Paper edges can curve away from a fitted line. Find the local meeting of both printed sides.
function refineCorners(
	points: Corners,
	masks: Uint8Array[],
	width: number,
	height: number
): Corners {
	const radius = Math.min(40, Math.round(Math.min(width, height) * 0.06));
	return points.map((point, corner) => {
		if (point.x < 6 || point.x >= width - 6 || point.y < 6 || point.y >= height - 6) return point;
		const rays = [1, 3].map((offset) => {
			const other = points[(corner + offset) % 4],
				length = Math.hypot(other.x - point.x, other.y - point.y);
			const side = offset === 1 ? corner : (corner + 3) % 4;
			return {
				dx: (other.x - point.x) / length,
				dy: (other.y - point.y) / length,
				mask: masks[side % 2 === 0 ? 1 : 0]
			};
		});
		let best = point,
			bestScore = 0.7;
		for (
			let y = Math.max(6, Math.round(point.y) - radius);
			y < Math.min(height - 6, point.y + radius);
			y++
		) {
			for (
				let x = Math.max(6, Math.round(point.x) - radius);
				x < Math.min(width - 6, point.x + radius);
				x++
			) {
				if (!masks[0][y * width + x] && !masks[1][y * width + x]) continue;
				const scores = rays.map(({ dx, dy, mask }) => {
					let hits = 0,
						samples = 0;
					for (let distance = 6; distance <= 45; distance += 3) {
						const sx = Math.round(x + dx * distance),
							sy = Math.round(y + dy * distance);
						if (sx < 3 || sx >= width - 3 || sy < 3 || sy >= height - 3) continue;
						samples++;
						let found = false;
						for (let oy = -3; oy <= 3 && !found; oy++)
							for (let ox = -3; ox <= 3; ox++)
								if (mask[(sy + oy) * width + sx + ox]) {
									found = true;
									break;
								}
						if (found) hits++;
					}
					return samples >= 7 ? hits / samples : 0;
				});
				const score = Math.min(...scores) - Math.hypot(x - point.x, y - point.y) * 0.001;
				if (score > bestScore) {
					bestScore = score;
					best = { x, y };
				}
			}
		}
		return best;
	}) as Corners;
}

// Find long dark printed lines, not just the contrasting edge of the paper.
// Inputs are downscaled by the browser adapter; upright forms within about 25 degrees are supported.
export function findBorder(gray: Uint8Array, width: number, height: number): Corners | null {
	if (width < 80 || height < 80 || gray.length !== width * height) return null;
	const diagonal = Math.ceil(Math.hypot(width, height)),
		bins = diagonal * 2 + 1;
	const angles = Array.from({ length: 51 }, (_, i) => ((i - 25) * Math.PI) / 180);
	const families = [angles, angles.map((angle) => angle + Math.PI / 2)];
	const masks = [new Uint8Array(gray.length), new Uint8Array(gray.length)];
	const accumulators = families.map(() => new Uint16Array(51 * bins));
	const trig = families.map((family) =>
		family.map((angle) => ({ cos: Math.cos(angle), sin: Math.sin(angle) }))
	);
	for (let y = 6; y < height - 6; y++) {
		for (let x = 6; x < width - 6; x++) {
			const i = y * width + x;
			const gx =
				gray[i - width + 1] +
				2 * gray[i + 1] +
				gray[i + width + 1] -
				gray[i - width - 1] -
				2 * gray[i - 1] -
				gray[i + width - 1];
			const gy =
				gray[i + width - 1] +
				2 * gray[i + width] +
				gray[i + width + 1] -
				gray[i - width - 1] -
				2 * gray[i - width] -
				gray[i - width + 1];
			if (Math.abs(gx) + Math.abs(gy) < 90) continue;
			const family =
				Math.abs(gx) > Math.abs(gy) * 1.4 ? 0 : Math.abs(gy) > Math.abs(gx) * 1.4 ? 1 : -1;
			if (family < 0) continue;
			const step = family === 0 ? 1 : width;
			let darkest = 255;
			for (let d = -2; d <= 2; d++) darkest = Math.min(darkest, gray[i + d * step]);
			if (gray[i - 6 * step] < darkest + 12 || gray[i + 6 * step] < darkest + 12) continue;
			masks[family][i] = 1;
			for (let angle = 0; angle < 51; angle++) {
				const { cos, sin } = trig[family][angle];
				accumulators[family][angle * bins + Math.round(x * cos + y * sin) + diagonal]++;
			}
		}
	}
	const lines = accumulators.map((accumulator, family) => {
		const peaks: Line[] = [];
		// A true line must stand above scattered edges, not just exceed a fixed vote count.
		const noiseFloor =
			masks[family].reduce((sum, pixel) => sum + pixel, 0) / (family === 0 ? width : height);
		const required = Math.max(Math.min(width, height) * 0.3, noiseFloor * 3);
		for (let angle = 0; angle < 51; angle++) {
			const { cos, sin } = trig[family][angle];
			for (let bin = 3; bin < bins - 3; bin++) {
				const index = angle * bins + bin,
					votes = accumulator[index];
				if (votes < required) continue;
				let peak = true;
				for (let offset = -3; offset <= 3; offset++)
					if (accumulator[index + offset] > votes) {
						peak = false;
						break;
					}
				if (!peak) continue;
				const rho = bin - diagonal;
				const middle =
					family === 0 ? (rho - (height / 2) * sin) / cos : (rho - (width / 2) * cos) / sin;
				const size = family === 0 ? width : height;
				if (middle >= -size * 0.06 && middle <= size * 1.06)
					peaks.push({ cos, sin, rho, votes, middle });
			}
		}
		peaks.sort((a, b) => b.votes - a.votes);
		const selected: Line[] = [];
		for (const peak of peaks) {
			if (
				selected.some(
					(line) => Math.abs(line.middle - peak.middle) < Math.min(width, height) * 0.025
				)
			)
				continue;
			selected.push(peak);
			if (selected.length === 12) break;
		}
		return selected.sort((a, b) => a.middle - b.middle);
	});
	const candidates: Candidate[] = [];
	for (const left of lines[0])
		for (const right of lines[0]) {
			if (
				left.middle > width * 0.45 ||
				right.middle < width * 0.55 ||
				right.middle - left.middle < width * 0.45
			)
				continue;
			for (const top of lines[1])
				for (const bottom of lines[1]) {
					if (
						top.middle > height * 0.4 ||
						bottom.middle < height * 0.6 ||
						bottom.middle - top.middle < height * 0.45
					)
						continue;
					const points: Corners = [
						intersection(left, top),
						intersection(right, top),
						intersection(right, bottom),
						intersection(left, bottom)
					];
					if (
						points.some(
							({ x, y }) =>
								!Number.isFinite(x + y) ||
								x < -width * 0.04 ||
								x > width * 1.04 ||
								y < -height * 0.04 ||
								y > height * 1.04
						)
					)
						continue;
					const normalized = points.map(({ x, y }) => ({
						x: Math.max(0, Math.min(1, x / (width - 1))),
						y: Math.max(0, Math.min(1, y / (height - 1)))
					})) as Corners;
					if (!validCorners(normalized)) continue;
					const area =
						Math.abs(
							points.reduce((sum, point, i) => {
								const next = points[(i + 1) % 4];
								return sum + point.x * next.y - next.x * point.y;
							}, 0)
						) / 2;
					if (area < width * height * 0.3) continue;
					candidates.push({ points, area });
				}
		}
	// Prefer the enclosing form border over interior lines. Require sustained ink on all four sides.
	candidates.sort((a, b) => b.area - a.area);
	for (const { points } of candidates.slice(0, 60)) {
		const supported = points.every((a, side) => {
			const b = points[(side + 1) % 4],
				mask = masks[side % 2 === 0 ? 1 : 0];
			const length = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
			let visible = 0,
				ink = 0;
			for (let n = 0; n <= length; n += 2) {
				const x = Math.round(a.x + ((b.x - a.x) * n) / length),
					y = Math.round(a.y + ((b.y - a.y) * n) / length);
				if (x < 6 || x >= width - 6 || y < 6 || y >= height - 6) continue;
				visible++;
				let found = false;
				for (let dy = -3; dy <= 3 && !found; dy++)
					for (let dx = -3; dx <= 3; dx++)
						if (mask[(y + dy) * width + x + dx]) {
							found = true;
							break;
						}
				if (found) ink++;
			}
			return visible >= length * 0.2 && ink / visible >= 0.7;
		});
		if (supported) {
			const refined = refineCorners(points, masks, width, height).map(({ x, y }) => ({
				x: Math.max(0, Math.min(1, x / (width - 1))),
				y: Math.max(0, Math.min(1, y / (height - 1)))
			})) as Corners;
			if (validCorners(refined)) return refined;
		}
	}
	return null;
}
