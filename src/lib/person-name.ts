import { z } from 'zod';

export const personNameSchema = z.object({
	firstName: z.string().trim().min(1, 'First name is required').max(100),
	middleName: z.string().trim().max(100).default(''),
	lastName: z.string().trim().min(1, 'Last name is required').max(100)
});

export type PersonName = z.infer<typeof personNameSchema>;

export function formatPersonName({ firstName, middleName, lastName }: PersonName) {
	return [firstName, middleName, lastName].filter(Boolean).join(' ');
}
