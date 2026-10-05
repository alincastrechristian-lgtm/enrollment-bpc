'use server';

import nodemailer from 'nodemailer';
import { getSystemSettings } from './settings';

function escapeHtml(input: string): string {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
	try {
		const settings = await getSystemSettings();

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
			html: `<p>${escapeHtml(text).replace(/\n/g, '<br />')}</p>`
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
