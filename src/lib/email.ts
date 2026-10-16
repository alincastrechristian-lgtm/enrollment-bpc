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
	'enrollment_dropped'
] as const;

export type EmailEventType = (typeof emailEventTypes)[number];

export const emailEventLabels: Record<EmailEventType, string> = {
	account_setup: 'Account setup',
	password_reset: 'Password reset',
	enrollment_confirmed: 'Enrollment confirmation',
	grades_finalized: 'Finalized grades',
	meeting_request: 'Meeting request',
	enrollment_dropped: 'Dropped enrollment'
};
