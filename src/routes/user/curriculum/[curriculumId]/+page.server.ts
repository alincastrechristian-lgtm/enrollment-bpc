import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { getCurriculum } from '#lib/server/curriculum.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	return { ...getCurriculum(params.curriculumId), canManage: locals.user?.role === Role.ADMIN };
};
