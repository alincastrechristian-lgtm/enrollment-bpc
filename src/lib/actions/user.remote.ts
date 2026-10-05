import { Role } from '#lib/Roles.js';
import { auth, validateUser } from '#lib/server/auth.js';
import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

async function sendMagicLink(email: string, headers: Headers) {
	try {
		await auth.api.signInMagicLink({
			body: {
				email
			},
			headers: headers
		});
	} catch (err) {
		error(400, err instanceof Error ? err.message : 'Failed to send magic link email.');
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

		await sendMagicLink(email, request.headers);

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

async function createUser(data: CreateUserSchema, role: Role, headers: Headers) {
	const { name, email } = data;

	try {
		await auth.api.createUser({
			body: {
				name,
				email,
				role: role === Role.STUDENT ? undefined : role // Registrar cannot set role for students, so we leave it undefined for students
			},
			headers
		});
	} catch (err) {
		error(400, err instanceof Error ? err.message : 'Email already exists or is invalid.');
	}

	await sendMagicLink(email, headers);

	return {
		success: true
	};
}

export const createRegistrar = command(createUserSchema, async (data) => {
	const { locals, request } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	return await createUser(data, Role.REGISTRAR, request.headers);
});

export const createStudent = command(createUserSchema, async (data) => {
	const { locals, request } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);

	return await createUser(data, Role.STUDENT, request.headers);
});
