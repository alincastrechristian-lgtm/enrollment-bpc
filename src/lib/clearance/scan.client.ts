import type { Worker } from 'tesseract.js';
import { findBorder } from './border';
import { comparePrintedLayout } from './template';
import { suggestPrintedAreas, suggestGraphicAreas, type AreaSuggestions } from './suggestions';
import { suggestPersonalFields, type PersonalFieldSuggestions } from './personal-suggestions';
import { suggestOfficeRows, type OfficeSuggestions } from './office-suggestions';
import { threshold } from './report';
import {
	checkAreaText,
	compareVisual,
	type TemplateArea,
	type TemplateDefinition
} from './definition';
import {
	addedInk,
	HEIGHT,
	homography,
	project,
	PRINTED_REGIONS,
	READING_LABELS,
	REFERENCE_CORNERS,
	REGIONS,
	ROW_REGIONS,
	UNIT_CORNERS,
	validCorners,
	WIDTH,
	type Corners,
	type Check,
	type Expected,
	type Reading,
	type Region,
	type Scan
} from './clearance';

function canvas(width: number, height: number) {
	const result = document.createElement('canvas');
	result.width = width;
	result.height = height;
	return result;
}

function context(image: HTMLCanvasElement) {
	const result = image.getContext('2d', { willReadFrequently: true });
	if (!result) throw new Error('This browser cannot process canvas images.');
	return result;
}

export async function loadImage(source: string, signal?: AbortSignal): Promise<HTMLCanvasElement> {
	const image = new Image();
	const abort = () => {
		image.src = '';
	};
	if (signal?.aborted) throw new DOMException('Image loading cancelled.', 'AbortError');
	signal?.addEventListener('abort', abort, { once: true });
	try {
		image.src = source;
		await image.decode();
		if (image.naturalWidth < 500 || image.naturalHeight < 400)
			throw new Error(
				'Image too small. Use at least 500 × 400 pixels; 1500 pixels or wider recommended.'
			);
		if (image.naturalWidth * image.naturalHeight > 40_000_000)
			throw new Error('Image too large. Resize below 40 megapixels.');
		const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
		const result = canvas(
			Math.round(image.naturalWidth * scale),
			Math.round(image.naturalHeight * scale)
		);
		context(result).drawImage(image, 0, 0, result.width, result.height);
		return result;
	} finally {
		signal?.removeEventListener('abort', abort);
	}
}

export async function loadUpload(file: File) {
	if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
		throw new Error(
			'Choose a JPG, PNG or WebP image. PDFs and HEIC are not supported in this prototype.'
		);
	if (file.size > 15 * 1024 * 1024) throw new Error('Choose an image under 15 MB.');
	const url = URL.createObjectURL(file);
	try {
		return await loadImage(url);
	} finally {
		URL.revokeObjectURL(url);
	}
}

export function detectBorder(source: HTMLCanvasElement): Corners | null {
	const scale = Math.min(1, 800 / Math.max(source.width, source.height));
	const image = canvas(Math.round(source.width * scale), Math.round(source.height * scale));
	context(image).drawImage(source, 0, 0, image.width, image.height);
	const { data } = context(image).getImageData(0, 0, image.width, image.height);
	const gray = new Uint8Array(image.width * image.height);
	for (let i = 0; i < gray.length; i++)
		gray[i] = Math.round(data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114);
	return findBorder(gray, image.width, image.height);
}

export function straighten(source: HTMLCanvasElement, corners: Corners): HTMLCanvasElement {
	return rectifiedRegion(source, corners, { x: 0, y: 0, width: WIDTH, height: HEIGHT });
}

// Sample fields directly from source pixels before the full-form preview loses detail.
export function identityCrops(source: HTMLCanvasElement, corners: Corners) {
	return {
		name: rectifiedRegion(source, corners, REGIONS.name, 2),
		studentNumber: rectifiedRegion(source, corners, REGIONS.studentNumber, 2)
	};
}

function rectifiedRegion(
	source: HTMLCanvasElement,
	corners: Corners,
	box: Region,
	scale = 1,
	page = { width: WIDTH, height: HEIGHT }
) {
	if (!validCorners(corners))
		throw new Error(
			'Select four border corners clockwise: top left, top right, bottom right, bottom left.'
		);
	const matrix = homography(UNIT_CORNERS, corners);
	const pixels = context(source).getImageData(0, 0, source.width, source.height);
	const result = canvas(box.width * scale, box.height * scale);
	const output = context(result).createImageData(result.width, result.height);
	for (let y = 0; y < result.height; y++) {
		for (let x = 0; x < result.width; x++) {
			const point = project(matrix, {
				x: (box.x + x / scale) / (page.width - 1),
				y: (box.y + y / scale) / (page.height - 1)
			});
			const sx = Math.max(0, Math.min(source.width - 1, Math.round(point.x * (source.width - 1))));
			const sy = Math.max(
				0,
				Math.min(source.height - 1, Math.round(point.y * (source.height - 1)))
			);
			const index = (y * result.width + x) * 4,
				sourceIndex = (sy * source.width + sx) * 4;
			for (let channel = 0; channel < 3; channel++)
				output.data[index + channel] = pixels.data[sourceIndex + channel];
			output.data[index + 3] = 255;
		}
	}
	context(result).putImageData(output, 0, 0);
	return result;
}

function inkMask(image: HTMLCanvasElement): Uint8Array {
	const { width, height } = image;
	const { data } = context(image).getImageData(0, 0, width, height);
	const gray = new Uint8Array(width * height);
	for (let i = 0; i < gray.length; i++)
		gray[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
	return threshold(gray, width, height);
}

export function crop(source: HTMLCanvasElement, box: Region, scale = 2): HTMLCanvasElement {
	const result = canvas(box.width * scale, box.height * scale);
	context(result).drawImage(
		source,
		box.x,
		box.y,
		box.width,
		box.height,
		0,
		0,
		result.width,
		result.height
	);
	return result;
}

export function ocrCrop(
	source: HTMLCanvasElement,
	key: keyof typeof REGIONS,
	corners?: Corners
): HTMLCanvasElement {
	// Keep the thin italic semester strokes intact; extra scale helps without contrast clipping.
	// For template checks, sample original pixels instead of enlarging a reduced page preview.
	const image = corners
		? rectifiedRegion(source, corners, REGIONS[key], 3)
		: crop(source, REGIONS[key], key === 'semester' ? 3 : 2);
	if (!(key in PRINTED_REGIONS)) return image;
	return preparePrinted(image, key !== 'semester' && !(corners && key === 'school'));
}

function preparePrinted(image: HTMLCanvasElement, enhance: boolean) {
	// Preserve thin header strokes in source pixels; the numeric year benefits from contrast.
	if (enhance) {
		const pixels = context(image).getImageData(0, 0, image.width, image.height);
		const gray = new Uint8Array(image.width * image.height);
		const histogram = new Uint32Array(256);
		for (let i = 0; i < gray.length; i++) {
			gray[i] = Math.round(
				pixels.data[i * 4] * 0.299 + pixels.data[i * 4 + 1] * 0.587 + pixels.data[i * 4 + 2] * 0.114
			);
			histogram[gray[i]]++;
		}
		const percentile = (fraction: number) => {
			let count = 0;
			for (let value = 0; value < 256; value++) {
				count += histogram[value];
				if (count >= gray.length * fraction) return value;
			}
			return 255;
		};
		const white = percentile(0.9),
			dark = percentile(0.01);
		// Preserve faint strokes on low-contrast crops rather than turning a blank gray crop black.
		const black = white - dark >= 32 ? dark : 0;
		for (let i = 0; i < gray.length; i++) {
			const value = Math.max(
				0,
				Math.min(255, Math.round(((gray[i] - black) * 255) / Math.max(1, white - black)))
			);
			pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = value;
		}
		context(image).putImageData(pixels, 0, 0);
	}
	// White padding separates text from crop edges for single-line segmentation.
	const result = canvas(image.width + 24, image.height + 24),
		ctx = context(result);
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, result.width, result.height);
	ctx.drawImage(image, 12, 12);
	return result;
}

export function inspectMarks(image: HTMLCanvasElement, reference: HTMLCanvasElement): Scan['rows'] {
	const actual = inkMask(image),
		blank = inkMask(reference);
	return ROW_REGIONS.map(({ department, cleared, notCleared, signature }) => ({
		department,
		cleared: addedInk(actual, blank, WIDTH, HEIGHT, cleared),
		notCleared: addedInk(actual, blank, WIDTH, HEIGHT, notCleared),
		signature: addedInk(actual, blank, WIDTH, HEIGHT, signature)
	}));
}

export function inspectTemplateLayout(image: HTMLCanvasElement, reference: HTMLCanvasElement) {
	return comparePrintedLayout(inkMask(image), inkMask(reference));
}

export async function recognize(
	image: HTMLCanvasElement,
	onProgress: (text: string) => void,
	signal: AbortSignal
): Promise<Omit<Scan, 'rows'>> {
	return recognizeRegions(
		image,
		Object.keys(REGIONS) as (keyof typeof REGIONS)[],
		onProgress,
		signal
	);
}

export function recognizePrinted(
	source: HTMLCanvasElement,
	corners: Corners,
	onProgress: (text: string) => void,
	signal: AbortSignal
) {
	return recognizeRegions(
		source,
		Object.keys(PRINTED_REGIONS) as (keyof typeof PRINTED_REGIONS)[],
		onProgress,
		signal,
		corners
	);
}

async function recognizeRegions<K extends keyof typeof REGIONS>(
	image: HTMLCanvasElement,
	keys: K[],
	onProgress: (text: string) => void,
	signal: AbortSignal,
	corners?: Corners
): Promise<Record<K, Reading>> {
	return recognizeJobs(
		keys.map((key) => ({
			key,
			label: READING_LABELS[key],
			multiline: key === 'departments',
			image: () => ocrCrop(image, key, corners)
		})),
		onProgress,
		signal
	);
}

async function recognizeJobs<K extends string>(
	jobs: { key: K; label: string; multiline: boolean; image: () => HTMLCanvasElement }[],
	onProgress: (text: string) => void,
	signal: AbortSignal
): Promise<Record<K, Reading>> {
	const { PSM } = await import('tesseract.js');
	return withOcrWorker(onProgress, signal, async (worker, stopped) => {
		const result = {} as Record<K, Reading>;
		for (const job of jobs) {
			if (signal.aborted) throw new Error('Scan cancelled.');
			onProgress(`Reading ${job.label}…`);
			await Promise.race([
				worker.setParameters({
					tessedit_pageseg_mode: job.multiline ? PSM.SINGLE_BLOCK : PSM.SINGLE_LINE
				}),
				stopped
			]);
			const { data } = await Promise.race([worker.recognize(job.image()), stopped]);
			result[job.key] = { text: data.text.trim(), confidence: data.confidence };
		}
		return result;
	});
}

async function withOcrWorker<T>(
	onProgress: (text: string) => void,
	signal: AbortSignal,
	run: (worker: Worker, stopped: Promise<never>) => Promise<T>
): Promise<T> {
	const { createWorker } = await import('tesseract.js');
	let worker: Worker | undefined;
	let aborted = false;
	let rejectStop: (reason: Error) => void;
	const stopped = new Promise<never>((_, reject) => {
		rejectStop = reject;
	});
	const abort = () => {
		aborted = true;
		rejectStop(
			new Error('OCR stopped. Cancelled or timed out; check internet connection before retrying.')
		);
		void worker?.terminate();
	};
	signal.addEventListener('abort', abort, { once: true });
	// Also bound initialization and CDN failure paths, which may never deliver a worker response.
	const timeout = setTimeout(abort, 120_000);
	try {
		if (signal.aborted) throw new Error('Scan cancelled.');
		onProgress('Loading OCR engine (first run downloads language data)…');
		const pending = createWorker('eng', 1, {
			logger: ({ status, progress }) => {
				if (!aborted) onProgress(`${status} · ${Math.round(progress * 100)}%`);
			},
			errorHandler: () => {
				/* Worker errors reject the active job. */
			}
		});
		// Terminate even if initialization finishes after cancel or timeout.
		void pending.then(
			(value) => {
				if (aborted) void value.terminate();
			},
			() => {}
		);
		worker = await Promise.race([pending, stopped]);
		if (aborted) throw new Error('OCR stopped. Check internet connection and try again.');
		return await run(worker, stopped);
	} finally {
		clearTimeout(timeout);
		signal.removeEventListener('abort', abort);
		if (worker && !aborted) await worker.terminate();
	}
}

function templateSize(source: HTMLCanvasElement, corners: Corners) {
	const edge = (a: number, b: number) =>
		Math.hypot(
			(corners[a].x - corners[b].x) * source.width,
			(corners[a].y - corners[b].y) * source.height
		);
	const width = (edge(0, 1) + edge(3, 2)) / 2,
		height = (edge(0, 3) + edge(1, 2)) / 2;
	const scale = 1200 / Math.max(width, height);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale))
	};
}

export function alignTemplate(source: HTMLCanvasElement, corners: Corners) {
	const size = templateSize(source, corners);
	return rectifiedRegion(source, corners, { x: 0, y: 0, ...size }, 1, size);
}

async function readTemplateLines(
	source: HTMLCanvasElement,
	corners: Corners,
	onProgress: (text: string) => void,
	signal: AbortSignal
) {
	const { PSM } = await import('tesseract.js');
	const size = templateSize(source, corners);
	const image = rectifiedRegion(source, corners, { x: 0, y: 0, ...size }, 2, size);
	const lines = await withOcrWorker(onProgress, signal, async (worker, stopped) => {
		await Promise.race([worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT }), stopped]);
		onProgress('Finding printed text and its positions…');
		const { data } = await Promise.race([
			worker.recognize(image, {}, { blocks: true, text: true }),
			stopped
		]);
		return (data.blocks ?? []).flatMap((block) =>
			block.paragraphs.flatMap((paragraph) => paragraph.lines)
		);
	});
	if (signal.aborted) throw new Error('Area detection cancelled.');
	return { lines, image };
}

export async function detectPersonalFields(
	source: HTMLCanvasElement,
	corners: Corners,
	onProgress: (text: string) => void,
	signal: AbortSignal
): Promise<PersonalFieldSuggestions> {
	const { lines, image } = await readTemplateLines(source, corners, onProgress, signal);
	onProgress('Locating student writing areas…');
	return suggestPersonalFields(lines, image.width, image.height, inkMask(image));
}

export async function detectOfficeRows(
	source: HTMLCanvasElement,
	corners: Corners,
	onProgress: (text: string) => void,
	signal: AbortSignal
): Promise<OfficeSuggestions> {
	const { lines, image } = await readTemplateLines(source, corners, onProgress, signal);
	onProgress('Linking office names, checkboxes and signature spaces…');
	return suggestOfficeRows(lines, image.width, image.height, inkMask(image));
}

export async function detectTemplateAreas(
	source: HTMLCanvasElement,
	corners: Corners,
	onProgress: (text: string) => void,
	signal: AbortSignal
): Promise<AreaSuggestions> {
	const { lines, image } = await readTemplateLines(source, corners, onProgress, signal);
	const result = suggestPrintedAreas(lines, image.width, image.height);
	onProgress('Finding graphic candidates…');
	const preview = alignTemplate(source, corners);
	const textBoxes = lines.map((line) => ({
		x: line.bbox.x0 / image.width,
		y: line.bbox.y0 / image.height,
		width: (line.bbox.x1 - line.bbox.x0) / image.width,
		height: (line.bbox.y1 - line.bbox.y0) / image.height
	}));
	const graphics = suggestGraphicAreas(inkMask(preview), preview.width, preview.height, textBoxes);
	for (const [index, box] of graphics.entries())
		result.areas.push({
			id: crypto.randomUUID(),
			label: `Graphic candidate ${index + 1}`,
			kind: 'image',
			expected: '',
			box
		});
	if (!graphics.length)
		result.hints.push(
			'No reliable graphic candidate found. Mark the logo or a permanent printed structure manually.'
		);
	result.hints.unshift(
		'Review every box, area type and text reading before saving. Graphics are suggestions, not confirmed school logos.'
	);
	return result;
}

function areaRegion(area: TemplateArea, page: { width: number; height: number }): Region {
	return {
		x: area.box.x * page.width,
		y: area.box.y * page.height,
		width: Math.max(1, Math.round(area.box.width * page.width)),
		height: Math.max(1, Math.round(area.box.height * page.height))
	};
}

function visualPatch(image: HTMLCanvasElement, area: TemplateArea) {
	const box = areaRegion(area, image),
		small = canvas(64, 64);
	context(small).drawImage(image, box.x, box.y, box.width, box.height, 0, 0, 64, 64);
	const { data } = context(small).getImageData(0, 0, 64, 64);
	return Uint8Array.from({ length: 64 * 64 }, (_, i) =>
		Math.round(data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114)
	);
}

export async function compareDefinedTemplate(
	reference: HTMLCanvasElement,
	source: HTMLCanvasElement,
	corners: Corners,
	definition: TemplateDefinition,
	onProgress: (text: string) => void,
	signal: AbortSignal
): Promise<Check[]> {
	const size = templateSize(reference, definition.corners);
	const blank = rectifiedRegion(reference, definition.corners, { x: 0, y: 0, ...size }, 1, size),
		uploaded = rectifiedRegion(source, corners, { x: 0, y: 0, ...size }, 1, size);
	const checks: Check[] = [];
	for (const area of definition.areas.filter((a) => a.kind === 'image')) {
		const comparison = compareVisual(visualPatch(blank, area), visualPatch(uploaded, area), 64, 64);
		checks.push({
			label: area.label,
			verdict: comparison.verdict,
			detail: `${Math.round(comparison.score * 100)}% visual similarity in the marked position. Empty or unclear areas require review.`
		});
	}
	const textAreas = definition.areas.filter((a) => a.kind !== 'image');
	const read = (image: HTMLCanvasElement, points: Corners, prefix: string) =>
		recognizeJobs(
			textAreas.map((area) => ({
				key: area.id,
				label: area.label,
				multiline: area.kind === 'text' && /\n/.test(area.expected),
				image: () =>
					preparePrinted(
						// Keep OCR sampling independent of display preview dimensions.
						rectifiedRegion(image, points, areaRegion(area, { width: WIDTH, height: HEIGHT }), 3),
						area.kind === 'academicYear'
					)
			})),
			(message) => onProgress(`${prefix}: ${message}`),
			signal
		);
	const referenceText = await read(reference, definition.corners, 'Reference');
	const sourceText = await read(source, corners, 'Upload');
	for (const area of textAreas) {
		const refCheck = checkAreaText(area, referenceText[area.id], definition);
		checks.push({ ...refCheck, label: `Reference: ${area.label}` });
		const check = checkAreaText(area, sourceText[area.id], definition);
		checks.push({ ...check, label: `Upload: ${area.label}` });
	}
	return checks;
}

export async function loadReference(url: string) {
	return straighten(await loadImage(url), REFERENCE_CORNERS);
}

export function makeDemo(reference: HTMLCanvasElement, expected: Expected) {
	const result = canvas(WIDTH, HEIGHT),
		ctx = context(result);
	ctx.drawImage(reference, 0, 0);
	const fields = {
		name: expected.name || 'Juan Dela Cruz',
		studentNumber: expected.studentNumber || 'MA-2025-0001',
		classDetails: `${expected.course || 'BSIS'} ${expected.year || '1'} ${expected.section || 'A'}`
	};
	for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
		const box = REGIONS[key];
		ctx.fillStyle = '#fff';
		ctx.fillRect(box.x, box.y, box.width, box.height);
		ctx.fillStyle = '#111';
		ctx.font = `${Math.min(24, box.height - 3)}px Arial`;
		ctx.textBaseline = 'middle';
		ctx.fillText(fields[key], box.x + 3, box.y + box.height / 2, box.width - 6);
	}
	for (const row of ROW_REGIONS) {
		const box = row.cleared;
		ctx.strokeStyle = '#131333';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(box.x + 2, box.y + box.height / 2);
		ctx.lineTo(box.x + box.width / 2, box.y + box.height - 2);
		ctx.lineTo(box.x + box.width - 2, box.y + 2);
		ctx.stroke();
		const signature = row.signature;
		ctx.beginPath();
		for (let i = 0; i < 75; i++) {
			const x = signature.x + 8 + i * 1.5,
				y = signature.y + signature.height / 2 + Math.sin(i / 3) * signature.height * 0.3;
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();
	}
	return result;
}
