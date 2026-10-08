import { Role } from '#lib/Roles.js';
import { curriculumSubject, subject, subjectSchema } from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
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

const subjectInsertSchema = createInsertSchema(subject, fieldValidation).omit({
	id: true
});

const subjectUpdateSchema = createInsertSchema(subject, fieldValidation)
	.omit({ id: true })
	.partial()
	.extend({ id: z.string().min(1) });

export const createSubject = command(subjectInsertSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	await db.insert(subject).values(data);
});

export const updateSubject = command(subjectUpdateSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	if (!data.id) {
		error(400, 'Subject ID is required for update.');
	}

	const reuslt = await db.update(subject).set(data).where(eq(subject.id, data.id));

	if (reuslt.changes === 0) {
		error(404, 'Subject not found.');
	}
});

export const deleteSubject = command(z.string(), async (subjectId) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	const subjectInUse = db
		.select()
		.from(curriculumSubject)
		.where(eq(curriculumSubject.subjectId, subjectId))
		.get();

	if (subjectInUse) {
		error(400, 'Cannot delete subject because it is in use by a curriculum.');
	}

	const result = await db.delete(subject).where(eq(subject.id, subjectId));

	if (result.changes === 0) {
		error(404, 'Subject not found.');
	}
});

const subjectStatusSchema = subjectSchema.pick({
	id: true,
	isActive: true
});

export const setSubjectStatus = command(subjectStatusSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	const result = await db
		.update(subject)
		.set({ isActive: data.isActive })
		.where(eq(subject.id, data.id));

	if (result.changes === 0) {
		error(404, 'Subject not found.');
	}
});
