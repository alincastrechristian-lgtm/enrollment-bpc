import { Role } from '#lib/Roles.js';
import { applicant, enrollment, enrollmentSubject, studentData, user } from '#lib/schema.js';
import { auth, validateUser } from '#lib/server/auth.js';
import { enrollStudentSchema, getEnrollmentPlan } from '#lib/server/enrollment.js';
import { command, getRequestEvent } from '$app/server';
import { error, isHttpError } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { prettifyError, z } from 'zod';
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
		error(400, err instanceof Error ? err.message : 'Failed to send account setup email.');
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

// Auth is asynchronous; callers handle database writes and invitations separately.
async function createUser(data: CreateUserSchema, role: Role, headers: Headers) {
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
		error(400, cause instanceof Error ? cause.message : 'Email already exists or is invalid.');
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

export const enrollStudent = command(enrollStudentSchema, async (data) => {
	const { locals, request } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);

	// Use stored applicant identity and reject invalid enrollment details before creating an account.
	const initial = getEnrollmentPlan(db, data);
	const details = createUserSchema.safeParse({
		name: initial.applicant.name,
		email: initial.applicant.email
	});
	if (!details.success) error(400, prettifyError(details.error));

	// Auth is asynchronous, so it must run outside better-sqlite3's synchronous transaction.
	const createdUser = await createUser(details.data, Role.STUDENT, request.headers);
	let enrolled: { studentId: string; enrollmentId: string };

	try {
		// Applicant link, student record, enrollment, and subject records commit together.
		enrolled = db.transaction((tx) => {
			// Link only if applicant details and documents still match the initial check.
			const original = initial.applicant;
			const linked = tx
				.update(applicant)
				.set({ userId: createdUser.id })
				.where(
					and(
						eq(applicant.id, original.id),
						isNull(applicant.userId),
						eq(applicant.name, original.name),
						eq(applicant.email, original.email),
						eq(applicant.applicationId, original.applicationId),
						eq(applicant.programCode, original.programCode),
						eq(applicant.yearLevel, original.yearLevel),
						eq(applicant.hasBirthCertificate, true),
						eq(applicant.hasForm138, true),
						eq(applicant.hasGoodMoral, true),
						eq(applicant.hasPicture, true)
					)
				)
				.run();
			if (!linked.changes)
				error(409, 'Applicant changed during enrollment. Refresh and try again.');

			// Curriculum and subject state may have changed while awaiting account creation.
			const plan = getEnrollmentPlan(tx, data, createdUser.id);
			if (plan.curriculum.id !== initial.curriculum.id) {
				error(409, 'Active curriculum changed during enrollment. Refresh and try again.');
			}

			// The applicant's application number becomes the student number.
			const studentId = original.applicationId;
			tx.insert(studentData)
				.values({ studentId, userId: createdUser.id, applicantId: original.id })
				.run();

			const result = tx
				.insert(enrollment)
				.values({
					studentId,
					curriculumId: plan.curriculum.id,
					section: data.section,
					schoolYearStart: data.schoolYearStart,
					semester: data.semester,
					yearLevel: data.yearLevel,
					status: 'pending',
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
						addedBy: locals.user!.id
					}))
				)
				.run();

			// Assign the current enrollment only after its record and subjects exist.
			tx.update(studentData)
				.set({ currentEnrollmentId: result.id })
				.where(eq(studentData.studentId, studentId))
				.run();

			return { studentId, enrollmentId: result.id };
		});
	} catch (cause) {
		try {
			// Transaction rolled back all links; compensate only this request's auth account.
			db.delete(user).where(eq(user.id, createdUser.id)).run();
		} catch (cleanupError) {
			console.error('Enrollment account cleanup failed:', createdUser.id, cleanupError);
			error(
				500,
				'Enrollment failed and the new account could not be removed. Contact an administrator.'
			);
		}

		// Keep expected validation/conflict responses; report unexpected database failures as 500.
		if (isHttpError(cause)) throw cause;
		console.error('Failed to enroll student:', cause);
		error(500, 'Failed to enroll student. Please try again.');
	}

	// Send only after commit. Email failure keeps enrollment intact so invitation can be resent.
	let invitationSent = true;
	try {
		await sendPasswordResetLink(createdUser.email, request.headers);
	} catch {
		invitationSent = false;
	}

	return {
		success: true,
		invitationSent,
		userId: createdUser.id,
		email: createdUser.email,
		...enrolled
	};
});
