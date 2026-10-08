import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { curriculum, curriculumSubject, enrollment, subject } from '#lib/server/db/schema.js';
import { command, getRequestEvent } from '$app/server';
import { error, isHttpError } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm/sql/expressions';
import { createInsertSchema } from 'drizzle-zod';
import z from 'zod';
import { db, type Transaction } from '../server/db';

const curriculumFieldValidation = {
	name: z.string().trim().min(2, 'Name must be at least 2 characters'),
	programId: z.string().trim().min(1, 'Program is required')
};

const curriculumSubjectFieldValidation = {
	subjectId: z.string().trim().min(1, 'Subject ID is required'),
	yearLevel: z.number().int().positive('Year level must be a positive integer'),
	semester: z.number().int().positive('Semester must be a positive integer'),
	units: z.number().int().positive('Units must be a positive integer')
};

const curriculumSubjectInsertSchema = createInsertSchema(
	curriculumSubject,
	curriculumSubjectFieldValidation
).omit({
	id: true,
	curriculumId: true,
	subjectCode: true,
	subjectName: true
});

// Explicitly allow editable fields.
// Publishing and retiring should have their own commands.
const curriculumFieldsSchema = createInsertSchema(curriculum, curriculumFieldValidation).pick({
	name: true,
	programId: true
});

const curriculumInsertSchema = curriculumFieldsSchema.extend({
	subjects: z.array(curriculumSubjectInsertSchema)
});

// Each entry contains complete subject data.
// Existing entries have an ID; new entries omit it.
const curriculumSubjectUpdateSchema = curriculumSubjectInsertSchema.extend({
	id: z.string().trim().min(1).optional()
});

const curriculumUpdateSchema = curriculumFieldsSchema.partial().extend({
	id: z.string().trim().min(1),
	subjects: z.array(curriculumSubjectUpdateSchema)
});

export type CurriculumInsertSchema = z.infer<typeof curriculumInsertSchema>;

export type CurriculumUpdateSchema = z.infer<typeof curriculumUpdateSchema>;

function insertSubjects(
	tx: Transaction,
	curriculumId: string,
	subjects: CurriculumInsertSchema['subjects']
) {
	for (const entry of subjects) {
		const selectedSubject = tx
			.select({
				code: subject.code,
				name: subject.name
			})
			.from(subject)
			.where(eq(subject.id, entry.subjectId))
			.get();

		if (!selectedSubject) {
			error(400, 'Subject not found.');
		}

		tx.insert(curriculumSubject)
			.values({
				...entry,
				curriculumId,

				// Copy from the catalog, overriding any client-supplied values.
				subjectCode: selectedSubject.code,
				subjectName: selectedSubject.name
			})
			.run();
	}
}

export const createCurriculum = command(curriculumInsertSchema, (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	const { subjects, ...curriculumData } = data;

	const subjectIds = subjects.map((entry) => entry.subjectId);

	if (new Set(subjectIds).size !== subjectIds.length) {
		error(400, 'A subject can only appear once in this curriculum.');
	}

	try {
		return db.transaction((tx) => {
			const created = tx
				.insert(curriculum)
				.values(curriculumData)
				.returning({ id: curriculum.id })
				.get();

			if (!created) {
				error(500, 'Failed to create curriculum.');
			}

			if (subjects.length > 0) {
				insertSubjects(tx, created.id, subjects);
			}

			return { id: created.id };
		});
	} catch (cause) {
		if (isHttpError(cause)) throw cause;

		console.error('Failed to create curriculum:', cause);
		error(500, 'Failed to create curriculum.');
	}
});

export const updateCurriculum = command(curriculumUpdateSchema, (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	const { id, subjects, ...curriculumData } = data;

	try {
		return db.transaction((tx) => {
			const existing = tx.select().from(curriculum).where(eq(curriculum.id, id)).get();

			if (!existing) {
				error(404, 'Curriculum not found.');
			}

			if (existing.publishedAt !== null) {
				error(409, 'Published curricula cannot be edited. Create a revision.');
			}

			const oldSubjects = tx
				.select()
				.from(curriculumSubject)
				.where(eq(curriculumSubject.curriculumId, id))
				.all();

			const oldSubjectsById = new Map(oldSubjects.map((entry) => [entry.id, entry]));

			const retainedIds = subjects.flatMap((entry) => (entry.id ? [entry.id] : []));

			if (new Set(retainedIds).size !== retainedIds.length) {
				error(400, 'Duplicate curriculum subject IDs.');
			}

			const subjectIds = subjects.map((entry) => entry.subjectId);

			if (new Set(subjectIds).size !== subjectIds.length) {
				error(400, 'A subject can only appear once in this curriculum.');
			}

			for (const entry of subjects) {
				if (!entry.id) continue;

				const previous = oldSubjectsById.get(entry.id);

				// Existing row IDs must belong to this curriculum.
				if (!previous) {
					error(400, 'A subject entry does not belong to this curriculum.');
				}

				// Keep each existing row attached to its original subject.
				// Replacements must be submitted as new entries without an ID.
				// This also avoids temporary unique-constraint conflicts.
				if (previous.subjectId !== entry.subjectId) {
					error(400, 'To replace a subject, remove it and add a new entry.');
				}
			}

			// Fetch all selected catalog subjects in one query.
			// Avoid an empty inArray query when removing every subject.
			const catalogSubjects =
				subjectIds.length > 0
					? tx
							.select({
								id: subject.id,
								code: subject.code,
								name: subject.name
							})
							.from(subject)
							.where(inArray(subject.id, subjectIds))
							.all()
					: [];

			const catalogById = new Map(catalogSubjects.map((entry) => [entry.id, entry]));

			// Build snapshots from server data before making any changes.
			const preparedSubjects = subjects.map((entry) => {
				const selectedSubject = catalogById.get(entry.subjectId);

				if (!selectedSubject) {
					error(400, `Subject not found: ${entry.subjectId}`);
				}

				const { id: entryId, ...subjectData } = entry;

				return {
					entryId,
					values: {
						...subjectData,
						curriculumId: id,
						subjectCode: selectedSubject.code,
						subjectName: selectedSubject.name
					}
				};
			});

			// Update only provided curriculum fields.
			if (Object.values(curriculumData).some((value) => value !== undefined)) {
				tx.update(curriculum).set(curriculumData).where(eq(curriculum.id, id)).run();
			}

			// The submitted array is the complete desired subject list.
			const retainedIdSet = new Set(retainedIds);
			const removedIds = oldSubjects
				.filter((entry) => !retainedIdSet.has(entry.id))
				.map((entry) => entry.id);

			// Delete removed entries before inserting replacements.
			if (removedIds.length > 0) {
				tx.delete(curriculumSubject)
					.where(
						and(eq(curriculumSubject.curriculumId, id), inArray(curriculumSubject.id, removedIds))
					)
					.run();
			}

			for (const entry of preparedSubjects) {
				if (entry.entryId) {
					// Refresh the draft's snapshots from the catalog.
					tx.update(curriculumSubject)
						.set(entry.values)
						.where(
							and(eq(curriculumSubject.id, entry.entryId), eq(curriculumSubject.curriculumId, id))
						)
						.run();
				} else {
					tx.insert(curriculumSubject).values(entry.values).run();
				}
			}

			return { id };
		});
	} catch (cause) {
		// Any error inside the transaction has already triggered rollback.
		if (isHttpError(cause)) throw cause;

		console.error('Failed to update curriculum:', cause);
		error(500, 'Failed to update curriculum.');
	}
});

export const deleteCurriculum = command(z.string().min(1), async (curriculumId) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN]);

	const curriculumInUse = db
		.select()
		.from(enrollment)
		.where(eq(enrollment.curriculumId, curriculumId))
		.get();

	if (curriculumInUse) {
		error(400, 'Cannot delete curriculum because students are enrolled in it.');
	}

	const result = await db.delete(curriculum).where(eq(curriculum.id, curriculumId));

	if (result.changes === 0) {
		error(404, 'Curriculum not found.');
	}
});
