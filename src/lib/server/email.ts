'use server';

import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { EmailApiType } from '../email';
import { escapeHtml } from './email-html';
import { getSystemSettings } from './settings';

async function sendSmtpEmail(
	settings: Awaited<ReturnType<typeof getSystemSettings>>,
	to: string,
	subject: string,
	text: string,
	html?: string
): Promise<boolean> {
	try {
		if (
			!settings.smtpHost ||
			!settings.smtpPort ||
			!settings.senderEmail ||
			!settings.senderName ||
			!settings.senderPassword
		) {
			console.error('Incomplete SMTP settings');
			return false;
		}

		// Create a transporter using the test account
		const transporter = nodemailer.createTransport({
			host: settings.smtpHost,
			port: settings.smtpPort,
			secure: settings.smtpPort === 465,
			requireTLS: true,
			auth: {
				user: settings.senderEmail, // Your Gmail address
				pass: settings.senderPassword // The 16-character App Password
			}
		});

		const info = await transporter.sendMail({
			from: `"${settings.senderName}" <${settings.senderEmail}>`,
			to: to,
			subject: subject,
			text: text,
			html: html ?? `<p>${escapeHtml(text).replace(/\n/g, '<br />')}</p>`
		});

		if (info.accepted.length > 0) {
			console.log('Email sent successfully! Preview URL:', nodemailer.getTestMessageUrl(info));
			return true;
		} else {
			console.error('Email failed to send:', info);
			return false;
		}
	} catch (error) {
		console.error('Error sending email:', error);
		return false;
	}
}

async function sendResendEmail(
	settings: Awaited<ReturnType<typeof getSystemSettings>>,
	to: string,
	subject: string,
	text: string,
	html?: string
): Promise<boolean> {
	try {
		if (!settings.resendApiKey || !settings.senderEmail || !settings.senderName) {
			console.error('Incomplete Resend settings');
			return false;
		}

		const resend = new Resend(settings.resendApiKey);

		const { data, error } = await resend.emails.send({
			from: `"${settings.senderName}" <${settings.senderEmail}>`,
			to,
			subject,
			text,
			html: html ?? `<p>${escapeHtml(text).replace(/\n/g, '<br />')}</p>`
		});

		if (error) {
			console.error('Resend failed to send email:', error.message);
			return false;
		}
		return Boolean(data?.id);
	} catch (error) {
		console.error('Error sending email:', error);
		return false;
	}
}

export async function sendEmail(
	to: string,
	subject: string,
	text: string,
	html?: string
): Promise<boolean> {
	try {
		const settings = await getSystemSettings();

		if ((settings.emailApiType ?? EmailApiType.SMTP) === EmailApiType.SMTP) {
			return await sendSmtpEmail(settings, to, subject, text, html);
		} else if (settings.emailApiType === EmailApiType.RESEND) {
			return await sendResendEmail(settings, to, subject, text, html);
		} else {
			console.error('Unknown email API type:', settings.emailApiType);
			return false;
		}
	} catch (error) {
		console.error('Error sending email:', error);
		return false;
	}
}
