import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file, deps = {}) {
	const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	});
	const exports = {};
	new Function('require', 'exports', outputText)((name) => deps[name] ?? require(name), exports);
	return exports;
}
const core = load('src/lib/clearance/clearance.ts');
const def = load('src/lib/clearance/definition.ts', { './clearance': core });
const { suggestOfficeRows } = load('src/lib/clearance/office-suggestions.ts', {
	'./checkbox': load('src/lib/clearance/checkbox.ts', { './clearance': core })
});
const width = 1000,
	height = 800;
const word = (text, x0, y0, x1, y1) => ({ text, bbox: { x0, y0, x1, y1 } });
const line = (...words) => ({
	text: words.map((w) => w.text).join(' '),
	words,
	confidence: 95,
	bbox: {
		x0: Math.min(...words.map((w) => w.bbox.x0)),
		y0: Math.min(...words.map((w) => w.bbox.y0)),
		x1: Math.max(...words.map((w) => w.bbox.x1)),
		y1: Math.max(...words.map((w) => w.bbox.y1))
	}
});
function rule(ink, x0, y0, x1, y1) {
	for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ink[y * width + x] = 1;
}
function square(ink, x, y, size = 30) {
	rule(ink, x, y, x + size, y);
	rule(ink, x, y + size, x + size, y + size);
	rule(ink, x, y, x, y + size);
	rule(ink, x + size, y, x + size, y + size);
}
function fixture({
	choices = true,
	signature = true,
	reverse = false,
	names = ['Library', 'Registrar']
} = {}) {
	const ink = new Uint8Array(width * height);
	const lines = [
		line(word('Department/Offices', 60, 180, 230, 200)),
		line(word('Signature/Stamp', 640, 180, 810, 200))
	];
	for (const [i, name] of names.entries()) {
		const y = 240 + i * 80;
		square(ink, 260, y);
		square(ink, 430, y + 2);
		lines.push(line(word(name, 60, y + 4, 180, y + 22)));
		if (choices) {
			lines.push(
				line(
					word(reverse ? 'Not' : 'Cleared', 305, y + 5, reverse ? 335 : 385, y + 23),
					...(reverse ? [word('Cleared', 340, y + 5, 420, y + 23)] : [])
				)
			);
			lines.push(
				line(
					...(reverse
						? [word('Cleared', 475, y + 5, 550, y + 23)]
						: [word('Not', 475, y + 5, 505, y + 23), word('Cleared', 510, y + 5, 585, y + 23)])
				)
			);
		}
		if (signature) rule(ink, 640, y + 35, 840, y + 35);
	}
	return { ink, lines };
}

test('office schema validates bounded boxes, unique offices and absence of submission values', () => {
	const box = { x: 0.1, y: 0.3, width: 0.1, height: 0.05 };
	const row = {
		id: crypto.randomUUID(),
		label: 'Library',
		office: box,
		cleared: box,
		signature: box
	};
	assert(def.officeRowsSchema.safeParse([]).success);
	assert(def.officeRowsSchema.safeParse([row]).success);
	assert(def.officeRowsSchema.safeParse([{ id: row.id, label: row.label, office: box }]).success);
	for (const bad of [
		[{ ...row, signature: { ...box, x: 0.99 } }],
		[{ ...row, cleared: { ...box, width: 0 } }],
		[{ ...row, signed: true }],
		[{ ...row, label: '' }],
		[{ ...row, office: undefined }],
		[row, { ...row, id: crypto.randomUUID(), label: 'library' }],
		[row, { ...row, label: 'Registrar' }],
		Array.from({ length: 31 }, (_, i) => ({
			...row,
			id: crypto.randomUUID(),
			label: `Office ${i}`
		}))
	])
		assert(!def.officeRowsSchema.safeParse(bad).success);
});

test('links office names, cleared checkbox and signature underlines with vertical tolerance', () => {
	const f = fixture();
	const { rows, hints } = suggestOfficeRows(f.lines, width, height, f.ink);
	assert.deepEqual(
		rows.map((r) => r.label),
		['Library', 'Registrar']
	);
	assert(def.officeRowsSchema.safeParse(rows).success);
	for (const row of rows) {
		assert(row.cleared.x > 0.25 && row.cleared.x < 0.27);
		assert.equal(row.notCleared, undefined);
		assert(row.signature.x >= 0.64 && row.signature.x + row.signature.width <= 0.841);
		assert(row.signature.y < row.cleared.y + row.cleared.height);
	}
	assert.equal(hints.length, 1);
});

test('OCR fragments on checkbox outlines cannot become office names for the next checkbox', () => {
	const f = fixture();
	for (const y of [240, 320]) f.lines.push(line(word('[od', 257, y - 2, 294, y + 34)));
	const result = suggestOfficeRows(f.lines, width, height, f.ink);
	assert.deepEqual(
		result.rows.map((row) => row.label),
		['Library', 'Registrar']
	);
	for (const row of result.rows) {
		assert(row.office.x + row.office.width < row.cleared.x);
		assert(row.signature.x >= 0.64);
	}
});

test('choice captions determine roles even when columns are reversed or OCR words arrive out of order', () => {
	const f = fixture({ reverse: true });
	f.lines.reverse();
	const result = suggestOfficeRows(f.lines, width, height, f.ink);
	assert.equal(result.rows.length, 2);
	for (const row of result.rows) {
		assert(row.cleared.x > 0.42 && row.cleared.x < 0.44);
		assert.equal(row.notCleared, undefined);
	}
});

test('missing choices and signature rules stay unassigned for manual review', () => {
	const f = fixture({ choices: false, signature: false });
	const result = suggestOfficeRows(f.lines, width, height, f.ink);
	assert.equal(result.rows.length, 2);
	for (const row of result.rows) {
		assert.equal(row.cleared, undefined);
		assert.equal(row.notCleared, undefined);
		assert.equal(row.signature, undefined);
	}
	assert(result.hints.some((h) => h.includes('not identified')));
	assert(result.hints.some((h) => h.includes('not located')));
});

test('table headings and cell borders identify checkbox roles and signature column', () => {
	const f = fixture({ choices: false, signature: false });
	f.lines.push(
		line(word('Cleared', 240, 180, 310, 198)),
		line(word('Not', 400, 180, 430, 198), word('Cleared', 435, 180, 510, 198))
	);
	for (const x of [600, 870]) rule(f.ink, x, 210, x, 390);
	for (const y of [275, 355]) rule(f.ink, 30, y, 950, y);
	const result = suggestOfficeRows(f.lines, width, height, f.ink);
	assert.equal(result.rows.length, 2);
	for (const row of result.rows) {
		assert(row.cleared && row.signature);
		assert(row.signature.x > 0.6 && row.signature.x + row.signature.width < 0.87);
	}
});

test('two side-by-side tables keep offices and signature spaces separate', () => {
	const ink = new Uint8Array(width * height),
		lines = [];
	for (const offset of [0, 500]) {
		lines.push(
			line(word('Offices', offset + 20, 180, offset + 100, 196)),
			line(word('Signature', offset + 320, 180, offset + 420, 196))
		);
		lines.push(line(word(offset ? 'Cashier' : 'Clinic', offset + 20, 244, offset + 100, 260)));
		for (const [x, text] of [
			[160, 'Cleared'],
			[250, 'Not Cleared']
		])
			lines.push(line(word(text, offset + x, 244, offset + x + 60, 260)));
		square(ink, offset + 130, 240, 24);
		square(ink, offset + 220, 240, 24);
		rule(ink, offset + 320, 270, offset + 420, 270);
	}
	const result = suggestOfficeRows(lines, width, height, ink);
	assert.deepEqual(
		result.rows.map((r) => r.label),
		['Clinic', 'Cashier']
	);
	assert(result.rows[0].signature.x + result.rows[0].signature.width < 0.5);
	assert(result.rows[1].signature.x > 0.8);
});

test('wrapped office names are grouped without excluding Student Affairs', () => {
	const f = fixture();
	f.lines[2] = line(word('Student', 60, 238, 140, 254));
	f.lines.push(line(word('Affairs', 60, 257, 140, 273)));
	const result = suggestOfficeRows(f.lines, width, height, f.ink);
	assert.equal(result.rows[0].label, 'Student Affairs');
});

test('one checkbox per office needs no choice caption; explicitly negative checkbox never becomes cleared', () => {
	for (const negative of [false, true]) {
		const f = fixture({ choices: negative, reverse: true });
		for (const y of [240, 320])
			for (let dy = 0; dy <= 34; dy++)
				f.ink.fill(0, (y + dy) * width + 428, (y + dy) * width + 465);
		const result = suggestOfficeRows(f.lines, width, height, f.ink);
		assert.equal(result.rows.length, 2);
		for (const row of result.rows) {
			if (negative) assert.equal(row.cleared, undefined);
			else assert(row.cleared && row.signature);
		}
	}
});

test('empty pages, isolated squares, text-sized square glyphs and bad OCR do not produce offices', () => {
	const ink = new Uint8Array(width * height);
	assert.equal(suggestOfficeRows([], width, height, ink).rows.length, 0);
	square(ink, 260, 240);
	assert.equal(
		suggestOfficeRows([line(word('Unrelated text', 60, 244, 180, 262))], width, height, ink).rows
			.length,
		0
	);
	const f = fixture();
	f.ink.fill(0);
	square(f.ink, 260, 240, 15);
	assert.equal(suggestOfficeRows(f.lines, width, height, f.ink).rows.length, 0);
	assert.equal(
		suggestOfficeRows(
			f.lines.map((l) => ({ ...l, confidence: 10 })),
			width,
			height,
			ink
		).rows.length,
		0
	);
	assert.throws(() => suggestOfficeRows([], width, height, new Uint8Array(10)), /Invalid/);
});

test('a missed Cleared caption uses consistent peer columns without choosing Not Cleared', () => {
	for (const reverse of [false, true]) {
		const f = fixture({ names: ['Library', 'Adviser', 'Registrar'], reverse });
		const x = reverse ? 475 : 305;
		const caption = f.lines.find((l) => l.words[0].bbox.x0 === x && l.bbox.y0 === 325);
		caption.confidence = 20;
		const result = suggestOfficeRows(f.lines, width, height, f.ink);
		const row = result.rows.find((r) => r.label === 'Adviser');
		assert(row?.cleared, 'Visible Adviser checkbox stays assignable when its caption is lost.');
		assert(Math.abs(row.cleared.x - (reverse ? 0.43 : 0.26)) < 0.01);
	}
});

test('local frame search recovers disconnected or text-connected checkbox outlines in the confirmed column', () => {
	for (const damage of ['gaps', 'touching text']) {
		const f = fixture({ names: ['Library', 'Adviser', 'Registrar'] });
		if (damage === 'gaps') {
			for (const [x, y] of [
				[274, 320],
				[274, 350],
				[260, 334],
				[290, 334]
			]) {
				for (let dy = 0; dy < 2; dy++)
					for (let dx = 0; dx < 2; dx++) f.ink[(y + dy) * width + x + dx] = 0;
			}
		} else rule(f.ink, 290, 334, 345, 335);
		const result = suggestOfficeRows(f.lines, width, height, f.ink);
		const row = result.rows.find((r) => r.label === 'Adviser');
		assert(row?.cleared, damage);
		assert(Math.abs(row.cleared.x - 0.26) < 0.015);
		assert(Math.abs(row.cleared.y - 0.4) < 0.015);
	}
});

test('peer alignment cannot invent an absent checkbox or use the negative choice', () => {
	const f = fixture({ names: ['Library', 'Adviser', 'Registrar'] });
	for (let y = 318; y <= 352; y++) f.ink.fill(0, y * width + 258, y * width + 293);
	const result = suggestOfficeRows(f.lines, width, height, f.ink);
	assert.equal(result.rows.find((r) => r.label === 'Adviser')?.cleared, undefined);
	assert(result.hints.some((h) => h.includes('Adviser: cleared checkbox was not identified')));
});

test('peer consensus cannot override an explicitly negative checkbox caption', () => {
	const f = fixture({ names: ['Library', 'Adviser', 'Registrar'] });
	const caption = f.lines.find((l) => l.words[0].bbox.x0 === 305 && l.bbox.y0 === 325);
	caption.text = 'Not Cleared';
	caption.words[0].text = 'Not Cleared';
	const result = suggestOfficeRows(f.lines, width, height, f.ink);
	assert.equal(result.rows.find((r) => r.label === 'Adviser')?.cleared, undefined);
});
