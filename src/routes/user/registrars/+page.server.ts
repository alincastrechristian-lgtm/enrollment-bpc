import { MAX_ITEMS_PER_PAGE } from '#lib/components/Table/TableValues.js';
import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { user } from '#lib/server/db/schema.js';
import { count, eq } from 'drizzle-orm';

export async function load({ locals, url }) {
	validateUser(locals, [Role.ADMIN]);

	const value = Number(url.searchParams.get('page'));

	const currentPage = Number.isInteger(value) && value > 0 ? value : 1;

	const offset = (currentPage - 1) * MAX_ITEMS_PER_PAGE;

	const users = await db.query.user.findMany({
		limit: MAX_ITEMS_PER_PAGE,
		offset,
		orderBy: (user, { desc }) => [desc(user.name)],
		where: eq(user.role, Role.REGISTRAR)
	});

	const total = await db.select({ count: count() }).from(user).where(eq(user.role, Role.REGISTRAR));

	return {
		users,
		total: total[0].count
	};
}
