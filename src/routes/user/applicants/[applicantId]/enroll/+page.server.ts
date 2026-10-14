import { Role } from '#lib/Roles.js';
import { curriculumSubject, subject } from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { getEnrollmentContext } from '#lib/server/enrollment.js';
import { asc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	const context = getEnrollmentContext(db, params.applicantId);
	return {
		...context,
		entries: db
			.select()
			.from(curriculumSubject)
			.where(eq(curriculumSubject.curriculumId, context.curriculum.id))
			.orderBy(
				asc(curriculumSubject.yearLevel),
				asc(curriculumSubject.semester),
				asc(curriculumSubject.subjectCode)
			)
			.all(),
		subjects: db
			.select({
				id: subject.id,
				code: subject.code,
				name: subject.name,
				isActive: subject.isActive
			})
			.from(subject)
			.orderBy(asc(subject.code), asc(subject.id))
			.all(),
		schoolYearStart: Number(
			new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric' }).format(
				new Date()
			)
		)
	};
};
