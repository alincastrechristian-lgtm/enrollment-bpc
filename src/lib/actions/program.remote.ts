import { Role } from '#lib/Roles.js';
import { applicant, curriculum, program, programSchema } from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import { setProgramCurriculum } from '#lib/server/curriculum.js';
import { command, getRequestEvent } from '$app/server';
import { error, isHttpError } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import z from 'zod';
import { db } from '../server/db';

const fieldValidation = {
	name: z.string().trim().min(2, 'Name must be at least 2 characters'),
	code: z.string().trim().min(1, 'Code is required')
};

const programInsertSchema = createInsertSchema(program, fieldValidation).omit({
	id: true,
	activeCurriculumId: true
});

const programUpdateSchema = createInsertSchema(program, fieldValidation)
	.omit({ id: true, activeCurriculumId: true })
	.partial()
	.extend({
		id: z.string().min(1),
		activeCurriculumId: z.string().trim().min(1).nullable().optional()
	});

export const createProgram = command(programInsertSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	return db.insert(program).values(data).returning().get();
});

export const updateProgram = command(programUpdateSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	if (!data.id) {
		error(400, 'Program ID is required for update.');
	}

	try {
		db.transaction((tx) => {
			const existing = tx.select().from(program).where(eq(program.id, data.id)).get();
			if (!existing) error(404, 'Program not found.');
			const { id, activeCurriculumId, ...details } = data;
			if (Object.values(details).some((value) => value !== undefined)) {
				tx.update(program).set(details).where(eq(program.id, id)).run();
			}
			if (activeCurriculumId !== undefined && activeCurriculumId !== existing.activeCurriculumId) {
				setProgramCurriculum(tx, id, activeCurriculumId);
			}
		});
	} catch (cause) {
		if (isHttpError(cause)) throw cause;
		console.error('Failed to update program:', cause);
		error(500, 'Failed to update program.');
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
	const selectedProgram = db.select().from(program).where(eq(program.id, programId)).get();
	if (
		selectedProgram &&
		db
			.select({ id: applicant.id })
			.from(applicant)
			.where(eq(applicant.program, selectedProgram.code))
			.get()
	) {
		error(400, 'Cannot delete program because it is in use by an applicant.');
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
