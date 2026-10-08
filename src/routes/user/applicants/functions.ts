import { hasAllApplicantDocuments } from '#lib/applicants.js';
import type { Applicant } from '#lib/schema.js';

export enum ApplicantStatus {
	Incomplete = 'Incomplete',
	UnderReview = 'Under Review',
	Approved = 'Approved',
	Rejected = 'Rejected'
}

export function getApplicantStatus(applicant: Applicant): ApplicantStatus {
	if (!hasAllApplicantDocuments(applicant)) {
		return ApplicantStatus.Incomplete;
	}

	if (!applicant.userId) {
		return ApplicantStatus.UnderReview;
	}

	return ApplicantStatus.Approved;
}

export const statusBadge = (applicant: Applicant) => {
	switch (getApplicantStatus(applicant)) {
		case ApplicantStatus.Approved:
			return 'badge-success';
		case ApplicantStatus.UnderReview:
			return 'badge-warning';
		case ApplicantStatus.Rejected:
		case ApplicantStatus.Incomplete:
			return 'badge-error';
		default:
			return 'badge-warning';
	}
};

export const dateValue = (date: Date) =>
	new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Manila',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(date);
