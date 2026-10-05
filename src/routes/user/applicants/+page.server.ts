import { MAX_ITEMS_PER_PAGE } from '#lib/components/Table/TableValues.js';
import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { applicant } from '#lib/server/db/schema.js';
import { count } from 'drizzle-orm/sql/functions/aggregate';

export async function load({ locals, url }) {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);

	const value = Number(url.searchParams.get('page'));

	const currentPage = Number.isInteger(value) && value > 0 ? value : 1;

	const offset = (currentPage - 1) * MAX_ITEMS_PER_PAGE;

	const applicants = await db.query.applicant.findMany({
		limit: MAX_ITEMS_PER_PAGE,
		offset,
		orderBy: (applicant, { desc }) => [desc(applicant.dateApplied)]
	});

	const total = await db.select({ count: count() }).from(applicant);

	return {
		applicants,
		total: total[0].count
	};
}
