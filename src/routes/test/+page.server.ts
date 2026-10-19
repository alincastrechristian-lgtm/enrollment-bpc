import { getIdentityStudent } from './identity.server';
import { getClearanceTemplateInfo } from '#lib/server/clearance-template.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, setHeaders }) => {
	setHeaders({ 'Cache-Control': 'private, no-store' });
	return {
		savedTemplate: locals.user && locals.session ? getClearanceTemplateInfo() : null,
		identityStudent: locals.user && locals.session ? getIdentityStudent(locals) : null,
		signedIn: Boolean(locals.user && locals.session)
	};
};
