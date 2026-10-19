import assert from 'node:assert/strict';
import test from 'node:test';
import { checkIdentityPresence } from '../src/lib/clearance/identity-presence';
import type { PersonalFieldArea } from '../src/lib/clearance/definition';

const width = 600,
	height = 240;
const fields: PersonalFieldArea[] = [
	{ id: 'name', field: 'studentName', box: { x: 0.02, y: 0.05, width: 0.45, height: 0.35 } },
	{ id: 'number', field: 'studentNumber', box: { x: 0.52, y: 0.05, width: 0.45, height: 0.35 } }
];
function line(image: Uint8Array, x0: number, y0: number, x1: number, y1: number, thickness = 1) {
	const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
	for (let n = 0; n <= steps; n++) {
		const x = Math.round(x0 + ((x1 - x0) * n) / steps),
			y = Math.round(y0 + ((y1 - y0) * n) / steps);
		for (let dy = -thickness; dy <= thickness; dy++)
			for (let dx = -thickness; dx <= thickness; dx++)
				if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height)
					image[(y + dy) * width + x + dx] = 20;
	}
}
function reference(shift = 0) {
	const image = new Uint8Array(width * height).fill(245);
	for (const x of [15, 315]) line(image, x, 80 + shift, x + 260, 80 + shift);
	// Fixed printed MA- prefix, above the underline.
	for (const [a, b, c, d] of [
		[320, 62, 320, 40],
		[320, 40, 328, 50],
		[328, 50, 336, 40],
		[336, 40, 336, 62],
		[342, 62, 350, 40],
		[350, 40, 358, 62],
		[345, 53, 355, 53],
		[363, 52, 371, 52]
	])
		line(image, a + shift, b + shift, c + shift, d + shift);
	return image;
}
function addWriting(image: Uint8Array, start: number) {
	for (let x = start; x < start + 140; x += 14) {
		line(image, x, 61, x + 7, 32);
		line(image, x + 7, 32, x + 13, 60);
	}
}
const check = (scan: Uint8Array) => checkIdentityPresence(reference(), scan, width, height, fields);

test('blank fields, fixed MA prefix and underlines never count as personal writing', () => {
	for (const scan of [reference(), reference(1)]) {
		const result = check(scan);
		assert.equal(result.name.verdict, 'fail');
		assert.equal(result.studentNumber.verdict, 'fail');
	}
});

test('both personal fields need writing; disconnected specks and new straight/slanted rules cannot fill them', () => {
	for (const field of ['name', 'studentNumber'] as const) {
		const scan = reference();
		addWriting(scan, field === 'name' ? 40 : 390);
		const result = check(scan);
		assert.equal(result[field].verdict, 'pass');
		assert.equal(result[field === 'name' ? 'studentNumber' : 'name'].verdict, 'fail');
	}
	const noise = reference();
	for (let x = 25; x < width - 25; x += 17) noise[25 * width + x] = 0;
	line(noise, 20, 50, 270, 50);
	line(noise, 380, 48, 570, 54);
	assert.equal(check(noise).name.verdict, 'fail');
	assert.equal(check(noise).studentNumber.verdict, 'fail');
});

test('added handwriting survives removal of printed rules and labels; presence is not an identity match', () => {
	const scan = reference();
	addWriting(scan, 40);
	addWriting(scan, 390);
	const result = check(scan);
	assert.equal(result.name.verdict, 'pass');
	assert.equal(result.studentNumber.verdict, 'pass');
	assert.match(result.name.detail, /identity checks are still required/);
	assert.throws(() => checkIdentityPresence(new Uint8Array(1), scan, width, height, fields));
});
