import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { curriculum, program, programSchema } from '#lib/server/db/schema.js';
import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import z from 'zod';
import { db } from '../server/db';

const fieldValidation = {
	name: z.string().trim().min(2, 'Name must be at least 2 characters'),
	code: z.string().trim().min(1, 'Code is required')
};

const programInsertSchema = createInsertSchema(program, fieldValidation).omit({
	id: true
});

const programUpdateSchema = createInsertSchema(program, fieldValidation)
	.omit({ id: true })
	.partial()
	.extend({ id: z.string().min(1) });

export const createProgram = command(programInsertSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	await db.insert(program).values(data);
});

export const updateProgram = command(programUpdateSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	if (!data.id) {
		error(400, 'Program ID is required for update.');
	}

	const result = await db.update(program).set(data).where(eq(program.id, data.id));

	if (result.changes === 0) {
		error(404, 'Program not found.');
	}
});

export const deleteProgram = command(z.string(), async (programId) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	const programInUse = db
		.select()
		.from(curriculum)
		.where(eq(curriculum.programId, programId))
		.get();

	if (programInUse) {
		error(400, 'Cannot delete program because it is in use by a curriculum.');
	}

	const result = await db.delete(program).where(eq(program.id, programId));

	if (result.changes === 0) {
		error(404, 'Program not found.');
	}
});

const programStatusSchema = programSchema.pick({
	id: true,
	isActive: true
});

export const setProgramStatus = command(programStatusSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	const result = await db
		.update(program)
		.set({ isActive: data.isActive })
		.where(eq(program.id, data.id));

	if (result.changes === 0) {
		error(404, 'Program not found.');
	}
});
