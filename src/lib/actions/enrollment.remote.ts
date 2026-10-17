import { command, getRequestEvent } from '$app/server';
import { ORIGIN } from '$app/env/private';
import { resolve } from '$app/paths';
import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { sendEmail } from '#lib/server/email.js';
import {
	correctEnrollmentSchema,
	enrollmentChangeSchema,
	correctStudentEnrollment,
	voidStudentEnrollment,
	reopenStudentEnrollment
} from '#lib/server/enrollment-corrections.js';
import { error, isHttpError } from '@sveltejs/kit';

async function notify(change: ReturnType<typeof correctStudentEnrollment>) {
	let notificationSent = false;
	try {
		const { subject, text, html } = change.message;
		notificationSent = await sendEmail(change.user.email, subject, text, html);
	} catch (cause) {
		console.error('Enrollment change email failed:', cause);
	}
	return {
		success: true,
		userId: change.user.id,
		enrollmentId: change.enrollmentId,
		notificationSent
	};
}

function applyChange<T>(operation: () => T): T {
	try {
		return operation();
	} catch (cause) {
		if (isHttpError(cause)) throw cause;
		console.error('Enrollment change failed:', cause);
		error(500, 'Could not update enrollment. Reload and try again.');
	}
}

export const correctEnrollment = command(correctEnrollmentSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	return notify(
		applyChange(() =>
			correctStudentEnrollment(
				db,
				data,
				locals.user,
				new URL(resolve('/user/enrollment'), ORIGIN).href
			)
		)
	);
});
export const voidEnrollment = command(enrollmentChangeSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	return notify(
		applyChange(() =>
			voidStudentEnrollment(
				db,
				data,
				locals.user,
				new URL(resolve('/user/enrollment'), ORIGIN).href
			)
		)
	);
});
export const reopenEnrollment = command(enrollmentChangeSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);
	return notify(
		applyChange(() =>
			reopenStudentEnrollment(
				db,
				data,
				locals.user,
				new URL(resolve('/user/enrollment'), ORIGIN).href
			)
		)
	);
});
