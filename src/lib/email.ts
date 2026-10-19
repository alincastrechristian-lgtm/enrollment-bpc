export enum EmailApiType {
	SMTP = 'smtp',
	RESEND = 'resend'
}

export const emailEventTypes = [
	'account_setup',
	'password_reset',
	'enrollment_confirmed',
	'grades_finalized',
	'meeting_request',
	'enrollment_dropped',
	'enrollment_corrected',
	'enrollment_voided',
	'enrollment_reopened'
] as const;

export type EmailEventType = (typeof emailEventTypes)[number];

export const emailEventLabels: Record<EmailEventType, string> = {
	account_setup: 'Account setup',
	password_reset: 'Password reset',
	enrollment_confirmed: 'Enrollment confirmation',
	grades_finalized: 'Finalized grades',
	meeting_request: 'Meeting request',
	enrollment_dropped: 'Dropped enrollment',
	enrollment_corrected: 'Enrollment correction',
	enrollment_voided: 'Voided enrollment',
	enrollment_reopened: 'Reopened enrollment'
};

// In-app events include email events without adding document actions to email delivery.
export const notificationEventTypes = [
	...emailEventTypes,
	'documents_requested',
	'document_verified',
	'document_rejected'
] as const;
export type NotificationEventType = (typeof notificationEventTypes)[number];
export const notificationEventLabels: Record<NotificationEventType, string> = {
	...emailEventLabels,
	documents_requested: 'Required documents',
	document_verified: 'Document verified',
	document_rejected: 'Document correction'
};
