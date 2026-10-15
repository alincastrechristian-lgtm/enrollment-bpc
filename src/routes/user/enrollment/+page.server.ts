import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { getStudentEnrollmentHistory } from '#lib/server/student-enrollment.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	validateUser(locals, [Role.STUDENT]);
	return { record: await getStudentEnrollmentHistory(locals.user.id) };
};
