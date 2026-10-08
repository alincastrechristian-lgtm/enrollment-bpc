import { MAX_ITEMS_PER_PAGE } from '#lib/components/Table/TableValues.js';
import { Role } from '#lib/Roles.js';
import { applicant, filterApplicantSchema } from '#lib/schema.js';
import { schemaFilters } from '#lib/server/filters.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { redirect } from '@sveltejs/kit';
import { and, count, eq, isNotNull, isNull, like, not, or } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	const search = url.searchParams.get('q')?.trim() ?? '';
	const value = url.searchParams.get('status');
	const status =
		value === 'incomplete' || value === 'under-review' || value === 'approved' ? value : 'all';
	const documents = and(
		eq(applicant.hasBirthCertificate, true),
		eq(applicant.hasForm138, true),
		eq(applicant.hasGoodMoral, true),
		eq(applicant.hasPicture, true)
	)!;
	const { filters, where: filterWhere } = schemaFilters(
		filterApplicantSchema,
		applicant,
		url.searchParams
	);
	const where = and(
		filterWhere,
		search
			? or(
					like(applicant.name, `%${search}%`),
					like(applicant.applicationId, `%${search}%`),
					like(applicant.email, `%${search}%`)
				)
			: undefined,
		status === 'incomplete'
			? not(documents)
			: status === 'under-review'
				? and(documents, or(isNull(applicant.userId), eq(applicant.userId, '')))
				: status === 'approved'
					? and(documents, isNotNull(applicant.userId), not(eq(applicant.userId, '')))
					: undefined
	);
	const total = db.select({ count: count() }).from(applicant).where(where).get()!.count;

	const requested = Number(url.searchParams.get('page'));

	const currentPage = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
	const lastPage = Math.max(1, Math.ceil(total / MAX_ITEMS_PER_PAGE));
	if (currentPage > lastPage) {
		const destination = new URL(url);
		destination.searchParams.set('page', String(lastPage));
		redirect(302, destination.pathname + destination.search);
	}

	const offset = (currentPage - 1) * MAX_ITEMS_PER_PAGE;

	const applicants = await db.query.applicant.findMany({
		where,
		limit: MAX_ITEMS_PER_PAGE,
		offset,
		orderBy: (applicant, { desc }) => [desc(applicant.dateApplied)]
	});

	return {
		applicants,
		total,
		search,
		status,
		filters
	};
};
