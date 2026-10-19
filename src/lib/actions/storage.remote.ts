import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { capacitySchema, increaseNodeCapacity } from '#lib/server/garage/admin.js';
import { deleteSchema, deleteStorageEntry } from '#lib/server/garage/explorer.js';
import { command, getRequestEvent } from '$app/server';
import { error, isHttpError } from '@sveltejs/kit';
import { z } from 'zod';

export const increaseGarageCapacity = command(capacitySchema, async (input) => {
	validateUser(getRequestEvent().locals, [Role.ADMIN]);
	return increaseNodeCapacity(input);
});

export const deleteGarageEntry = command(
	deleteSchema.extend({ folder: z.string() }),
	async ({ folder, ...input }) => {
		validateUser(getRequestEvent().locals, [Role.ADMIN]);
		try {
			await deleteStorageEntry(folder, input);
		} catch (caught) {
			if (isHttpError(caught)) throw caught;
			error(503, 'Deletion failed. Some files may already be deleted. Refresh before retrying.');
		}
	}
);
