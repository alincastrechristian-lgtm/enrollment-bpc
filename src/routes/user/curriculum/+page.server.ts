import { MAX_ITEMS_PER_PAGE } from '#lib/components/Table/TableValues.js';
import { Role } from '#lib/Roles.js';
import { curriculum, curriculumSubject, filterCurriculumSchema, program } from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import {
	curriculumStatus,
	getCurriculum,
	getCurrentStudentCurriculumId
} from '#lib/server/curriculum.js';
import { db } from '#lib/server/db/index.js';
import { schemaFilters } from '#lib/server/filters.js';
import { redirect } from '@sveltejs/kit';
import { and, asc, count, eq, like, or, sum } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR, Role.STUDENT]);
	if (locals.user.role === Role.STUDENT) {
		const curriculumId = getCurrentStudentCurriculumId(locals.user.id);
		return {
			isStudent: true,
			studentCurriculum: curriculumId ? getCurriculum(curriculumId) : null,
			records: [],
			total: 0,
			search: '',
			status: 'all' as const,
			filters: {},
			canManage: false
		};
	}
	const search = url.searchParams.get('q')?.trim() ?? '';
	const value = url.searchParams.get('status');
	const status =
		value === 'draft' || value === 'inactive' || value === 'active' || value === 'archived'
			? value
			: 'all';
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
		status !== 'all' ? eq(curriculumStatus, status) : undefined
	);
	const total = db
		.select({ count: count() })
		.from(curriculum)
		.innerJoin(program, eq(curriculum.programCode, program.code))
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
			archivedAt: curriculum.archivedAt,
			isActive: curriculum.isActive,
			status: curriculumStatus,
			programName: program.name,
			programCode: program.code,
			subjectCount: count(curriculumSubject.id),
			totalUnits: sum(curriculumSubject.units)
		})
		.from(curriculum)
		.innerJoin(program, eq(curriculum.programCode, program.code))
		.leftJoin(curriculumSubject, eq(curriculumSubject.curriculumId, curriculum.id))
		.where(where)
		.groupBy(curriculum.id, program.id)
		.orderBy(asc(program.code), asc(curriculum.name), asc(curriculum.id))
		.limit(MAX_ITEMS_PER_PAGE)
		.offset((page - 1) * MAX_ITEMS_PER_PAGE)
		.all()
		.map((record) => ({
			...record,
			totalUnits: Number(record.totalUnits ?? 0)
		}));
	return {
		records,
		total,
		search,
		status,
		filters,
		canManage: locals.user.role === Role.ADMIN,
		isStudent: false,
		studentCurriculum: null
	};
};
