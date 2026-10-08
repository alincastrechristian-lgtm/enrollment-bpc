import type { Applicant } from '#lib/schema.js';

export function hasAllApplicantDocuments(applicant: Applicant): boolean {
	return (
		applicant.hasBirthCertificate &&
		applicant.hasForm138 &&
		applicant.hasGoodMoral &&
		applicant.hasPicture
	);
}
