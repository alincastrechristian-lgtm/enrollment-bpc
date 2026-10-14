import { MAX_ITEMS_PER_PAGE } from '#lib/components/Table/TableValues.js';
import { Role } from '#lib/Roles.js';
import { curriculum, filterProgramSchema, program } from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import { curriculumStatus } from '#lib/server/curriculum.js';
import { db } from '#lib/server/db/index.js';
import { schemaFilters } from '#lib/server/filters.js';
import { redirect } from '@sveltejs/kit';
import { and, asc, count, eq, inArray, like, or } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);

	const search = url.searchParams.get('q')?.trim() ?? '';
	const value = url.searchParams.get('status');

	const status: 'all' | 'active' | 'inactive' =
		value === 'active' || value === 'inactive' ? value : 'all';

	const parameters = new URLSearchParams(url.searchParams);
	if (!parameters.has('filter.isActive') && status !== 'all')
		parameters.set('filter.isActive', String(status === 'active'));

	const { filters, where: filterWhere } = schemaFilters(filterProgramSchema, program, parameters);
	const where = and(
		search ? or(like(program.name, `%${search}%`), like(program.code, `%${search}%`)) : undefined,
		filterWhere
	);

	const total = db.select({ count: count() }).from(program).where(where).get()!.count;
	const requested = Number(url.searchParams.get('page'));

	const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
	const lastPage = Math.max(1, Math.ceil(total / MAX_ITEMS_PER_PAGE));

	if (page > lastPage) {
		const destination = new URL(url);
		destination.searchParams.set('page', String(lastPage));
		redirect(302, destination.pathname + destination.search);
	}

	const records = await db.query.program.findMany({
		with: {
			activeCurriculum: true
		},
		where,
		orderBy: [asc(program.name), asc(program.id)],
		limit: MAX_ITEMS_PER_PAGE,
		offset: (page - 1) * MAX_ITEMS_PER_PAGE
	});

	const canManage = locals.user?.role === Role.ADMIN;

	const curricula =
		canManage && records.length
			? db
					.select({
						id: curriculum.id,
						name: curriculum.name,
						programCode: curriculum.programCode,
						publishedAt: curriculum.publishedAt,
						status: curriculumStatus
					})
					.from(curriculum)
					.innerJoin(program, eq(curriculum.programCode, program.code))
					.where(
						inArray(
							curriculum.programCode,
							records.map((record) => record.code)
						)
					)
					.orderBy(asc(curriculum.name), asc(curriculum.id))
					.all()
			: [];
	return { records, curricula, total, search, status, filters, canManage };
};
