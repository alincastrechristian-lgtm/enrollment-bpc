import { Role } from '#lib/Roles.js';
import { curriculumSubject, subject, subjectPrerequisite, subjectSchema } from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import z from 'zod';
import { db, type Transaction } from '../server/db';

const fieldValidation = {
	name: z.string().trim().min(2, 'Name must be at least 2 characters'),
	code: z.string().trim().min(1, 'Code is required')
};

const prerequisiteIdsSchema = z.array(z.string().trim().min(1));
const subjectInsertSchema = createInsertSchema(subject, fieldValidation)
	.omit({
		id: true
	})
	.extend({ prerequisiteIds: prerequisiteIdsSchema.default([]) });

const subjectUpdateSchema = createInsertSchema(subject, fieldValidation)
	.omit({ id: true })
	.partial()
	.extend({ id: z.string().min(1), prerequisiteIds: prerequisiteIdsSchema.optional() });

// Caller holds a write transaction: validate the graph and save details together.
function replacePrerequisites(tx: Transaction, subjectId: string, ids: string[]) {
	if (new Set(ids).size !== ids.length) error(400, 'Each prerequisite can only appear once.');
	if (ids.includes(subjectId)) error(400, 'A subject cannot require itself.');
	if (
		ids.length &&
		tx.select().from(subject).where(inArray(subject.id, ids)).all().length !== ids.length
	)
		error(400, 'One or more prerequisite subjects do not exist.');
	const graph = new Map<string, string[]>();
	for (const edge of tx.select().from(subjectPrerequisite).all()) {
		if (edge.subjectId === subjectId) continue;
		const next = graph.get(edge.subjectId) ?? [];
		next.push(edge.prerequisiteId);
		graph.set(edge.subjectId, next);
	}
	const pending = [...ids];
	const visited = new Set<string>();
	while (pending.length) {
		const id = pending.pop()!;
		if (id === subjectId) error(400, 'Prerequisites cannot form a circular dependency.');
		if (visited.has(id)) continue;
		visited.add(id);
		pending.push(...(graph.get(id) ?? []));
	}
	tx.delete(subjectPrerequisite).where(eq(subjectPrerequisite.subjectId, subjectId)).run();
	if (ids.length)
		tx.insert(subjectPrerequisite)
			.values(ids.map((prerequisiteId) => ({ subjectId, prerequisiteId })))
			.run();
}

export const createSubject = command(subjectInsertSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	return db.transaction(
		(tx) => {
			const { prerequisiteIds, ...details } = data;
			const created = tx.insert(subject).values(details).returning().get();
			replacePrerequisites(tx, created.id, prerequisiteIds);
			return created;
		},
		{ behavior: 'immediate' }
	);
});

export const updateSubject = command(subjectUpdateSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	if (!data.id) {
		error(400, 'Subject ID is required for update.');
	}

	db.transaction(
		(tx) => {
			const { id, prerequisiteIds, ...details } = data;
			if (!tx.select().from(subject).where(eq(subject.id, id)).get())
				error(404, 'Subject not found.');
			if (Object.values(details).some((value) => value !== undefined))
				tx.update(subject).set(details).where(eq(subject.id, id)).run();
			if (prerequisiteIds !== undefined) replacePrerequisites(tx, id, prerequisiteIds);
		},
		{ behavior: 'immediate' }
	);
});

export const deleteSubject = command(z.string(), async (subjectId) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	if (
		db
			.select()
			.from(subjectPrerequisite)
			.where(eq(subjectPrerequisite.prerequisiteId, subjectId))
			.get()
	)
		error(
			400,
			'Cannot delete a subject required as a prerequisite. Remove its prerequisite links first.'
		);

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
