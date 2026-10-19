import { addedInk, type Check, type Region } from './clearance';

// Locate all four printed edges near the saved box. Marks must never supply
// missing frame evidence: uncertain alignment requires manual review.
function frame(ink: Uint8Array, width: number, height: number, box: Region): Region | undefined {
	const band = Math.max(1, Math.round(Math.min(box.width, box.height) * 0.035));
	function coverage(vertical: boolean, p: number, start: number, end: number, radius = band) {
		if (p - radius < 0 || p + radius >= (vertical ? width : height)) return 0;
		let covered = 0,
			count = 0;
		for (let q = Math.ceil(start); q < Math.floor(end); q++) {
			if (q < 0 || q >= (vertical ? height : width)) continue;
			count++;
			for (let d = -radius; d <= radius; d++) {
				if (ink[vertical ? q * width + p + d : (p + d) * width + q]) {
					covered++;
					break;
				}
			}
		}
		return count ? covered / count : 0;
	}
	function edge(
		vertical: boolean,
		expected: number,
		start: number,
		end: number,
		range: number,
		accept: (p: number) => boolean = () => true
	) {
		let best = -1,
			bestScore = -1;
		for (let p = Math.round(expected - range); p <= Math.round(expected + range); p++) {
			const covered = coverage(vertical, p, start, end);
			const score = covered - (Math.abs(p - expected) / Math.max(1, range)) * 0.05;
			if (covered >= 0.8 && score > bestScore && accept(p)) {
				best = p;
				bestScore = score;
			}
		}
		return best;
	}
	const left = edge(
		true,
		box.x,
		box.y + box.height * 0.25,
		box.y + box.height * 0.75,
		box.width * 0.25
	);
	const right = edge(
		true,
		box.x + box.width - 1,
		box.y + box.height * 0.25,
		box.y + box.height * 0.75,
		box.width * 0.25
	);
	if (left < 0 || right < 0) return;
	// Adjacent rows can put another horizontal rule in the search window.
	// Its vertical sides must continue inward to belong to this checkbox.
	const sides = (start: number, end: number) =>
		coverage(true, left, start, end, band * 2) >= 0.8 &&
		coverage(true, right, start, end, band * 2) >= 0.8;
	const top = edge(
		false,
		box.y,
		left + (right - left) * 0.25,
		left + (right - left) * 0.75,
		box.height * 0.25,
		(p) => sides(p + band + 1, p + box.height * 0.25)
	);
	const bottom = edge(
		false,
		box.y + box.height - 1,
		left + (right - left) * 0.25,
		left + (right - left) * 0.75,
		box.height * 0.25,
		(p) => sides(p - box.height * 0.25, p - band)
	);
	if (
		top < 0 ||
		bottom < 0 ||
		right - left < box.width * 0.6 ||
		bottom - top < box.height * 0.6 ||
		right - left > box.width * 1.4 ||
		bottom - top > box.height * 1.4
	)
		return;
	const inset = Math.ceil(Math.min(right - left, bottom - top) * 0.2) + band;
	const inner = {
		x: left + inset,
		y: top + inset,
		width: right - left - inset * 2,
		height: bottom - top - inset * 2
	};
	if (inner.width < 6 || inner.height < 6) return;
	return inner;
}

function patch(ink: Uint8Array, width: number, box: Region) {
	const result = new Uint8Array(32 * 32);
	for (let y = 0; y < 32; y++)
		for (let x = 0; x < 32; x++)
			result[y * 32 + x] =
				ink[
					(box.y + Math.round((y / 31) * (box.height - 1))) * width +
						box.x +
						Math.round((x / 31) * (box.width - 1))
				];
	return result;
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
	box: Region
): Check {
	const blankBox = frame(reference, width, height, box),
		scanBox = frame(actual, width, height, box);
	if (!blankBox || !scanBox)
		return {
			label,
			verdict: 'review',
			detail:
				'Checkbox outline could not be aligned reliably. Upload a clearer image or ask staff to review.'
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
