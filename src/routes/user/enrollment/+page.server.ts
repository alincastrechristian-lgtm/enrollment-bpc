import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import type { PageServerLoad } from '../../$types';

export const load: PageServerLoad = ({ locals }) => {
	validateUser(locals, [Role.STUDENT]);
};
