import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { getStudentEnrollmentHistory } from '#lib/server/student-enrollment.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	validateUser(locals, [Role.STUDENT]);
	const record = await getStudentEnrollmentHistory(locals.user.id);
	return {
		record: record
			? {
					...record,
					enrollments: record.enrollments.filter((entry) => entry.id === record.currentEnrollmentId)
				}
			: null
	};
};
