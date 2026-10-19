import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { clearanceRequests } from '#lib/server/clearance-workflow.js';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	return { requests: clearanceRequests(db) };
};
