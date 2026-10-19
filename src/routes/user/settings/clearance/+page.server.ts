import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, setHeaders }) => {
	validateUser(locals, [Role.ADMIN]);
	setHeaders({ 'Cache-Control': 'private, no-store' });
	return {
		pageTitle: 'Clearance settings',
		pageDescription: 'Manage the reference template for student clearances.'
	};
};
