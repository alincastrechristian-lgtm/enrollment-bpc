import { escapeHtml } from './email-html';
import { emailTheme as colors } from './email-theme';
import type { EmailEventType } from '../email';

const brand = 'BPC Enrollment System';

function parseEmailUrl(url: string) {
	const parsed = new URL(url);
	if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password)
		throw new Error('Email links must use HTTP or HTTPS without credentials');
	return parsed;
}

function expiryLabel(seconds: number): string {
	if (!Number.isInteger(seconds) || seconds <= 0) throw new Error('Invalid email link expiry');
	for (const [unit, size] of [
		['day', 86400],
		['hour', 3600],
		['minute', 60],
		['second', 1]
	] as const) {
		if (seconds % size === 0) {
			const count = seconds / size;
			return `${count} ${unit}${count === 1 ? '' : 's'}`;
		}
	}
	throw new Error('Invalid email link expiry');
}

function renderAuthEmail({
	type,
	url,
	expiresInSeconds,
	title,
	message,
	action,
	category,
	name
}: {
	type: EmailEventType;
	url: string;
	expiresInSeconds: number;
	title: string;
	message: string;
	action: string;
	category: string;
	name?: string;
}) {
	const parsedUrl = parseEmailUrl(url);
	const safeUrl = escapeHtml(url);
	const greeting = name?.trim() ? `Hello ${name.trim()},` : 'Hello,';
	const expiry = `This link expires in ${expiryLabel(expiresInSeconds)} and can only be used once.`;
	const recoveryUrl = new URL('/forgot-password', parsedUrl).href;
	const recovery =
		'If this link expires, you can request a new one from the Forgot password page using the same email address.';
	const security =
		'If you did not request this email, you can safely ignore it. Never share this link with anyone.';
	const subject = `${title} | ${brand}`;
	const text = [
		brand,
		'',
		greeting,
		'',
		message,
		'',
		`${action}:`,
		url,
		'',
		expiry,
		'',
		recovery,
		recoveryUrl,
		'',
		security
	].join('\n');

	// Tables and inline hex colors work in email clients without website CSS or scripts.
	const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:${colors.background};color:${colors.text};font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(message)} ${escapeHtml(expiry)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${colors.background}">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${colors.surface};border:1px solid ${colors.border};border-radius:20px;overflow:hidden;">
<tr><td bgcolor="${colors.primary}" style="padding:24px 28px;border-radius:20px 20px 0 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="56" height="56" align="center" bgcolor="${colors.surface}" style="width:56px;height:56px;border-radius:50%;color:${colors.primary};font-size:16px;font-weight:800;">BPC</td>
<td style="padding-left:14px;color:${colors.primaryContent};font-size:12px;font-weight:700;line-height:1.6;letter-spacing:1px;">ENROLLMENT<br>SYSTEM</td>
</tr></table></td></tr>
<tr><td style="padding:32px 28px;">
<p style="margin:0 0 12px;color:${colors.primary};font-size:11px;font-weight:700;letter-spacing:1.5px;">${escapeHtml(category)}</p>
<h1 style="margin:0 0 24px;font-size:26px;line-height:1.3;color:${colors.text};">${escapeHtml(title)}</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.7;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.7;">${escapeHtml(message)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${colors.primary}" style="border-radius:8px;mso-padding-alt:14px 24px;">
<a href="${safeUrl}" style="display:inline-block;padding:14px 24px;border:1px solid ${colors.primary};border-radius:8px;background-color:${colors.primary};color:${colors.primaryContent};font-size:14px;font-weight:700;text-decoration:none;">${escapeHtml(action)}</a>
</td></tr></table>
<p style="margin:20px 0 24px;font-size:13px;line-height:1.6;">${escapeHtml(expiry)}</p>
<p style="margin:0 0 24px;font-size:13px;line-height:1.7;">${escapeHtml(recovery)}<br><a href="${escapeHtml(recoveryUrl)}" style="color:${colors.primary};font-weight:700;">Request a new link</a></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${colors.background}" style="border:1px solid ${colors.border};border-radius:12px;"><tr><td style="padding:16px;">
<p style="margin:0 0 8px;font-size:12px;line-height:1.6;">If the button does not work, copy and paste this link into your browser:</p>
<a href="${safeUrl}" style="color:${colors.primary};font-size:12px;line-height:1.7;word-break:break-all;overflow-wrap:anywhere;">${safeUrl}</a>
</td></tr></table>
<p style="margin:24px 0 0;font-size:12px;line-height:1.7;">${escapeHtml(security)}</p>
</td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid ${colors.border};font-size:11px;line-height:1.7;">${brand}<br>This is an automated account email.</td></tr>
</table>
</td></tr></table>
</body></html>`;
	// Safe portal content excludes one-time links and security tokens.
	return {
		subject,
		text,
		html,
		notification: {
			type,
			title,
			message: message.replace('Use the button below', 'Use the link in your email')
		}
	};
}

export function createResetPasswordEmail(url: string, expiresInSeconds: number, name?: string) {
	return renderAuthEmail({
		type: 'password_reset',
		url,
		expiresInSeconds,
		name,
		title: 'Reset your password',
		message:
			'We received a request to reset your BPC Enrollment System password. Use the button below to choose a new password.',
		action: 'Reset password',
		category: 'ACCOUNT SECURITY'
	});
}

export function createFirstLoginEmail(url: string, expiresInSeconds: number, name?: string) {
	return renderAuthEmail({
		type: 'account_setup',
		url,
		expiresInSeconds,
		name,
		title: 'Set up your account',
		message:
			'Welcome to the BPC Enrollment System. Set your password to activate your account and sign in.',
		action: 'Set password',
		category: 'ACCOUNT SETUP'
	});
}

function renderAcademicEmail({
	type,
	name,
	schoolYearStart,
	semester,
	url,
	title,
	category,
	message,
	steps,
	note,
	program
}: {
	type: EmailEventType;
	name: string;
	schoolYearStart: number;
	semester: number;
	url?: string;
	title: string;
	category: string;
	message: string;
	steps: string[];
	note: string;
	program?: { code: string; name: string };
}) {
	if (url) parseEmailUrl(url);
	const subject = `${title} | ${brand}`;
	const greeting = name.trim() ? `Hello ${name.trim()},` : 'Hello,';
	const schoolYear = `${schoolYearStart}–${schoolYearStart + 1}`;
	const term = `Semester ${semester}, SY ${schoolYear}`;
	const text = [
		brand,
		'',
		title,
		term,
		...(program ? [`Program: ${program.name} (${program.code})`] : []),
		'',
		greeting,
		'',
		message,
		'',
		'Your next steps',
		...steps.map((step, index) => `${index + 1}. ${step}`),
		'',
		note,
		...(url ? ['', 'View enrollment:', url] : []),
		'',
		"Registrar's Office",
		brand
	].join('\n');
	// Presentation tables and inline theme colors remain readable in mail clients.
	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:${colors.background};color:${colors.text};font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(message)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${colors.background}"><tr><td align="center" style="padding:36px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:${colors.surface};border:1px solid ${colors.border};border-radius:20px;overflow:hidden;">
<tr><td bgcolor="${colors.primary}" style="padding:26px 28px;border-radius:20px 20px 0 0;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="52" height="52" align="center" bgcolor="${colors.surface}" style="border-radius:14px;color:${colors.primary};font-size:16px;font-weight:800;">BPC</td>
<td style="padding-left:14px;color:${colors.primaryContent};font-size:13px;font-weight:700;line-height:1.6;">Bulacan Polytechnic College<br><span style="font-size:11px;font-weight:400;">Enrollment System</span></td>
</tr></table></td></tr>
<tr><td style="padding:32px 28px 28px;">
<p style="margin:0 0 12px;color:${colors.primary};font-size:11px;font-weight:700;letter-spacing:1.5px;">${escapeHtml(category)}</p>
<h1 style="margin:0 0 24px;font-size:28px;line-height:1.25;letter-spacing:-0.5px;">${escapeHtml(title)}</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${colors.background}" style="border:1px solid ${colors.border};border-radius:12px;"><tr>
<td width="50%" style="padding:16px;"><p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:1px;">SCHOOL YEAR</p><p style="margin:0;font-size:16px;font-weight:700;">${escapeHtml(schoolYear)}</p></td>
<td style="padding:16px;border-left:1px solid ${colors.border};"><p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:1px;">ACADEMIC TERM</p><p style="margin:0;font-size:16px;font-weight:700;">Semester ${semester}</p></td>
</tr>${program ? `<tr><td colspan="2" style="padding:16px;border-top:1px solid ${colors.border};"><p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:1px;">PROGRAM</p><p style="margin:0;font-size:15px;font-weight:700;line-height:1.6;">${escapeHtml(program.name)} (${escapeHtml(program.code)})</p></td></tr>` : ''}</table>
<p style="margin:26px 0 12px;font-size:15px;line-height:1.7;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 26px;font-size:15px;line-height:1.8;">${escapeHtml(message)}</p>
<h2 style="margin:0 0 14px;font-size:16px;">Your next steps</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${steps.map((step, index) => `<tr><td width="32" valign="top" style="padding:0 8px 14px 0;color:${colors.primary};font-size:13px;font-weight:700;line-height:1.8;">0${index + 1}</td><td style="padding:0 0 14px;font-size:14px;line-height:1.8;">${escapeHtml(step)}</td></tr>`).join('')}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${colors.background}" style="border-left:3px solid ${colors.primary};"><tr><td style="padding:14px 16px;font-size:13px;line-height:1.7;">${escapeHtml(note)}</td></tr></table>
${
	url
		? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr><td align="center" bgcolor="${colors.primary}" style="border-radius:8px;mso-padding-alt:14px 24px;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 24px;border:1px solid ${colors.primary};border-radius:8px;color:${colors.primaryContent};background-color:${colors.primary};font-size:14px;font-weight:700;text-decoration:none;">View enrollment</a></td></tr></table>
<p style="margin:18px 0 0;font-size:12px;line-height:1.7;">You may be asked to sign in. If the button does not work, <a href="${escapeHtml(url)}" style="color:${colors.primary};word-break:break-all;">open your enrollment here</a>.</p>`
		: ''
}
</td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid ${colors.border};font-size:12px;line-height:1.8;"><strong>Registrar's Office</strong><br>Bulacan Polytechnic College<br><span style="font-size:11px;">This is an academic update from ${brand}.</span></td></tr>
</table></td></tr></table></body></html>`;
	return {
		subject,
		text,
		html,
		notification: {
			type,
			title,
			message: [
				message,
				term,
				...(program ? [`Program: ${program.name} (${program.code})`] : [])
			].join('\n\n')
		}
	};
}

export function createMeetingRequestEmail(
	name: string,
	schoolYearStart: number,
	semester: number,
	url?: string
) {
	return renderAcademicEmail({
		type: 'meeting_request',
		name,
		schoolYearStart,
		semester,
		url,
		title: "Request to meet with the Registrar's Office",
		category: 'ACADEMIC FOLLOW-UP',
		message:
			'Your finalized grades include failing or incomplete (INC) grades. We would like to help you understand your next steps and enrollment options.',
		steps: [
			'Review your finalized grades and meeting request on your student dashboard.',
			"Contact or visit the Registrar's Office to arrange a meeting about your academic standing and outstanding requirements."
		],
		note: 'No appointment has been scheduled yet. Please coordinate a suitable time with the office.'
	});
}

export function createGradesFinalizedEmail(
	name: string,
	schoolYearStart: number,
	semester: number,
	url?: string,
	program?: { code: string; name: string }
) {
	return renderAcademicEmail({
		type: 'grades_finalized',
		name,
		schoolYearStart,
		semester,
		url,
		program,
		title: 'Your grades have been finalized',
		category: 'FINAL GRADES AVAILABLE',
		message:
			'Your grades for this enrollment have been finalized and are now available in your student portal.',
		steps: [
			'Sign in and open your enrollment record to review your subject grades.',
			"If you have questions about a grade or an outstanding requirement, contact your instructor or the Registrar's Office."
		],
		note: 'INC means Incomplete. Review any outstanding subject requirements with your instructor.'
	});
}

export function createEnrollmentConfirmationEmail({
	name,
	schoolYearStart,
	semester,
	programCode,
	yearLevel,
	section,
	url
}: {
	name: string;
	schoolYearStart: number;
	semester: number;
	programCode: string;
	yearLevel: number;
	section: string;
	url?: string;
}) {
	return renderAcademicEmail({
		type: 'enrollment_confirmed',
		name,
		schoolYearStart,
		semester,
		url,
		title: 'Your enrollment is confirmed',
		category: 'ENROLLMENT CONFIRMATION',
		message: `You are officially enrolled in ${programCode}, Year ${yearLevel}, Section ${section}. Your subjects and enrollment details are now available in your student portal.`,
		steps: [
			'Sign in and review your enrolled subjects and academic details.',
			"Contact the Registrar's Office if any enrollment information needs to be corrected."
		],
		note: 'Keep this confirmation for your reference. Your student portal contains your current enrollment and enrollment history.'
	});
}

export function createEnrollmentDroppedEmail(
	name: string,
	schoolYearStart: number,
	semester: number,
	url?: string
) {
	return renderAcademicEmail({
		type: 'enrollment_dropped',
		name,
		schoolYearStart,
		semester,
		url,
		title: 'Your enrollment has been dropped',
		category: 'ENROLLMENT UPDATE',
		message:
			'Your enrollment for this term has been marked as dropped by the Registrar or an administrator. It is no longer active.',
		steps: [
			'Review the dropped enrollment and its subjects in your enrollment history.',
			"Contact the Registrar's Office if you have questions or would like to enroll again."
		],
		note: 'Your enrollment record and subject history have been retained. Reenrollment can use the same term and subjects.'
	});
}

export function createEnrollmentChangeEmail({
	kind,
	name,
	schoolYearStart,
	semester,
	programCode,
	yearLevel,
	section,
	reason,
	url
}: {
	kind: 'corrected' | 'voided' | 'reopened';
	name: string;
	schoolYearStart: number;
	semester: number;
	programCode: string;
	yearLevel: number;
	section: string;
	reason: string;
	url?: string;
}) {
	const updates = {
		corrected: {
			type: 'enrollment_corrected',
			title: 'Your enrollment has been corrected',
			message:
				'The Registrar or an administrator has corrected your enrollment details. Please review your updated academic details and subjects.',
			steps: [
				'Sign in and review your corrected enrollment details, subjects, and any recorded grades.',
				"Contact the Registrar's Office if any information still needs correction."
			],
			note: 'Your student portal contains the updated enrollment record.'
		},
		voided: {
			type: 'enrollment_voided',
			title: 'Your enrollment has been voided',
			message:
				'The Registrar or an administrator has voided this enrollment because it was recorded in error. It is excluded from your active academic record and enrollment requirements; its history has been retained for reference.',
			steps: [
				'Review the voided enrollment and the reason below.',
				"Contact the Registrar's Office to confirm your correct enrollment or arrange enrollment if needed."
			],
			note: 'A voided enrollment does not represent withdrawal from classes.'
		},
		reopened: {
			type: 'enrollment_reopened',
			title: 'Your enrollment has been reopened for correction',
			message:
				'An administrator has reopened this enrollment for correction. Its grades are under review and are no longer finalized.',
			steps: [
				'Review your enrollment and the reason below. Grades may change while corrections are in progress.',
				"Wait for a new grade finalization notice or contact the Registrar's Office with questions."
			],
			note: 'Enrollment requirements will be checked again after corrections and grade finalization.'
		}
	} satisfies Record<
		typeof kind,
		{ type: EmailEventType; title: string; message: string; steps: string[]; note: string }
	>;
	const update = updates[kind];

	return renderAcademicEmail({
		...update,
		name,
		schoolYearStart,
		semester,
		url,
		category: 'ENROLLMENT UPDATE',
		message: `${update.message} Program: ${programCode}, Year ${yearLevel}, Section ${section}. Reason: ${reason.trim()}`
	});
}
