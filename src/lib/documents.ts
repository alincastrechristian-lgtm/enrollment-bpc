export const DOCUMENT_LABELS = { form137: 'Form 137', sf10: 'SF10', tor: 'TOR' } as const;
export type DocumentKind = keyof typeof DOCUMENT_LABELS;
export const DOCUMENT_KINDS = ['form137', 'sf10', 'tor'] as const;
export const DOCUMENT_STATUS_LABELS = {
	requested: 'Upload required',
	uploaded: 'Awaiting verification',
	verified: 'Verified',
	rejected: 'Upload another copy'
} as const;
