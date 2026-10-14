import type { Applicant } from '#lib/schema.js';

export function hasAllApplicantDocuments(applicant: Applicant): boolean {
	return (
		applicant.hasBirthCertificate &&
		applicant.hasForm138 &&
		applicant.hasGoodMoral &&
		applicant.hasPicture
	);
}

export function canCreateStudentAccount(applicant?: Applicant): boolean {
	if (!applicant) return false;

	// If the applicant already has a student account, we cannot create another one
	if (applicant.userId) return false;

	return hasAllApplicantDocuments(applicant);
}
