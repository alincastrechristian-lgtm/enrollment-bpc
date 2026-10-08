import { MAX_ITEMS_PER_PAGE } from '#lib/components/Table/TableValues.js';
import { Role } from '#lib/Roles.js';
import { curriculum, curriculumSubject, filterCurriculumSchema, program } from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { schemaFilters } from '#lib/server/filters.js';
import { redirect } from '@sveltejs/kit';
import { and, asc, count, eq, isNotNull, isNull, like, or, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	const search = url.searchParams.get('q')?.trim() ?? '';
	const value = url.searchParams.get('status');
	const status = value === 'draft' || value === 'published' ? value : 'all';
	const { filters, where: filterWhere } = schemaFilters(
		filterCurriculumSchema,
		curriculum,
		url.searchParams
	);
	const where = and(
		filterWhere,
		search
			? or(
					like(curriculum.name, `%${search}%`),
					like(program.name, `%${search}%`),
					like(program.code, `%${search}%`)
				)
			: undefined,
		status === 'draft'
			? isNull(curriculum.publishedAt)
			: status === 'published'
				? isNotNull(curriculum.publishedAt)
				: undefined
	);
	const total = db
		.select({ count: count() })
		.from(curriculum)
		.innerJoin(program, eq(curriculum.programId, program.id))
		.where(where)
		.get()!.count;
	const requested = Number(url.searchParams.get('page'));
	const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
	const lastPage = Math.max(1, Math.ceil(total / MAX_ITEMS_PER_PAGE));
	if (page > lastPage) {
		const destination = new URL(url);
		destination.searchParams.set('page', String(lastPage));
		redirect(302, destination.pathname + destination.search);
	}
	const records = db
		.select({
			id: curriculum.id,
			name: curriculum.name,
			publishedAt: curriculum.publishedAt,
			isActive: curriculum.isActive,
			programName: program.name,
			programCode: program.code,
			subjectCount: sql<number>`(select count(*) from ${curriculumSubject} where ${curriculumSubject.curriculumId} = ${curriculum.id})`,
			totalUnits: sql<number>`coalesce((select sum(${curriculumSubject.units}) from ${curriculumSubject} where ${curriculumSubject.curriculumId} = ${curriculum.id}), 0)`
		})
		.from(curriculum)
		.innerJoin(program, eq(curriculum.programId, program.id))
		.where(where)
		.orderBy(asc(program.code), asc(curriculum.name), asc(curriculum.id))
		.limit(MAX_ITEMS_PER_PAGE)
		.offset((page - 1) * MAX_ITEMS_PER_PAGE)
		.all();
	return { records, total, search, status, filters, canManage: locals.user?.role === Role.ADMIN };
};
