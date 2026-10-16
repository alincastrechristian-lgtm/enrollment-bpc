import { MAX_ITEMS_PER_PAGE } from '#lib/components/Table/TableValues.js';
import { Role } from '#lib/Roles.js';
import {
	curriculum,
	enrollment,
	filterUserSchema,
	filterStudentSchema,
	program,
	studentData,
	studentEnrollmentFilterSchema,
	user
} from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { schemaFilters } from '#lib/server/filters.js';
import { error, redirect } from '@sveltejs/kit';
import { and, asc, count, eq, inArray, isNull, isNotNull, like, or } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { canDeleteStudentAccount } from '#lib/students.js';

export const load: PageServerLoad = async ({ locals, url }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);

	const search = url.searchParams.get('q')?.trim() ?? '';
	const value = url.searchParams.get('status');
	const status = value === 'verified' || value === 'pending' ? value : 'all';
	const parameters = new URLSearchParams(url.searchParams);
	if (!parameters.has('filter.setupComplete') && status !== 'all')
		parameters.set('filter.setupComplete', String(status === 'verified'));
	const { filters, where: filterWhere } = schemaFilters(filterUserSchema, user, parameters);
	const academic = schemaFilters(studentEnrollmentFilterSchema, enrollment, parameters, {
		programCode: curriculum.programCode
	});
	const presence = filterStudentSchema.shape.hasCurrentEnrollment.safeParse(
		parameters.get('filter.hasCurrentEnrollment')?.trim() || undefined
	);
	if (!presence.success) error(400, 'Enter a valid value for Has current enrollment.');
	const enrollmentWhere = and(
		academic.where,
		presence.data === 'Yes'
			? isNotNull(enrollment.id)
			: presence.data === 'No'
				? isNull(enrollment.id)
				: undefined
	);
	const where = and(
		eq(user.role, Role.STUDENT),
		search
			? or(
					like(user.name, `%${search}%`),
					like(user.email, `%${search}%`),
					inArray(
						user.id,
						db
							.select({ id: studentData.userId })
							.from(studentData)
							.where(like(studentData.studentId, `%${search}%`))
					),
					like(user.id, `%${search}%`)
				)
			: undefined,
		filterWhere,
		Object.keys(academic.filters).length || presence.data
			? inArray(
					user.id,
					db
						.select({ id: user.id })
						.from(user)
						.leftJoin(studentData, eq(studentData.userId, user.id))
						.leftJoin(
							enrollment,
							and(
								eq(enrollment.id, studentData.currentEnrollmentId),
								eq(enrollment.studentId, studentData.studentId)
							)
						)
						.leftJoin(curriculum, eq(curriculum.id, enrollment.curriculumId))
						.where(enrollmentWhere)
				)
			: undefined
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
		orderBy: [asc(user.name), asc(user.id)],
		with: {
			studentData: {
				with: {
					currentEnrollment: { with: { curriculum: { columns: { programCode: true } } } },
					enrollments: { columns: { id: true }, limit: 1 }
				}
			}
		}
	});

	return {
		users: users.map((student) => ({
			...student,
			canDelete: canDeleteStudentAccount({
				setupComplete: student.setupComplete,
				currentEnrollmentId: student.studentData?.currentEnrollmentId,
				hasEnrollment: !!student.studentData?.enrollments.length
			})
		})),
		filterOptions: {
			programCode: db
				.select({ code: program.code })
				.from(program)
				.orderBy(asc(program.code))
				.all()
				.map(({ code }) => code),
			// Use stored academic levels so custom curricula remain filterable.
			yearLevel: db
				.selectDistinct({ value: enrollment.yearLevel })
				.from(enrollment)
				.orderBy(asc(enrollment.yearLevel))
				.all()
				.map(({ value }) => String(value)),
			semester: db
				.selectDistinct({ value: enrollment.semester })
				.from(enrollment)
				.orderBy(asc(enrollment.semester))
				.all()
				.map(({ value }) => String(value))
		},
		total,
		search,
		status,
		filters: {
			...filters,
			...academic.filters,
			...(presence.data ? { hasCurrentEnrollment: presence.data } : {})
		}
	};
};
