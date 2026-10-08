import { MAX_ITEMS_PER_PAGE } from '#lib/components/Table/TableValues.js';
import { Role } from '#lib/Roles.js';
import { subject, filterSubjectSchema } from '#lib/schema.js';
import { schemaFilters } from '#lib/server/filters.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { redirect } from '@sveltejs/kit';
import { and, asc, count, like, or } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	const search = url.searchParams.get('q')?.trim() ?? '';
	const value = url.searchParams.get('status');
	const status: 'all' | 'active' | 'inactive' =
		value === 'active' || value === 'inactive' ? value : 'all';
	const parameters = new URLSearchParams(url.searchParams);
	if (!parameters.has('filter.isActive') && status !== 'all')
		parameters.set('filter.isActive', String(status === 'active'));
	const { filters, where: filterWhere } = schemaFilters(filterSubjectSchema, subject, parameters);
	const where = and(
		search ? or(like(subject.name, `%${search}%`), like(subject.code, `%${search}%`)) : undefined,
		filterWhere
	);
	const total = db.select({ count: count() }).from(subject).where(where).get()!.count;
	const requested = Number(url.searchParams.get('page'));
	const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
	const lastPage = Math.max(1, Math.ceil(total / MAX_ITEMS_PER_PAGE));
	if (page > lastPage) {
		const destination = new URL(url);
		destination.searchParams.set('page', String(lastPage));
		redirect(302, destination.pathname + destination.search);
	}
	const records = db
		.select()
		.from(subject)
		.where(where)
		.orderBy(asc(subject.name), asc(subject.id))
		.limit(MAX_ITEMS_PER_PAGE)
		.offset((page - 1) * MAX_ITEMS_PER_PAGE)
		.all();
	return { records, total, search, status, filters, canManage: locals.user?.role === Role.ADMIN };
};
