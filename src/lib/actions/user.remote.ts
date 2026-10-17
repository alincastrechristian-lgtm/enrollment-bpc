import { Role } from '#lib/Roles.js';
import {
	canDeleteStudentAccount,
	createStudentSchema,
	updateStudentSchema
} from '#lib/students.js';
import {
	enrollment,
	enrollmentSubject,
	studentData,
	studentSequence,
	session,
	user,
	verification
} from '#lib/schema.js';
import { auth, validateUser } from '#lib/server/auth.js';
import { enrollStudentSchema, getEnrollmentPlan } from '#lib/server/enrollment.js';
import { sendEmail } from '#lib/server/email.js';
import { createEnrollmentConfirmationEmail } from '#lib/server/email-templates.js';
import { recordNotification } from '#lib/server/notifications.js';
import { command, getRequestEvent } from '$app/server';
import { ORIGIN } from '$app/env/private';
import { resolve } from '$app/paths';
import { error, isHttpError } from '@sveltejs/kit';
import { and, eq, like, ne, sql } from 'drizzle-orm';
import { isAPIError } from 'better-auth/api';
import { z } from 'zod';
import { db } from '../server/db';

export const deleteStudent = command(z.object({ userId: z.string().min(1) }), ({ userId }) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	try {
		return db.transaction(
			(tx) => {
				const target = tx
					.select({
						setupComplete: user.setupComplete,
						studentId: studentData.studentId,
						currentEnrollmentId: studentData.currentEnrollmentId
					})
					.from(user)
					.leftJoin(studentData, eq(studentData.userId, user.id))
					.where(and(eq(user.id, userId), eq(user.role, Role.STUDENT)))
					.get();
				if (!target) error(404, 'Student not found.');
				const hasEnrollment = !!(
					target.studentId &&
					tx
						.select({ id: enrollment.id })
						.from(enrollment)
						.where(eq(enrollment.studentId, target.studentId))
						.get()
				);
				if (!canDeleteStudentAccount({ ...target, hasEnrollment }))
					error(
						409,
						'Only students with incomplete account setup and no enrollment history can be deleted.'
					);

				// Keep eligibility checks and deletion atomic against enrollment or setup completion.
				tx.delete(studentData).where(eq(studentData.userId, userId)).run();
				tx.delete(verification)
					.where(
						and(eq(verification.value, userId), like(verification.identifier, 'reset-password:%'))
					)
					.run();
				// Auth accounts, sessions, two-factor data and addressed notifications cascade with the user.
				tx.delete(user).where(eq(user.id, userId)).run();
				return { success: true };
			},
			{ behavior: 'immediate' }
		);
	} catch (cause) {
		if (isHttpError(cause)) throw cause;
		console.error('Student deletion failed:', cause);
		error(500, 'Failed to delete student. Please try again.');
	}
});

export const deleteRegistrar = command(z.object({ userId: z.string().min(1) }), ({ userId }) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);
	try {
		return db.transaction(
			(tx) => {
				const target = tx
					.select({ id: user.id })
					.from(user)
					.where(and(eq(user.id, userId), eq(user.role, Role.REGISTRAR)))
					.get();
				if (!target) error(404, 'Registrar account not found.');

				tx.delete(verification)
					.where(
						and(eq(verification.value, userId), like(verification.identifier, 'reset-password:%'))
					)
					.run();
				// Auth data cascades; academic records and student notifications keep nullable author links.
				tx.delete(user).where(eq(user.id, userId)).run();
				return { success: true };
			},
			{ behavior: 'immediate' }
		);
	} catch (cause) {
		if (isHttpError(cause)) throw cause;
		console.error('Registrar deletion failed:', cause);
		error(500, 'Failed to delete registrar. Please try again.');
	}
});

export const setRegistrarDisabled = command(
	z.object({ userId: z.string().min(1), disabled: z.boolean() }),
	async ({ userId, disabled }) => {
		const { locals, request } = getRequestEvent();
		validateUser(locals, [Role.ADMIN]);
		const target = db
			.select({ id: user.id })
			.from(user)
			.where(and(eq(user.id, userId), eq(user.role, Role.REGISTRAR)))
			.get();
		if (!target) error(404, 'Registrar account not found.');
		try {
			if (disabled) {
				await auth.api.banUser({
					body: { userId, banReason: 'Registrar account disabled by an administrator.' },
					headers: request.headers
				});
			} else {
				await auth.api.unbanUser({ body: { userId }, headers: request.headers });
			}
			return { success: true };
		} catch (cause) {
			if (isAPIError(cause) && (cause.statusCode === 401 || cause.statusCode === 403))
				error(cause.statusCode, 'You do not have permission to change registrar access.');
			if (isAPIError(cause) && cause.statusCode === 404) error(404, 'Registrar account not found.');
			console.error('Registrar access update failed:', cause);
			error(500, 'Failed to update registrar access. Please try again.');
		}
	}
);

export const revokeAccountSessions = command(
	z.object({ userId: z.string().min(1) }),
	async ({ userId }) => {
		const { locals, request } = getRequestEvent();
		validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
		const target = db.select({ role: user.role }).from(user).where(eq(user.id, userId)).get();
		if (!target || (target.role !== Role.STUDENT && target.role !== Role.REGISTRAR))
			error(404, 'Student or registrar account not found.');
		if (target.role === Role.REGISTRAR && locals.user.role !== Role.ADMIN)
			error(403, 'Only administrators can revoke registrar sessions.');
		try {
			await auth.api.revokeUserSessions({ body: { userId }, headers: request.headers });
			return { success: true };
		} catch (cause) {
			if (isAPIError(cause) && (cause.statusCode === 401 || cause.statusCode === 403))
				error(cause.statusCode, 'You do not have permission to revoke these sessions.');
			console.error('Account session revocation failed:', cause);
			error(500, 'Failed to revoke sessions. Please try again.');
		}
	}
);

async function sendPasswordResetLink(email: string, headers: Headers) {
	try {
		await auth.api.requestPasswordReset({
			body: {
				email,
				redirectTo: '/first-login'
			},
			headers: headers
		});
	} catch (err) {
		console.error('Account setup email failed:', err);
		error(502, 'Failed to send account setup email. Please try again.');
	}
}

export const resendMagicLink = command(
	z.object({
		email: z.email()
	}),
	async ({ email }) => {
		const { locals, request } = getRequestEvent();
		validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);

		if (!email) {
			error(400, 'Email is required.');
		}

		await sendPasswordResetLink(email, request.headers);

		return {
			success: true
		};
	}
);

const createUserSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2, 'Name must be at least 2 characters')
		.max(100, 'Name must be at most 100 characters'),

	email: z.email('Please enter a valid email address').trim().toLowerCase()
});
type CreateUserSchema = z.infer<typeof createUserSchema>;

export type CreateUserResult = {
	success: boolean;
	invitationSent: boolean;
	userId: string;
	email: string;
};

function rejectExistingEmail(email: string, excludeUserId?: string) {
	const existing = db
		.select({ role: user.role })
		.from(user)
		.where(
			and(
				sql`lower(${user.email}) = ${email}`,
				excludeUserId ? ne(user.id, excludeUserId) : undefined
			)
		)
		.get();
	if (!existing) return;
	const message =
		existing.role === Role.STUDENT
			? 'A student account already exists with this email.'
			: existing.role === Role.REGISTRAR
				? 'A registrar account already exists with this email.'
				: existing.role === Role.ADMIN
					? 'An administrator account already exists with this email.'
					: 'An account already exists with this email.';
	error(409, message);
}

// Auth is asynchronous; callers handle database writes and invitations separately.
async function createUser(data: CreateUserSchema, role: Role, headers: Headers) {
	rejectExistingEmail(data.email);
	try {
		const result = await auth.api.createUser({
			body: {
				...data,
				role: role === Role.STUDENT ? undefined : role
			},
			headers
		});
		return result.user;
	} catch (cause) {
		// A competing request may have registered the email after the first check.
		rejectExistingEmail(data.email);
		console.error('Account creation failed:', cause);
		error(500, 'Failed to create account. Please try again.');
	}
}

export const createRegistrar = command(
	createUserSchema,
	async (data): Promise<CreateUserResult> => {
		const { locals, request } = getRequestEvent();
		validateUser(locals, [Role.ADMIN]);

		const createdUser = await createUser(data, Role.REGISTRAR, request.headers);
		await sendPasswordResetLink(createdUser.email, request.headers);

		return {
			success: true,
			invitationSent: true,
			userId: createdUser.id,
			email: createdUser.email
		};
	}
);

export const createStudent = command(createStudentSchema, async (data) => {
	const { locals, request } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	const createdUser = await createUser(
		{ name: data.name, email: data.email },
		Role.STUDENT,
		request.headers
	);
	let studentId: string;
	try {
		studentId = db.transaction((tx) => {
			const parts = new Intl.DateTimeFormat('en-US', {
				timeZone: 'Asia/Manila',
				year: 'numeric',
				month: '2-digit'
			}).formatToParts(new Date());
			const year = Number(parts.find((part) => part.type === 'year')!.value);
			const month = Number(parts.find((part) => part.type === 'month')!.value);
			const sequence = tx
				.insert(studentSequence)
				.values({ year, month, lastNumber: 1 })
				.onConflictDoUpdate({
					target: [studentSequence.year, studentSequence.month],
					set: { lastNumber: sql`${studentSequence.lastNumber} + 1` },
					setWhere: sql`${studentSequence.lastNumber} < 999999`
				})
				.returning({ lastNumber: studentSequence.lastNumber })
				.get();
			if (!sequence) error(409, 'Monthly student number limit reached.');
			const id =
				'MA-' +
				year +
				String(month).padStart(2, '0') +
				'-' +
				String(sequence.lastNumber).padStart(6, '0');
			tx.insert(studentData)
				.values({
					studentId: id,
					userId: createdUser.id,
					address: data.address,
					contactNumber: data.contactNumber,
					birthDate: data.birthDate,
					sex: data.sex
				})
				.run();
			return id;
		});
	} catch (cause) {
		try {
			db.delete(user).where(eq(user.id, createdUser.id)).run();
		} catch (cleanupError) {
			console.error('Student account cleanup failed:', cleanupError);
			error(500, 'Student creation failed. Contact an administrator before trying again.');
		}
		if (isHttpError(cause)) throw cause;
		console.error('Student creation failed:', cause);
		error(500, 'Failed to create student. Please try again.');
	}
	// The student exists even if email delivery fails; staff can resend the setup link.
	let invitationSent = true;
	try {
		await sendPasswordResetLink(createdUser.email, request.headers);
	} catch {
		invitationSent = false;
	}
	return {
		success: true,
		userId: createdUser.id,
		email: createdUser.email,
		studentId,
		invitationSent
	};
});

export const updateStudent = command(updateStudentSchema, (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);
	try {
		return db.transaction(
			(tx) => {
				const current = tx
					.select({
						name: user.name,
						email: user.email,
						address: studentData.address,
						contactNumber: studentData.contactNumber,
						birthDate: studentData.birthDate,
						sex: studentData.sex
					})
					.from(user)
					.innerJoin(studentData, eq(studentData.userId, user.id))
					.where(and(eq(user.id, data.userId), eq(user.role, Role.STUDENT)))
					.get();
				if (!current) error(404, 'Student not found.');
				if (
					Object.keys(current).some((field) => {
						const key = field as keyof typeof current;
						return current[key] !== data.original[key];
					})
				)
					error(409, 'Student information changed. Reload the record before saving again.');
				rejectExistingEmail(data.email, data.userId);
				const emailChanged = current.email.toLowerCase() !== data.email;
				// These fields span auth and academic tables: commit them together.
				tx.update(user)
					.set({
						name: data.name,
						email: data.email,
						...(emailChanged ? { emailVerified: false } : {})
					})
					.where(and(eq(user.id, data.userId), eq(user.role, Role.STUDENT)))
					.run();
				tx.update(studentData)
					.set({
						address: data.address,
						contactNumber: data.contactNumber,
						birthDate: data.birthDate,
						sex: data.sex
					})
					.where(eq(studentData.userId, data.userId))
					.run();
				if (emailChanged) {
					// Better Auth uses this database without a cookie cache or secondary store.
					// Remove sessions and outstanding reset/setup links atomically with the new email.
					tx.delete(session).where(eq(session.userId, data.userId)).run();
					tx.delete(verification)
						.where(
							and(
								eq(verification.value, data.userId),
								like(verification.identifier, 'reset-password:%')
							)
						)
						.run();
				}
				return { success: true, userId: data.userId, emailChanged };
			},
			{ behavior: 'immediate' }
		);
	} catch (cause) {
		if (isHttpError(cause)) throw cause;
		console.error('Student information update failed:', cause);
		error(500, 'Failed to update student information. Please try again.');
	}
});

export const enrollStudent = command(enrollStudentSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	try {
		const { recipient, message, ...result } = db.transaction((tx) => {
			const plan = getEnrollmentPlan(tx, data);
			const result = tx
				.insert(enrollment)
				.values({
					studentId: plan.student.studentId,
					curriculumId: plan.curriculum.id,
					section: data.section,
					schoolYearStart: data.schoolYearStart,
					semester: data.semester,
					yearLevel: data.yearLevel,
					status: 'enrolled',
					enrolledAt: new Date()
				})
				.returning({ id: enrollment.id })
				.get();
			if (!result) error(500, 'Failed to create enrollment.');
			tx.insert(enrollmentSubject)
				.values(
					plan.subjects.map((entry) => ({
						...entry,
						enrollmentId: result.id,
						addedBy: locals.user.id
					}))
				)
				.run();
			tx.update(studentData)
				.set({ currentEnrollmentId: result.id })
				.where(eq(studentData.studentId, plan.student.studentId))
				.run();
			const message = createEnrollmentConfirmationEmail({
				name: plan.user.name,
				schoolYearStart: data.schoolYearStart,
				semester: data.semester,
				programCode: data.programCode,
				yearLevel: data.yearLevel,
				section: data.section,
				url: new URL(resolve('/user/enrollment'), ORIGIN).href
			});
			recordNotification(tx, {
				...message.notification,
				recipientId: plan.user.id,
				actorId: locals.user.id,
				enrollmentId: result.id
			});
			return {
				recipient: plan.user,
				message,
				success: true,
				userId: plan.user.id,
				studentId: plan.student.studentId,
				enrollmentId: result.id
			};
		});
		// Email delivery happens only after enrollment, subjects and the current link commit.
		let notificationSent = false;
		try {
			notificationSent = await sendEmail(
				recipient.email,
				message.subject,
				message.text,
				message.html
			);
		} catch (cause) {
			console.error('Enrollment confirmation email failed:', cause);
		}
		return { ...result, notificationSent };
	} catch (cause) {
		if (isHttpError(cause)) throw cause;
		console.error('Enrollment failed:', cause);
		error(500, 'Failed to enroll student. Please try again.');
	}
});
