import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { getCurriculum, getCurrentStudentCurriculumId } from '#lib/server/curriculum.js';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR, Role.STUDENT]);
	const isStudent = locals.user.role === Role.STUDENT;
	if (isStudent && getCurrentStudentCurriculumId(locals.user.id) !== params.curriculumId) {
		error(404, 'Curriculum not found.');
	}
	return {
		...getCurriculum(params.curriculumId),
		canManage: locals.user.role === Role.ADMIN,
		isStudent
	};
};
