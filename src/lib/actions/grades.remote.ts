import { Role } from '#lib/Roles.js';
import { enrollmentSubject } from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { canEditEnrollmentGrades, getStudentEnrollment } from '#lib/server/student-enrollment.js';
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
			if (
				!canEditEnrollmentGrades(
					locals.user!.role,
					record.student.currentEnrollmentId === record.enrollment.id
				)
			)
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
