import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access';

export const statement = {
	...defaultStatements
} as const;

export const ac = createAccessControl(statement);

export const adminRole = ac.newRole({
	...adminAc.statements
});

export const registrarRole = ac.newRole({
	user: ['create', 'list', 'get', 'update', 'set-email'],
	session: ['list', 'revoke', 'delete']
});

export const studentRole = ac.newRole({
	user: [],
	session: []
});
