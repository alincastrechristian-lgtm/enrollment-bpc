import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { getCurriculum, getCurriculumCatalogs } from '#lib/server/curriculum.js';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	validateUser(locals, [Role.ADMIN]);
	const data = getCurriculum(params.curriculumId);
	if (data.curriculum.publishedAt !== null)
		redirect(302, resolve('/user/curriculum/[curriculumId]', params));
	return { ...data, ...getCurriculumCatalogs() };
};
