import { adminClient, twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/svelte';
import { Role } from './Roles';
import { ac, adminRole, registrarRole, studentRole } from './auth-permissions';

export const authClient = createAuthClient({
	plugins: [
		twoFactorClient(),
		adminClient({
			defaultRole: Role.STUDENT,
			ac,
			roles: {
				[Role.ADMIN]: adminRole,
				[Role.REGISTRAR]: registrarRole,
				[Role.STUDENT]: studentRole
			}
		})
	]
});
