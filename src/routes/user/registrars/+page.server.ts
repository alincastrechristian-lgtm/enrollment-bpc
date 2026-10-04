import { type Actions } from '@sveltejs/kit';

import { Role } from '#lib/Roles.js';
import { auth, validateAction, validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { user } from '#lib/server/db/schema.js';
import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import z, { prettifyError } from 'zod';

export async function load({ locals }) {
	validateUser(locals, [Role.ADMIN]);

	const users = await db.select().from(user).where(eq(user.role, Role.REGISTRAR));

	return {
		users
	};
}

const createRegistrarSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2, 'Name must be at least 2 characters')
		.max(100, 'Name must be at most 100 characters'),

	email: z.email('Please enter a valid email address').trim().toLowerCase()
});

export const actions: Actions = {
	createRegistrar: async ({ request, locals }) => {
		const authFailure = validateAction(locals, [Role.ADMIN]);

		if (authFailure) {
			return authFailure;
		}

		const formData = await request.formData();

		const result = createRegistrarSchema.safeParse(Object.fromEntries(formData));

		if (!result.success) {
			return fail(400, {
				message: prettifyError(result.error)
			});
		}

		const { name, email } = result.data;

		try {
			await auth.api.createUser({
				body: {
					name,
					email
				},
				headers: request.headers
			});

			await db.update(user).set({ role: Role.REGISTRAR }).where(eq(user.email, email));
		} catch {
			return fail(400, {
				message: 'Email already exists or is invalid.'
			});
		}

		try {
			await auth.api.signInMagicLink({
				body: {
					email
				},
				headers: request.headers
			});
		} catch {
			return fail(400, {
				message: 'Failed to send magic link email.'
			});
		}

		return {
			success: true
		};
	}
};
