import assert from 'node:assert/strict';
import test from 'node:test';
import { checkCheckbox } from '../src/lib/clearance/checkbox';
import { homography, project, UNIT_CORNERS, type Corners } from '../src/lib/clearance/clearance';

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

test('nearby translated and skewed boxes are deskewed without treating frames as ticks', () => {
	for (const [dx, dy, skew] of [
		[-20, 18, -10],
		[20, -18, 10]
	]) {
		const empty = outline(dx, dy, skew);
		assert.equal(check(empty).verdict, 'fail', `empty ${dx},${dy},${skew}`);
		const marked = empty.slice();
		const point = (u: number, v: number) => ({
			x: box.x + dx + u * 63 + skew * v,
			y: box.y + dy + v * 63
		});
		const a = point(0.25, 0.5),
			b = point(0.45, 0.72),
			c = point(0.8, 0.22);
		line(marked, a.x, a.y, b.x, b.y);
		line(marked, b.x, b.y, c.x, c.y);
		assert.equal(check(marked).verdict, 'pass', `tick ${dx},${dy},${skew}`);
	}
});

test('independent corner shifts follow four slanted printed edges before reading the interior', () => {
	const points: Corners = [
		{ x: 68, y: 64 },
		{ x: 134, y: 74 },
		{ x: 124, y: 141 },
		{ x: 57, y: 128 }
	];
	const mask = new Uint8Array(width * height);
	for (let i = 0; i < 4; i++)
		line(mask, points[i].x, points[i].y, points[(i + 1) % 4].x, points[(i + 1) % 4].y);
	assert.equal(check(mask).verdict, 'fail');
	const matrix = homography(UNIT_CORNERS, points);
	const a = project(matrix, { x: 0.25, y: 0.5 }),
		b = project(matrix, { x: 0.45, y: 0.72 }),
		c = project(matrix, { x: 0.8, y: 0.22 });
	line(mask, a.x, a.y, b.x, b.y);
	line(mask, b.x, b.y, c.x, c.y);
	assert.equal(check(mask).verdict, 'pass');
});

test('a tick in another column or office cannot replace an empty or missing cleared checkbox', () => {
	for (const [dx, dy] of [
		[90, 0],
		[0, 80]
	]) {
		const neighbor = outline(dx, dy);
		// Fill the other checkbox while leaving the expected one empty.
		line(neighbor, box.x + dx + 18, box.y + dy + 24, box.x + dx + 35, box.y + dy + 44);
		line(neighbor, box.x + dx + 35, box.y + dy + 44, box.x + dx + 49, box.y + dy + 15);
		const actual = Uint8Array.from(outline(), (pixel, i) => pixel | neighbor[i]);
		assert.equal(check(actual).verdict, 'fail');
		assert.notEqual(check(neighbor).verdict, 'pass');
	}
	assert.equal(check(outline(40, 40)).verdict, 'review', 'Distant frames require review.');
});

test('nearby search cannot move the frame center across another configured office boundary', () => {
	const actual = outline(0, 24);
	line(actual, 80, 114, 95, 138);
	line(actual, 95, 138, 110, 105);
	assert.equal(check(actual).verdict, 'pass');
	const peers = [box, { ...box, y: box.y + 40 }];
	assert.equal(
		checkCheckbox('Office', outline(), actual, width, height, box, peers).verdict,
		'review'
	);
});
