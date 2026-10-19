import type { Check } from './clearance';
import type { PersonalFieldArea } from './definition';
import { threshold } from './report';

type Component = { pixels: number[]; left: number; top: number; right: number; bottom: number };
function components(mask: Uint8Array, width: number, height: number): Component[] {
	const remaining = mask.slice(),
		result: Component[] = [];
	for (let start = 0; start < remaining.length; start++) {
		if (!remaining[start]) continue;
		const pixels = [start];
		remaining[start] = 0;
		let left = width,
			right = 0,
			top = height,
			bottom = 0;
		for (let i = 0; i < pixels.length; i++) {
			const index = pixels[i],
				x = index % width,
				y = Math.floor(index / width);
			left = Math.min(left, x);
			right = Math.max(right, x);
			top = Math.min(top, y);
			bottom = Math.max(bottom, y);
			for (let dy = -1; dy <= 1; dy++)
				for (let dx = -1; dx <= 1; dx++) {
					if ((!dx && !dy) || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height)
						continue;
					const next = (y + dy) * width + x + dx;
					if (remaining[next]) {
						remaining[next] = 0;
						pixels.push(next);
					}
				}
		}
		result.push({ pixels, left, right, top, bottom });
	}
	return result;
}

function removeRules(mask: Uint8Array, width: number, height: number) {
	const rules = new Uint8Array(mask.length);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width;) {
			if (!mask[y * width + x]) {
				x++;
				continue;
			}
			const start = x;
			while (x < width && mask[y * width + x]) x++;
			if (x - start >= Math.max(12, width * 0.4)) {
				for (let row = Math.max(0, y - 2); row <= Math.min(height - 1, y + 2); row++)
					rules.fill(1, row * width + start, row * width + x);
			}
		}
	}
	for (let i = 0; i < mask.length; i++) if (rules[i]) mask[i] = 0;
}

// Presence of additional strokes is a prerequisite, not proof of readable text or identity.
export function checkIdentityPresence(
	blank: Uint8Array,
	uploaded: Uint8Array,
	width: number,
	height: number,
	fields: PersonalFieldArea[]
): Record<'name' | 'studentNumber', Check> {
	if (blank.length !== width * height || uploaded.length !== blank.length)
		throw new Error('Invalid identity image.');
	const reference = threshold(blank, width, height),
		scan = threshold(uploaded, width, height);
	function check(kind: 'studentName' | 'studentNumber'): Check {
		const label =
			kind === 'studentName' ? 'Student name: writing present' : 'Student number: writing present';
		const box = fields.find((field) => field.field === kind)?.box;
		if (!box)
			return {
				label,
				verdict: 'fail',
				detail: 'The writing area has not been configured. Contact the Registrar.'
			};
		const left = Math.max(0, Math.floor(box.x * width)),
			top = Math.max(0, Math.floor(box.y * height));
		const w = Math.min(width - left, Math.ceil(box.width * width)),
			h = Math.min(height - top, Math.ceil(box.height * height));
		const printed = new Uint8Array(w * h),
			writing = new Uint8Array(w * h);
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				printed[y * w + x] = reference[(top + y) * width + left + x];
				writing[y * w + x] = scan[(top + y) * width + left + x];
			}
		removeRules(printed, w, h);
		removeRules(writing, w, h);
		// Mask complete printed glyph boxes, including holes and a small alignment margin.
		// Underlines are removed first so touching labels cannot mask the whole writing line.
		for (const c of components(printed, w, h)) {
			for (let y = Math.max(0, c.top - 3); y <= Math.min(h - 1, c.bottom + 3); y++)
				writing.fill(0, y * w + Math.max(0, c.left - 3), y * w + Math.min(w, c.right + 4));
		}
		let strokes = 0;
		for (const c of components(writing, w, h)) {
			const cw = c.right - c.left + 1,
				ch = c.bottom - c.top + 1;
			// Ignore isolated specks, remaining long rules, and solid scanner artifacts.
			if (
				cw >= 4 &&
				ch >= 4 &&
				cw / ch < 15 &&
				c.pixels.length >= 8 &&
				c.pixels.length / (cw * ch) < 0.9
			)
				strokes += c.pixels.length;
		}
		const present = strokes >= Math.max(20, w * h * 0.001);
		return {
			label,
			verdict: present ? 'pass' : 'fail',
			detail: present
				? 'Additional writing strokes detected. Recognition and identity checks are still required.'
				: `No clear added writing detected in this field. Fill it in or upload a clearer photo. Printed labels${kind === 'studentNumber' ? ', MA-' : ''} and underlines do not count.`
		};
	}
	return { name: check('studentName'), studentNumber: check('studentNumber') };
}
