import { getIdentityStudent } from './identity.server';
import { getClearanceTemplateInfo } from '#lib/server/clearance-template.js';
import type { PageServerLoad } from './$types';
import { Role } from '#lib/Roles.js';

export const load: PageServerLoad = ({ locals, setHeaders }) => {
	setHeaders({ 'Cache-Control': 'private, no-store' });
	return {
		savedTemplate:
			locals.user?.role === Role.ADMIN && locals.session ? getClearanceTemplateInfo() : null,
		identityStudent: locals.user && locals.session ? getIdentityStudent(locals) : null,
		signedIn: Boolean(locals.user && locals.session)
	};
};
