import { addedInk, overall, type Check, type Region } from './clearance';
import type { Box, OfficeRow } from './definition';
import { checkCheckbox } from './checkbox';
import type { IdentityResult } from './identity';

export type ClearanceReport = {
	template: Check[];
	offices: Check[];
	identity: 'deferred' | 'disabled' | IdentityResult;
	identityVerificationEnabled?: boolean;
	identityPresence?: Record<'name' | 'studentNumber', Check>;
	identityCheckVersion?: number;
	officeCheckVersion?: number;
};
export function hasCurrentOfficeChecks(report: ClearanceReport) {
	return report.officeCheckVersion === 2;
}
export function hasCurrentClearanceChecks(report: ClearanceReport) {
	return (
		hasCurrentOfficeChecks(report) &&
		report.identityCheckVersion === 1 &&
		((report.identity === 'disabled' && report.identityVerificationEnabled === false) ||
			(!!report.identityPresence &&
				typeof report.identity === 'object' &&
				report.identity !== null))
	);
}
export function clearancePassed(report: ClearanceReport) {
	return (
		clearanceCanSubmit(report) &&
		(report.identity === 'disabled' ||
			(typeof report.identity === 'object' &&
				report.identity.verdict === 'match' &&
				!report.identity.warnings))
	);
}
// Eligibility for a staff review request is distinct from passing automatic identity checks.
export function clearanceCanSubmit(report: ClearanceReport) {
	return (
		hasCurrentClearanceChecks(report) &&
		(report.identity === 'disabled' ||
			(typeof report.identity === 'object' &&
				['match', 'review'].includes(report.identity.verdict) &&
				report.identityPresence?.name.verdict === 'pass' &&
				report.identityPresence?.studentNumber.verdict === 'pass')) &&
		overall(report.template) === 'pass' &&
		overall(report.offices) === 'pass'
	);
}
export function clearanceNeedsIdentityReview(report: ClearanceReport) {
	return clearanceCanSubmit(report) && !clearancePassed(report);
}

export function threshold(gray: Uint8Array, width: number, height: number) {
	const integral = new Float64Array((width + 1) * (height + 1)),
		stride = width + 1;
	for (let y = 0; y < height; y++) {
		let sum = 0;
		for (let x = 0; x < width; x++) {
			sum += gray[y * width + x];
			integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + sum;
		}
	}
	const mask = new Uint8Array(gray.length);
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const left = Math.max(0, x - 15),
				right = Math.min(width, x + 16),
				top = Math.max(0, y - 15),
				bottom = Math.min(height, y + 16);
			const sum =
				integral[bottom * stride + right] -
				integral[top * stride + right] -
				integral[bottom * stride + left] +
				integral[top * stride + left];
			mask[y * width + x] = +(gray[y * width + x] < sum / ((right - left) * (bottom - top)) - 18);
		}
	return mask;
}

export function checkOfficeMarks(
	blank: Uint8Array,
	uploaded: Uint8Array,
	width: number,
	height: number,
	rows: OfficeRow[]
): Check[] {
	if (blank.length !== width * height || uploaded.length !== blank.length)
		throw new Error('Invalid office image.');
	const reference = threshold(blank, width, height),
		actual = threshold(uploaded, width, height);
	const regionFor = (box: Box): Region => {
		const x = Math.floor(box.x * width),
			y = Math.floor(box.y * height);
		return {
			x,
			y,
			width: Math.min(width - x, Math.ceil(box.width * width)),
			height: Math.min(height - y, Math.ceil(box.height * height))
		};
	};
	const checkboxRegions = rows.flatMap((row) => (row.cleared ? [regionFor(row.cleared)] : []));
	const check = (label: string, box: Box | undefined, checkbox: boolean): Check => {
		if (!box)
			return {
				label,
				verdict: 'review',
				detail: 'This area has not been configured by an administrator.'
			};
		const region = regionFor(box);
		if (checkbox)
			return checkCheckbox(label, reference, actual, width, height, region, checkboxRegions);
		const minimum = 0.004;
		const ink = addedInk(actual, reference, width, height, region);
		return {
			label,
			verdict: ink >= minimum ? 'pass' : ink > minimum / 3 ? 'review' : 'fail',
			detail:
				ink >= minimum
					? 'Additional ink detected in the saved area. Staff must review the document.'
					: ink > minimum / 3
						? 'A faint or uncertain mark needs a clearer upload.'
						: 'No sufficient additional mark was detected.'
		};
	};
	return rows.flatMap((row) => [
		check(`${row.label}: cleared checkbox`, row.cleared, true),
		check(`${row.label}: signature / stamp`, row.signature, false)
	]);
}
