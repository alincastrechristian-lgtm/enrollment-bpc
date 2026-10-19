import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(file, dependencies = {}) {
	const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((id) => dependencies[id], exports);
	return exports;
}
const core = load('src/lib/clearance/clearance.ts');
const { findBorder } = load('src/lib/clearance/border.ts', { './clearance': core });
const width = 400,
	height = 320;
function line(image, a, b, thickness = 2) {
	const length = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
	for (let n = 0; n <= length; n++) {
		const x = Math.round(a.x + ((b.x - a.x) * n) / length),
			y = Math.round(a.y + ((b.y - a.y) * n) / length);
		for (let dy = -thickness; dy <= thickness; dy++)
			for (let dx = -thickness; dx <= thickness; dx++)
				if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height)
					image[(y + dy) * width + x + dx] = 30;
	}
}
function form(points, sides = 4) {
	const image = new Uint8Array(width * height).fill(230);
	for (let i = 0; i < sides; i++) line(image, points[i], points[(i + 1) % 4]);
	// Interior checkboxes must not be selected as the enclosing form.
	for (const x of [120, 180])
		for (const y of [100, 140, 180]) {
			const box = [
				{ x, y },
				{ x: x + 18, y },
				{ x: x + 18, y: y + 18 },
				{ x, y: y + 18 }
			];
			for (let i = 0; i < 4; i++) line(image, box[i], box[(i + 1) % 4], 1);
		}
	return image;
}
for (const [label, points] of [
	[
		'upright',
		[
			{ x: 35, y: 25 },
			{ x: 365, y: 25 },
			{ x: 365, y: 295 },
			{ x: 35, y: 295 }
		]
	],
	[
		'perspective',
		[
			{ x: 42, y: 30 },
			{ x: 350, y: 15 },
			{ x: 370, y: 280 },
			{ x: 30, y: 300 }
		]
	]
])
	test(`${label} printed border is located outside interior checkboxes`, () => {
		const found = findBorder(form(points), width, height);
		assert.ok(found);
		assert.ok(core.validCorners(found));
		for (let i = 0; i < 4; i++) {
			assert.ok(Math.abs(found[i].x * (width - 1) - points[i].x) < 8);
			assert.ok(Math.abs(found[i].y * (height - 1) - points[i].y) < 8);
		}
	});
test('blank, incomplete and small boxes require manual corners', () => {
	assert.equal(findBorder(new Uint8Array(width * height).fill(220), width, height), null);
	const points = [
		{ x: 35, y: 25 },
		{ x: 365, y: 25 },
		{ x: 365, y: 295 },
		{ x: 35, y: 295 }
	];
	assert.equal(findBorder(form(points, 3), width, height), null);
	assert.equal(
		findBorder(
			form([
				{ x: 140, y: 120 },
				{ x: 200, y: 120 },
				{ x: 200, y: 170 },
				{ x: 140, y: 170 }
			]),
			width,
			height
		),
		null
	);
});

test('unstructured image noise is not accepted as a form border', () => {
	let seed = 12345;
	const image = Uint8Array.from({ length: width * height }, () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed >>> 24;
	});
	assert.equal(findBorder(image, width, height), null);
});
