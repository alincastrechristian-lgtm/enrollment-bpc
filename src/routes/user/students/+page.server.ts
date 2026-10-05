import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { user } from '#lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

export async function load({ locals }) {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);

	const users = await db.query.user.findMany({
		where: eq(user.role, Role.STUDENT),
		with: {
			applicant: true
		}
	});

	return {
		users
	};
}
