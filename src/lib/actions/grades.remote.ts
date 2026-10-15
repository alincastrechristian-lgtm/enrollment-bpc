import { Role } from '#lib/Roles.js';
import { enrollment, enrollmentSubject } from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import {
	canEditEnrollmentGrades,
	canFinalizeEnrollmentGrades,
	getEnrollmentGradeLockReason,
	getStudentEnrollment
} from '#lib/server/student-enrollment.js';
import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

const grade = z.number().min(1).max(5).nullable();
const updateGradesSchema = z.object({
	userId: z.string().min(1),
	enrollmentId: z.string().min(1),
	grades: z.array(z.object({ id: z.string().min(1), grade, originalGrade: grade })).min(1)
});

export const updateEnrollmentGrades = command(updateGradesSchema, (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	if (new Set(data.grades.map((subject) => subject.id)).size !== data.grades.length)
		error(400, 'Each subject can only appear once.');

	return db.transaction(
		(tx) => {
			const record = getStudentEnrollment(tx, data.userId, data.enrollmentId);
			const lockReason = getEnrollmentGradeLockReason(record, locals.user.role);
			if (lockReason) error(409, lockReason);
			if (!canEditEnrollmentGrades(locals.user.role, record))
				error(
					409,
					'Registrars can edit only the current enrollment. Refresh the page to continue.'
				);

			for (const subject of data.grades) {
				const existing = tx
					.select({ id: enrollmentSubject.id })
					.from(enrollmentSubject)
					.where(
						and(
							eq(enrollmentSubject.id, subject.id),
							eq(enrollmentSubject.enrollmentId, record.enrollment.id)
						)
					)
					.get();
				if (!existing) error(400, 'A selected subject does not belong to this enrollment.');

				// Compare the original grade to avoid overwriting another staff member's changes.
				const updated = tx
					.update(enrollmentSubject)
					.set({ grade: subject.grade })
					.where(
						and(
							eq(enrollmentSubject.id, subject.id),
							eq(enrollmentSubject.enrollmentId, record.enrollment.id),
							subject.originalGrade === null
								? isNull(enrollmentSubject.grade)
								: eq(enrollmentSubject.grade, subject.originalGrade)
						)
					)
					.returning({ id: enrollmentSubject.id })
					.get();
				if (!updated)
					error(
						409,
						'Grades have changed since this page was loaded. Refresh before saving again.'
					);
			}
			return { success: true, grades: data.grades.map(({ id, grade }) => ({ id, grade })) };
		},
		{ behavior: 'immediate' }
	);
});

const finalizeGradesSchema = z.object({
	userId: z.string().min(1),
	enrollmentId: z.string().min(1),
	grades: z.array(z.object({ id: z.string().min(1), grade })).min(1)
});

export const finalizeEnrollmentGrades = command(finalizeGradesSchema, (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	if (new Set(data.grades.map((subject) => subject.id)).size !== data.grades.length)
		error(400, 'Each subject can only appear once.');

	return db.transaction(
		(tx) => {
			const record = getStudentEnrollment(tx, data.userId, data.enrollmentId);
			if (record.enrollment.finalizedGrades) error(409, 'Grades are already finalized.');
			const lockReason = getEnrollmentGradeLockReason(record, locals.user.role);
			if (lockReason) error(409, lockReason);
			if (!canFinalizeEnrollmentGrades(locals.user.role, record))
				error(409, 'Registrars can finalize only the current enrollment.');
			const subjects = tx
				.select({ id: enrollmentSubject.id, grade: enrollmentSubject.grade })
				.from(enrollmentSubject)
				.where(eq(enrollmentSubject.enrollmentId, record.enrollment.id))
				.all();
			if (!subjects.length) error(400, 'An enrollment must have subjects before finalizing.');
			if (
				subjects.some(
					(subject) =>
						subject.grade !== null &&
						(!Number.isFinite(subject.grade) || subject.grade < 1 || subject.grade > 5)
				)
			)
				error(400, 'Grades must be between 1 and 5, or blank for INC (Incomplete).');

			// Finalize exactly the saved grades the staff member reviewed and confirmed.
			const reviewed = new Map(data.grades.map((subject) => [subject.id, subject.grade]));
			if (
				reviewed.size !== subjects.length ||
				subjects.some((subject) => reviewed.get(subject.id) !== subject.grade)
			)
				error(
					409,
					'Grades or subjects have changed. Reload the enrollment and review before finalizing.'
				);
			// Null grades in a finalized enrollment represent INC (Incomplete).
			tx.update(enrollment)
				.set({ finalizedGrades: true })
				.where(eq(enrollment.id, record.enrollment.id))
				.run();
			return { success: true, finalizedGrades: true };
		},
		{ behavior: 'immediate' }
	);
});
