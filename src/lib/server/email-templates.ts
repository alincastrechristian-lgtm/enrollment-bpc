import { escapeHtml } from './email-html';
import { emailTheme as colors } from './email-theme';

const brand = 'BPC Enrollment System';

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
	url,
	expiresInSeconds,
	title,
	message,
	action,
	category,
	name
}: {
	url: string;
	expiresInSeconds: number;
	title: string;
	message: string;
	action: string;
	category: string;
	name?: string;
}) {
	const parsedUrl = new URL(url);
	if (
		!['https:', 'http:'].includes(parsedUrl.protocol) ||
		parsedUrl.username ||
		parsedUrl.password
	) {
		throw new Error('Email links must use HTTP or HTTPS without credentials');
	}
	const safeUrl = escapeHtml(url);
	const greeting = name?.trim() ? `Hello ${name.trim()},` : 'Hello,';
	const expiry = `This link expires in ${expiryLabel(expiresInSeconds)} and can only be used once.`;
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
	return { subject, text, html };
}

export function createMagicLinkEmail(url: string, expiresInSeconds: number) {
	return renderAuthEmail({
		url,
		expiresInSeconds,
		title: 'Sign in to your account',
		message:
			'Your secure sign-in link is ready. Use the button below to access your BPC Enrollment System account.',
		action: 'Sign in to your account',
		category: 'ACCOUNT ACCESS'
	});
}

export function createResetPasswordEmail(url: string, expiresInSeconds: number, name?: string) {
	return renderAuthEmail({
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
