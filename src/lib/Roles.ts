export const ROLES = {
	ADMIN: 'admin',
	REGISTRAR: 'registrar',
	STUDENT: 'student'
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
