import { Role } from '#lib/Roles.js';
import { hasAllApplicantDocuments } from '#lib/applicants.js';
import { applicant, user, type Applicant } from '#lib/schema.js';
import { auth, validateUser } from '#lib/server/auth.js';
import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
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

async function createUser(
	data: CreateUserSchema,
	role: Role,
	headers: Headers,
	sourceApplicant?: Applicant
) {
	const { name, email } = data;

	const { user: createdUser } = await auth.api
		.createUser({
			body: {
				name,
				email,
				role: role === Role.STUDENT ? undefined : role // Registrar cannot set role for students, so we leave it undefined for students
			},
			headers
		})
		.catch((err) => {
			error(400, err instanceof Error ? err.message : 'Email already exists or is invalid.');
		});

	if (sourceApplicant) {
		try {
			const result = await db
				.update(applicant)
				.set({ userId: createdUser.id })
				.where(
					and(
						eq(applicant.id, sourceApplicant.id),
						isNull(applicant.userId),
						eq(applicant.name, sourceApplicant.name),
						eq(applicant.email, sourceApplicant.email),
						eq(applicant.hasBirthCertificate, true),
						eq(applicant.hasForm138, true),
						eq(applicant.hasGoodMoral, true),
						eq(applicant.hasPicture, true)
					)
				);
			if (result.changes === 0) {
				error(409, 'Applicant changed or already has a student account. Refresh and try again.');
			}
		} catch (err) {
			// Remove only the account created by this request if linking fails.
			await db.delete(user).where(eq(user.id, createdUser.id));
			throw err;
		}
	}

	try {
		await sendPasswordResetLink(email, headers);
	} catch (err) {
		if (!sourceApplicant) throw err;
		return { success: true, invitationSent: false };
	}

	return {
		success: true,
		invitationSent: true
	};
}

export const createRegistrar = command(createUserSchema, async (data) => {
	const { locals, request } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	return await createUser(data, Role.REGISTRAR, request.headers);
});

const createStudentSchema = z.union([
	z.object({ applicantId: z.string().trim().min(1, 'Applicant ID is required') }),
	createUserSchema.extend({ applicantId: z.never().optional() })
]);

export const createStudent = command(createStudentSchema, async (data) => {
	const { locals, request } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);

	if (data.applicantId !== undefined) {
		const record = await db.query.applicant.findFirst({
			where: eq(applicant.id, data.applicantId)
		});
		if (!record) error(404, 'Applicant not found.');
		if (record.userId) error(409, 'Applicant already has a student account.');
		if (!hasAllApplicantDocuments(record)) {
			error(400, 'All applicant documents must be received before creating a student account.');
		}
		const details = createUserSchema.safeParse({ name: record.name, email: record.email });
		if (!details.success) error(400, details.error.issues[0].message);
		return await createUser(details.data, Role.STUDENT, request.headers, record);
	}

	return await createUser(data, Role.STUDENT, request.headers);
});
