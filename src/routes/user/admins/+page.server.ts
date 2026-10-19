import { Role } from '#lib/Roles.js';
import { loadStaffAccounts } from '#lib/server/staff-accounts.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => loadStaffAccounts(event, Role.ADMIN);
