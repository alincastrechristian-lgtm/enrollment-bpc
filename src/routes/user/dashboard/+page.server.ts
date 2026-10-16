import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { buildStudentDashboard } from '#lib/server/student-dashboard.js';
import { getStudentEnrollmentHistory } from '#lib/server/student-enrollment.js';
import { getStaffDashboard } from '#lib/server/staff-dashboard.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR, Role.STUDENT]);
	if (locals.user.role === Role.ADMIN || locals.user.role === Role.REGISTRAR) {
		return {
			studentDashboard: null,
			staffDashboard: getStaffDashboard(locals.user.role),
			staffName: locals.user.name
		};
	}

	const record = await getStudentEnrollmentHistory(locals.user.id);
	return {
		studentDashboard: buildStudentDashboard(locals.user.name, record),
		staffDashboard: null
	};
};
