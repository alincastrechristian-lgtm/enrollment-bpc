import { Role } from '#lib/Roles.js';
import {
	curriculum,
	enrollment,
	enrollmentAudit,
	enrollmentSubject,
	studentData
} from '#lib/schema.js';
import type { db, Transaction } from './db/index';
import { enrollStudentSchema, getEnrollmentContext, getEnrollmentSubjects } from './enrollment';
import { getStudentEnrollment } from './student-enrollment';
import { createEnrollmentChangeEmail } from './email-templates';
import { recordNotification } from './notifications';
import { error } from '@sveltejs/kit';
import { and, desc, eq, ne, notInArray } from 'drizzle-orm';
import { z } from 'zod';

type Database = typeof db;
type Actor = { id: string; name: string; role?: string | null };
type Record = ReturnType<typeof getStudentEnrollment>;
export const enrollmentChangeSchema = z.object({
	userId: z.string().min(1),
	enrollmentId: z.string().min(1),
	revision: z.number().int().nonnegative(),
	reason: z.string().trim().min(5, 'Explain the reason using at least 5 characters.').max(1000)
});
export const correctEnrollmentSchema = enrollStudentSchema.extend({
	...enrollmentChangeSchema.shape,
	confirmGradedSubjectRemoval: z.boolean().default(false)
});

export function canCorrectEnrollment(role: string | null | undefined, record: Record) {
	return (
		!record.enrollment.finalizedGrades &&
		record.enrollment.status === 'enrolled' &&
		(role === Role.ADMIN ||
			(role === Role.REGISTRAR && record.student.currentEnrollmentId === record.enrollment.id))
	);
}
export function canVoidEnrollment(role: string | null | undefined, record: Record) {
	return (
		!record.enrollment.finalizedGrades &&
		record.enrollment.status !== 'voided' &&
		(role === Role.ADMIN ||
			(role === Role.REGISTRAR && record.student.currentEnrollmentId === record.enrollment.id))
	);
}
export function canReopenEnrollment(role: string | null | undefined, record: Record) {
	return (
		role === Role.ADMIN &&
		record.enrollment.finalizedGrades &&
		(record.enrollment.status === 'enrolled' || record.enrollment.status === 'completed')
	);
}

function checkRevision(record: Record, revision: number) {
	if (record.enrollment.revision !== revision)
		error(409, 'Enrollment changed. Reload and review before continuing.');
	if (
		record.enrollment.meetingRequestStartedAt &&
		Date.now() - record.enrollment.meetingRequestStartedAt.getTime() < 15 * 60 * 1000
	)
		error(409, 'A meeting request is being sent. Try again after it finishes.');
}
function snapshot(tx: Transaction, id: string) {
	const record = tx.select().from(enrollment).where(eq(enrollment.id, id)).get()!;
	return {
		enrollment: record,
		curriculum: tx
			.select({ name: curriculum.name, programCode: curriculum.programCode })
			.from(curriculum)
			.where(eq(curriculum.id, record.curriculumId))
			.get()!,
		subjects: tx
			.select()
			.from(enrollmentSubject)
			.where(eq(enrollmentSubject.enrollmentId, id))
			.all()
	};
}
export type EnrollmentSnapshot = ReturnType<typeof snapshot>;
function recordChange(
	tx: Transaction,
	record: Record,
	actor: Actor,
	action: 'corrected' | 'voided' | 'reopened',
	reason: string,
	before: ReturnType<typeof snapshot>,
	url: string
) {
	const after = snapshot(tx, record.enrollment.id);
	tx.insert(enrollmentAudit)
		.values({
			enrollmentId: record.enrollment.id,
			actorId: actor.id,
			actorName: actor.name,
			action,
			reason,
			before,
			after
		})
		.run();
	const selected = tx
		.select({ programCode: curriculum.programCode })
		.from(curriculum)
		.where(eq(curriculum.id, after.enrollment.curriculumId))
		.get()!;
	const message = createEnrollmentChangeEmail({
		kind: action,
		name: record.user.name,
		...after.enrollment,
		programCode: selected.programCode,
		reason,
		url
	});
	recordNotification(tx, {
		...message.notification,
		recipientId: record.user.id,
		actorId: actor.id,
		enrollmentId: record.enrollment.id
	});
	return { user: record.user, enrollmentId: record.enrollment.id, message };
}

export function correctStudentEnrollment(
	database: Database,
	input: z.input<typeof correctEnrollmentSchema>,
	actor: Actor,
	url: string
) {
	const data = correctEnrollmentSchema.parse(input);
	return database.transaction(
		(tx) => {
			const record = getStudentEnrollment(tx, data.userId, data.enrollmentId);
			if (!canCorrectEnrollment(actor.role, record))
				error(
					409,
					'Only unfinalized enrollments can be corrected. Registrars can correct only the current enrollment.'
				);
			checkRevision(record, data.revision);
			if (record.student.currentEnrollmentId !== data.currentEnrollmentId)
				error(409, 'Current enrollment changed. Reload before correcting.');
			const context = getEnrollmentContext(
				tx,
				data.userId,
				data.programCode,
				record.enrollment.curriculumId
			);
			if (context.curriculum.id !== data.curriculumId)
				error(409, 'Curriculum changed. Reload before saving.');
			const others = tx
				.select()
				.from(enrollment)
				.where(
					and(
						eq(enrollment.studentId, record.student.studentId),
						ne(enrollment.id, record.enrollment.id),
						notInArray(enrollment.status, ['dropped', 'voided'])
					)
				)
				.all();
			const compareTerm = (
				first: { schoolYearStart: number; semester: number },
				second: { schoolYearStart: number; semester: number }
			) => first.schoolYearStart - second.schoolYearStart || first.semester - second.semester;
			for (const other of others) {
				if (compareTerm(other, data) === 0)
					error(409, 'This student already has an enrollment for that term.');
				if (
					(compareTerm(other, record.enrollment) < 0 && compareTerm(other, data) >= 0) ||
					(compareTerm(other, record.enrollment) > 0 && compareTerm(other, data) <= 0)
				)
					error(
						409,
						'The corrected term must stay between the student’s earlier and later enrollments.'
					);
			}
			const subjects = getEnrollmentSubjects(tx, data, context.curriculum);
			const before = snapshot(tx, record.enrollment.id);
			const selected = new Set(subjects.map((entry) => entry.subjectId));
			const removed = before.subjects.filter((entry) => !selected.has(entry.subjectId));
			if (removed.some((entry) => entry.grade !== null) && !data.confirmGradedSubjectRemoval)
				error(
					409,
					'Confirm removal of subjects with saved grades. Their previous grades will remain in the audit history.'
				);
			for (const entry of removed)
				tx.delete(enrollmentSubject).where(eq(enrollmentSubject.id, entry.id)).run();
			for (const entry of subjects) {
				const existing = before.subjects.find((old) => old.subjectId === entry.subjectId);
				if (existing) {
					// Keep matching attempt IDs, grades, and original staff attribution.
					tx.update(enrollmentSubject)
						.set(entry)
						.where(eq(enrollmentSubject.id, existing.id))
						.run();
				} else
					tx.insert(enrollmentSubject)
						.values({ ...entry, enrollmentId: record.enrollment.id, addedBy: actor.id })
						.run();
			}
			tx.update(enrollment)
				.set({
					curriculumId: context.curriculum.id,
					schoolYearStart: data.schoolYearStart,
					semester: data.semester,
					yearLevel: data.yearLevel,
					section: data.section,
					revision: data.revision + 1,
					meetingRequestSentAt: null,
					meetingRequestStartedAt: null,
					followUpCompletedAt: null,
					submittedClearance: false
				})
				.where(eq(enrollment.id, record.enrollment.id))
				.run();
			return recordChange(tx, record, actor, 'corrected', data.reason, before, url);
		},
		{ behavior: 'immediate' }
	);
}

export function voidStudentEnrollment(
	database: Database,
	input: z.input<typeof enrollmentChangeSchema>,
	actor: Actor,
	url: string
) {
	const data = enrollmentChangeSchema.parse(input);
	return database.transaction(
		(tx) => {
			const record = getStudentEnrollment(tx, data.userId, data.enrollmentId);
			if (!canVoidEnrollment(actor.role, record))
				error(
					409,
					'Only unfinalized enrollments can be voided. Registrars can void only the current enrollment.'
				);
			checkRevision(record, data.revision);
			const before = snapshot(tx, record.enrollment.id);
			tx.update(enrollment)
				.set({ status: 'voided', revision: data.revision + 1, meetingRequestStartedAt: null })
				.where(eq(enrollment.id, record.enrollment.id))
				.run();
			if (record.student.currentEnrollmentId === record.enrollment.id) {
				const previous = tx
					.select({ id: enrollment.id })
					.from(enrollment)
					.where(
						and(eq(enrollment.studentId, record.student.studentId), ne(enrollment.status, 'voided'))
					)
					.orderBy(
						desc(enrollment.schoolYearStart),
						desc(enrollment.semester),
						desc(enrollment.enrolledAt),
						desc(enrollment.id)
					)
					.get();
				tx.update(studentData)
					.set({ currentEnrollmentId: previous?.id ?? null })
					.where(eq(studentData.studentId, record.student.studentId))
					.run();
			}
			return recordChange(tx, record, actor, 'voided', data.reason, before, url);
		},
		{ behavior: 'immediate' }
	);
}

export function reopenStudentEnrollment(
	database: Database,
	input: z.input<typeof enrollmentChangeSchema>,
	actor: Actor,
	url: string
) {
	const data = enrollmentChangeSchema.parse(input);
	return database.transaction(
		(tx) => {
			const record = getStudentEnrollment(tx, data.userId, data.enrollmentId);
			if (!canReopenEnrollment(actor.role, record))
				error(403, 'Only administrators can reopen a finalized enrollment.');
			checkRevision(record, data.revision);
			const before = snapshot(tx, record.enrollment.id);
			tx.update(enrollment)
				.set({
					finalizedGrades: false,
					status: 'enrolled',
					submittedClearance: false,
					meetingRequestSentAt: null,
					meetingRequestStartedAt: null,
					followUpCompletedAt: null,
					revision: data.revision + 1
				})
				.where(eq(enrollment.id, record.enrollment.id))
				.run();
			return recordChange(tx, record, actor, 'reopened', data.reason, before, url);
		},
		{ behavior: 'immediate' }
	);
}
