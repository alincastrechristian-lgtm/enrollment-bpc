import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { applicant } from '#lib/server/db/schema.js';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm/sql/expressions/conditions';

export async function load({ locals, params }) {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);

	const result = await db.query.applicant.findFirst({
		where: eq(applicant.id, params.applicantId)
	});

	if (!result) {
		error(404, 'Applicant not found');
	}

	return {
		applicant: result
	};
}
