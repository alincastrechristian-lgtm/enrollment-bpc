import {
	evaluatePrinted,
	overall,
	PRINTED_REGIONS,
	ROW_REGIONS,
	WIDTH,
	HEIGHT,
	type Check,
	type Expected,
	type PrintedReadings,
	type Region
} from './clearance';

export type TemplateApproval = { reference: HTMLCanvasElement };
export type TemplateResult = { checks: Check[]; verdict: ReturnType<typeof overall> };

// This lab supports the supplied BPC five-department layout. Writing areas are excluded.
export const LAYOUT_AREAS: { label: string; boxes: { outer: Region; exclude?: Region }[] }[] = [
	{ label: 'School position', boxes: [{ outer: PRINTED_REGIONS.school }] },
	{ label: 'Title position', boxes: [{ outer: PRINTED_REGIONS.formTitle }] },
	{ label: 'Department positions', boxes: [{ outer: PRINTED_REGIONS.departments }] },
	{
		label: 'Checkbox outlines',
		boxes: ROW_REGIONS.flatMap((row) => [row.cleared, row.notCleared]).map((box) => ({
			outer: { x: box.x - 12, y: box.y - 12, width: box.width + 24, height: box.height + 24 },
			exclude: box
		}))
	}
];

export function comparePrintedLayout(actual: Uint8Array, reference: Uint8Array): Check[] {
	if (actual.length !== WIDTH * HEIGHT || reference.length !== actual.length)
		throw new Error('Align both images before comparing template layout.');
	const inside = (x: number, y: number, box: Region) =>
		x >= box.x && y >= box.y && x < box.x + box.width && y < box.y + box.height;
	const nearby = (mask: Uint8Array, x: number, y: number) => {
		for (let dy = -4; dy <= 4; dy++)
			for (let dx = -4; dx <= 4; dx++)
				if (
					x + dx >= 0 &&
					y + dy >= 0 &&
					x + dx < WIDTH &&
					y + dy < HEIGHT &&
					mask[(y + dy) * WIDTH + x + dx]
				)
					return true;
		return false;
	};
	return LAYOUT_AREAS.map(({ label, boxes }) => {
		let ink = 0,
			matched = 0,
			pixels = 0,
			incomplete = false;
		for (const { outer, exclude } of boxes) {
			let referenceInk = 0,
				actualInk = 0;
			for (let y = Math.max(0, outer.y); y < Math.min(HEIGHT, outer.y + outer.height); y++) {
				for (let x = Math.max(0, outer.x); x < Math.min(WIDTH, outer.x + outer.width); x++) {
					if (exclude && inside(x, y, exclude)) continue;
					pixels++;
					const i = y * WIDTH + x;
					if (reference[i]) {
						referenceInk++;
						if (nearby(actual, x, y)) matched++;
					}
					if (actual[i]) {
						actualInk++;
						if (nearby(reference, x, y)) matched++;
					}
				}
			}
			ink += referenceInk + actualInk;
			if (referenceInk < 12 || actualInk < 12) incomplete = true;
		}
		if (!ink || incomplete)
			return {
				label,
				verdict: 'review' as const,
				detail: 'Printed structure missing or too faint. Check both outlines and image quality.'
			};
		const score = matched / ink;
		return {
			label,
			verdict:
				ink / (2 * pixels) > 0.45
					? ('review' as const)
					: score >= 0.65
						? ('pass' as const)
						: score < 0.3
							? ('fail' as const)
							: ('review' as const),
			detail: `${Math.round(score * 100)}% printed-ink overlap after alignment (4-pixel tolerance). Handwriting and checkbox interiors excluded.`
		};
	});
}

export function evaluateTemplate(
	reference: PrintedReadings,
	submitted: PrintedReadings,
	layout: Check[],
	term: Pick<Expected, 'semester' | 'schoolYear'>
): TemplateResult {
	const checks = [
		...evaluatePrinted(reference, term).map((check) => ({
			...check,
			label: `Template: ${check.label}`
		})),
		...evaluatePrinted(submitted, term).map((check) => ({
			...check,
			label: `Upload: ${check.label}`
		})),
		...layout
	];
	// Layout evidence is required, even when printed wording matches.
	if (layout.length !== LAYOUT_AREAS.length)
		checks.push({
			label: 'Layout evidence',
			verdict: 'review',
			detail: 'Compare all printed layout areas before continuing.'
		});
	return { checks, verdict: overall(checks) };
}
