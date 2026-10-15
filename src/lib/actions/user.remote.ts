import { Role } from '#lib/Roles.js';
import { createStudentSchema } from '#lib/students.js';
import { enrollment, enrollmentSubject, studentData, studentSequence, user } from '#lib/schema.js';
import { auth, validateUser } from '#lib/server/auth.js';
import { enrollStudentSchema, getEnrollmentPlan } from '#lib/server/enrollment.js';
import { command, getRequestEvent } from '$app/server';
import { error, isHttpError } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../server/db';

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

function rejectExistingEmail(email: string) {
	const existing = db
		.select({ role: user.role })
		.from(user)
		.where(sql`lower(${user.email}) = ${email}`)
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
					contactNumber: data.contactNumber
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

export const enrollStudent = command(enrollStudentSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	try {
		return db.transaction((tx) => {
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
			return {
				success: true,
				userId: plan.user.id,
				studentId: plan.student.studentId,
				enrollmentId: result.id
			};
		});
	} catch (cause) {
		if (isHttpError(cause)) throw cause;
		console.error('Enrollment failed:', cause);
		error(500, 'Failed to enroll student. Please try again.');
	}
});
