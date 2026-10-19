import assert from 'node:assert/strict';
import test from 'node:test';
import { checkCheckbox } from '../src/lib/clearance/checkbox';

const width = 320,
	height = 240;
const box = { x: 60, y: 70, width: 64, height: 64 };
function line(mask: Uint8Array, x0: number, y0: number, x1: number, y1: number) {
	const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
	for (let step = 0; step <= steps; step++) {
		const x = Math.round(x0 + ((x1 - x0) * step) / Math.max(1, steps));
		const y = Math.round(y0 + ((y1 - y0) * step) / Math.max(1, steps));
		for (let dy = 0; dy <= 1; dy++)
			for (let dx = 0; dx <= 1; dx++) mask[(y + dy) * width + x + dx] = 1;
	}
}
function outline(dx = 0, dy = 0, skew = 0) {
	const mask = new Uint8Array(width * height);
	line(mask, box.x + dx, box.y + dy, box.x + dx + 63, box.y + dy);
	line(mask, box.x + dx, box.y + dy, box.x + dx + skew, box.y + dy + 63);
	line(mask, box.x + dx + 63, box.y + dy, box.x + dx + 63 + skew, box.y + dy + 63);
	line(mask, box.x + dx + skew, box.y + dy + 63, box.x + dx + 63 + skew, box.y + dy + 63);
	return mask;
}
const check = (actual: Uint8Array, reference = outline()) =>
	checkCheckbox('Office', reference, actual, width, height, box);

test('empty checkbox frames never count as marks across local shifts and skew', () => {
	for (const dx of [-10, 0, 10])
		for (const dy of [-10, 0, 10]) {
			assert.equal(check(outline(dx, dy, 2)).verdict, 'fail', `shift ${dx},${dy}`);
		}
});

test('ticks, crosses and filled interiors pass after local alignment', () => {
	for (const kind of ['tick', 'cross', 'filled']) {
		const actual = outline(9, -7, 2);
		line(actual, 86, 90, 97, 106);
		line(actual, 97, 106, 115, 79);
		if (kind === 'cross') line(actual, 88, 79, 111, 107);
		if (kind === 'filled')
			for (let y = 80; y < 115; y++) for (let x = 82; x < 117; x++) actual[y * width + x] = 1;
		assert.equal(check(actual).verdict, 'pass', kind);
	}
});

test('nearby office-row rules cannot become an interior mark', () => {
	const actual = outline(0, 9);
	line(actual, box.x, box.y - 9, box.x + 63, box.y - 9);
	assert.equal(check(actual).verdict, 'fail');
});

test('missing frames, isolated specks and marked references cannot approve a checkbox', () => {
	const missing = new Uint8Array(width * height);
	line(missing, 80, 90, 105, 110);
	assert.equal(check(missing).verdict, 'review');
	const specks = outline();
	for (let y = 90; y < 115; y += 7) for (let x = 80; x < 110; x += 7) specks[y * width + x] = 1;
	assert.equal(check(specks).verdict, 'review');
	const marked = outline();
	line(marked, 80, 90, 110, 110);
	assert.equal(check(marked, marked).verdict, 'review');
});
