import { APIError } from 'better-auth/api';
import type { BetterAuthOptions } from 'better-auth';
import { formatPersonName, personNameSchema } from '../person-name';

export const nameFields = {
	firstName: { type: 'string', required: true, input: false },
	middleName: { type: 'string', required: false, defaultValue: '', input: false },
	lastName: { type: 'string', required: true, input: false }
} as const;

// Also used by the seed auth instance, so every auth writer has the same rules.
export const nameHooks = {
	create: {
		before: async (data) => {
			const parsed = personNameSchema.safeParse(data);
			if (!parsed.success) {
				throw new APIError('BAD_REQUEST', { message: 'First and last names are required.' });
			}
			return { data: { ...data, ...parsed.data, name: formatPersonName(parsed.data) } };
		}
	},
	update: {
		before: async (data) => {
			if (
				data.name !== undefined ||
				data.firstName !== undefined ||
				data.middleName !== undefined ||
				data.lastName !== undefined
			) {
				throw new APIError('BAD_REQUEST', {
					message: 'Use the student or registrar editor to change account names.'
				});
			}
		}
	}
} satisfies NonNullable<NonNullable<BetterAuthOptions['databaseHooks']>['user']>;
