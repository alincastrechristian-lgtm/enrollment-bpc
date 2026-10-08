import { MAX_ITEMS_PER_PAGE } from '#lib/components/Table/TableValues.js';
import { Role } from '#lib/Roles.js';
import { user, filterUserSchema } from '#lib/schema.js';
import { schemaFilters } from '#lib/server/filters.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { redirect } from '@sveltejs/kit';
import { and, count, eq, like, or } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);

	const search = url.searchParams.get('q')?.trim() ?? '';
	const value = url.searchParams.get('status');
	const status = value === 'verified' || value === 'pending' ? value : 'all';
	const parameters = new URLSearchParams(url.searchParams);
	if (!parameters.has('filter.setupComplete') && status !== 'all')
		parameters.set('filter.setupComplete', String(status === 'verified'));
	const { filters, where: filterWhere } = schemaFilters(filterUserSchema, user, parameters);
	const where = and(
		eq(user.role, Role.STUDENT),
		search
			? or(
					like(user.name, `%${search}%`),
					like(user.email, `%${search}%`),
					like(user.id, `%${search}%`)
				)
			: undefined,
		filterWhere
	);
	const total = db.select({ count: count() }).from(user).where(where).get()!.count;
	const requested = Number(url.searchParams.get('page'));
	const currentPage = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
	const lastPage = Math.max(1, Math.ceil(total / MAX_ITEMS_PER_PAGE));
	if (currentPage > lastPage) {
		const destination = new URL(url);
		destination.searchParams.set('page', String(lastPage));
		redirect(302, destination.pathname + destination.search);
	}

	const offset = (currentPage - 1) * MAX_ITEMS_PER_PAGE;

	const users = await db.query.user.findMany({
		limit: MAX_ITEMS_PER_PAGE,
		offset,
		where,
		with: {
			applicant: true
		}
	});

	return {
		users,
		total,
		search,
		status,
		filters
	};
};
