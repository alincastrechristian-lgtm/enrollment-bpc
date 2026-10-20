import sharp from 'sharp';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import {
	homography,
	project,
	UNIT_CORNERS,
	overall,
	WIDTH,
	HEIGHT,
	type Corners,
	type Check
} from '#lib/clearance/clearance.js';
import {
	checkAreaText,
	printedSearchBox,
	compareVisual,
	type TemplateDefinition,
	type ClearanceTerm,
	hasIdentityAreas,
	type Box
} from '#lib/clearance/definition.js';
import { checkOfficeMarks, type ClearanceReport } from '#lib/clearance/report.js';
import { error } from '@sveltejs/kit';
import { enhancePrintedContrast, printedAreaReading } from '#lib/clearance/printed.js';
import { checkIdentityPresence } from '#lib/clearance/identity-presence.js';

type Image = { data: Uint8Array; width: number; height: number };
let running = false;
export async function decodeClearance(bytes: Buffer, contentType?: string): Promise<Image> {
	const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' });
	const metadata = await image.metadata();
	const formats: Record<string, string> = {
		jpeg: 'image/jpeg',
		png: 'image/png',
		webp: 'image/webp'
	};
	if (
		!metadata.format ||
		!formats[metadata.format] ||
		(contentType && formats[metadata.format] !== contentType) ||
		(metadata.pages ?? 1) > 1
	)
		error(400, 'Choose a single JPG, PNG or WebP image with matching file contents.');
	const { data, info } = await image
		.autoOrient()
		.flatten({ background: '#fff' })
		.resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
		.greyscale()
		.raw()
		.toBuffer({ resolveWithObject: true });
	if (info.width < 500 || info.height < 400)
		error(400, 'Use a clearance image at least 500 × 400 pixels.');
	return { data, width: info.width, height: info.height };
}

function sample(image: Image, corners: Corners, box: Box, width: number, height: number): Image {
	const matrix = homography(UNIT_CORNERS, corners),
		data = new Uint8Array(width * height);
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const point = project(matrix, {
				x: box.x + (x / Math.max(1, width - 1)) * box.width,
				y: box.y + (y / Math.max(1, height - 1)) * box.height
			});
			const sx = Math.max(0, Math.min(image.width - 1, Math.round(point.x * (image.width - 1))));
			const sy = Math.max(0, Math.min(image.height - 1, Math.round(point.y * (image.height - 1))));
			data[y * width + x] = image.data[sy * image.width + sx];
		}
	return { data, width, height };
}

export async function clearanceIdentityCrops(
	image: Image,
	corners: Corners,
	definition: TemplateDefinition
) {
	if (!hasIdentityAreas(definition))
		error(
			503,
			'The Registrar must mark the student name and student number areas in the clearance template.'
		);
	const crops = {} as Record<'name' | 'studentNumber', string>;
	for (const [field, kind] of [
		['name', 'studentName'],
		['studentNumber', 'studentNumber']
	] as const) {
		const box = definition.personalFields!.find((area) => area.field === kind)!.box;
		const patch = sample(
			image,
			corners,
			box,
			Math.max(100, Math.round(box.width * WIDTH * 2)),
			Math.max(40, Math.round(box.height * HEIGHT * 2))
		);
		crops[field] = (
			await sharp(patch.data, { raw: { width: patch.width, height: patch.height, channels: 1 } })
				.png()
				.toBuffer()
		).toString('base64');
	}
	return crops;
}

export async function checkClearance(
	referenceBytes: Buffer,
	upload: Image,
	corners: Corners,
	definition: TemplateDefinition,
	term: ClearanceTerm,
	personalInfoVerificationEnabled = true
): Promise<ClearanceReport> {
	if (running) error(429, 'Another clearance is being checked. Try again shortly.');
	running = true;
	let worker: Worker | undefined;
	let expired = false;
	let stop: ReturnType<typeof setTimeout> | undefined;
	try {
		const reference = await decodeClearance(referenceBytes);
		const edge = (a: number, b: number) =>
			Math.hypot(
				(definition.corners[a].x - definition.corners[b].x) * reference.width,
				(definition.corners[a].y - definition.corners[b].y) * reference.height
			);
		const ratio = (edge(0, 1) + edge(3, 2)) / (edge(0, 3) + edge(1, 2));
		const width = Math.round(ratio >= 1 ? 1800 : 1800 * ratio),
			height = Math.round(ratio >= 1 ? 1800 / ratio : 1800);
		const full = { x: 0, y: 0, width: 1, height: 1 };
		const blank = sample(reference, definition.corners, full, width, height),
			scan = sample(upload, corners, full, width, height);
		const checks: Check[] = [];
		const timeout = new Promise<never>((_, reject) => {
			stop = setTimeout(() => {
				expired = true;
				void worker?.terminate();
				reject(new Error('Clearance check timed out. Try again.'));
			}, 120000);
		});
		const require = createRequire(import.meta.url);
		const pending = createWorker('eng', 1, {
			langPath: join(
				dirname(require.resolve('@tesseract.js-data/eng/package.json')),
				'4.0.0_best_int'
			),
			cacheMethod: 'none',
			errorHandler: () => {}
		});
		void pending.then(
			(value) => {
				if (expired) void value.terminate();
			},
			() => {}
		);
		worker = await Promise.race([pending, timeout]);
		for (const area of definition.areas) {
			if (area.kind === 'image') {
				const visualPatch = async (image: Image, points: Corners) => {
					const patch = sample(image, points, area.box, 256, 256);
					return sharp(patch.data, { raw: { width: 256, height: 256, channels: 1 } })
						.resize(64, 64)
						.greyscale()
						.raw()
						.toBuffer();
				};
				const visual = compareVisual(
					await visualPatch(reference, definition.corners),
					await visualPatch(upload, corners),
					64,
					64
				);
				checks.push({
					label: area.label,
					verdict: visual.verdict,
					detail: `${Math.round(visual.score * 100)}% black-and-white shape similarity near the saved position; 65% required.`
				});
				continue;
			}
			await Promise.race([
				worker.setParameters({
					user_defined_dpi: '300',
					tessedit_pageseg_mode: PSM.SPARSE_TEXT
				}),
				timeout
			]);
			for (const [image, points, prefix] of [
				[reference, definition.corners, 'Reference'],
				[upload, corners, 'Upload']
			] as const) {
				// Reference term values may differ; only the enrollment determines the required term.
				if (prefix === 'Reference' && area.kind !== 'text') continue;
				const box = printedSearchBox(area);
				const patch = sample(
					image,
					points,
					box,
					Math.max(100, Math.round(box.width * WIDTH * 3)),
					Math.max(40, Math.round(box.height * HEIGHT * 3))
				);
				if (area.kind === 'academicYear') enhancePrintedContrast(patch.data);
				const png = await sharp(patch.data, {
					raw: { width: patch.width, height: patch.height, channels: 1 }
				})
					.extend({ top: 12, bottom: 12, left: 12, right: 12, background: '#fff' })
					.png()
					.toBuffer();
				const { data } = await Promise.race([worker.recognize(png, {}, { blocks: true }), timeout]);
				checks.push({
					...checkAreaText(area, printedAreaReading(area, data), term),
					label: `${prefix}: ${area.label}`
				});
			}
		}
		const offices =
			overall(checks) === 'pass'
				? checkOfficeMarks(blank.data, scan.data, width, height, definition.officeRows ?? [])
				: [];
		const identityPresence =
			personalInfoVerificationEnabled && overall(checks) === 'pass' && overall(offices) === 'pass'
				? checkIdentityPresence(
						blank.data,
						scan.data,
						width,
						height,
						definition.personalFields ?? []
					)
				: undefined;
		return {
			template: checks,
			offices,
			identityPresence,
			identityCheckVersion: identityPresence ? 1 : undefined,
			identity: 'deferred',
			officeCheckVersion: 2
		};
	} finally {
		if (stop) clearTimeout(stop);
		if (worker && !expired) await worker.terminate();
		running = false;
	}
}
