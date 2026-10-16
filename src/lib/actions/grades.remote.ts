import { Role } from '#lib/Roles.js';
import { getGradeConcerns } from '#lib/enrollment-grades.js';
import { curriculum, enrollment, enrollmentSubject, program } from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { sendEmail } from '#lib/server/email.js';
import {
	createGradesFinalizedEmail,
	createEnrollmentDroppedEmail,
	createMeetingRequestEmail
} from '#lib/server/email-templates.js';
import {
	canEditEnrollmentGrades,
	canDropEnrollment,
	canFinalizeEnrollmentGrades,
	getEnrollmentGradeLockReason,
	getStudentEnrollment
} from '#lib/server/student-enrollment.js';
import { command, getRequestEvent } from '$app/server';
import { resolve } from '$app/paths';
import { ORIGIN } from '$app/env/private';
import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

const grade = z.number().min(1).max(5).nullable();
function enrollmentEmailUrl() {
	return new URL(resolve('/user/enrollment'), ORIGIN).href;
}

const enrollmentReferenceSchema = z.object({
	userId: z.string().min(1),
	enrollmentId: z.string().min(1)
});

export const dropEnrollment = command(enrollmentReferenceSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	const record = db.transaction(
		(tx) => {
			const record = getStudentEnrollment(tx, data.userId, data.enrollmentId);
			if (!canDropEnrollment(locals.user.role, record))
				error(409, 'Only the current, active enrollment can be dropped.');
			tx.update(enrollment)
				.set({ status: 'dropped', droppedAt: new Date() })
				.where(eq(enrollment.id, record.enrollment.id))
				.run();
			return record;
		},
		{ behavior: 'immediate' }
	);
	let notificationSent = false;
	try {
		const message = createEnrollmentDroppedEmail(
			record.user.name,
			record.enrollment.schoolYearStart,
			record.enrollment.semester,
			enrollmentEmailUrl()
		);
		notificationSent = await sendEmail(
			record.user.email,
			message.subject,
			message.text,
			message.html
		);
	} catch (cause) {
		console.error('Enrollment drop email failed:', cause);
	}
	return { success: true, status: 'dropped' as const, notificationSent };
});

export const sendEnrollmentMeetingRequest = command(enrollmentReferenceSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	const startedAt = new Date();
	const record = db.transaction(
		(tx) => {
			const record = getStudentEnrollment(tx, data.userId, data.enrollmentId);
			if (!record.enrollment.finalizedGrades)
				error(409, 'Finalize grades before sending a meeting request.');
			if (record.enrollment.status === 'dropped') error(409, 'This enrollment has been dropped.');
			if (record.enrollment.meetingRequestSentAt)
				error(409, 'A meeting request has already been sent for this enrollment.');
			// Expired claims can be retried after a server interruption.
			if (
				record.enrollment.meetingRequestStartedAt &&
				startedAt.getTime() - record.enrollment.meetingRequestStartedAt.getTime() < 15 * 60 * 1000
			)
				error(409, 'A meeting request is already being sent. Try again shortly.');
			const concerns = getGradeConcerns(
				tx
					.select({ grade: enrollmentSubject.grade })
					.from(enrollmentSubject)
					.where(eq(enrollmentSubject.enrollmentId, record.enrollment.id))
					.all(),
				true
			);
			if (!concerns.failedCount && !concerns.incompleteCount)
				error(409, 'This enrollment has no failing or incomplete grades.');
			tx.update(enrollment)
				.set({ meetingRequestStartedAt: startedAt })
				.where(eq(enrollment.id, record.enrollment.id))
				.run();
			return record;
		},
		{ behavior: 'immediate' }
	);

	let sent = false;
	try {
		const message = createMeetingRequestEmail(
			record.user.name,
			record.enrollment.schoolYearStart,
			record.enrollment.semester,
			enrollmentEmailUrl()
		);
		sent = await sendEmail(record.user.email, message.subject, message.text, message.html);
	} catch (cause) {
		console.error('Meeting request email failed:', cause);
	}
	const claim = and(
		eq(enrollment.id, record.enrollment.id),
		eq(enrollment.meetingRequestStartedAt, startedAt)
	);
	if (!sent) {
		db.update(enrollment).set({ meetingRequestStartedAt: null }).where(claim).run();
		error(502, 'Failed to send the meeting request email. Please try again.');
	}
	const sentAt = new Date();
	const updated = db
		.update(enrollment)
		.set({ meetingRequestSentAt: sentAt, meetingRequestStartedAt: null })
		.where(claim)
		.returning({ id: enrollment.id })
		.get();
	if (!updated)
		error(
			409,
			'The email was sent, but its status changed. Refresh the enrollment before continuing.'
		);
	return { success: true, meetingRequestSentAt: sentAt };
});

export const verifyEnrollmentClearance = command(enrollmentReferenceSchema, (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	return db.transaction(
		(tx) => {
			const record = getStudentEnrollment(tx, data.userId, data.enrollmentId);
			if (!record.enrollment.finalizedGrades)
				error(409, 'Finalize grades before verifying clearance.');
			if (record.enrollment.status === 'dropped') error(409, 'This enrollment has been dropped.');
			if (record.enrollment.submittedClearance)
				error(409, 'Clearance has already been verified. Refresh the page.');
			tx.update(enrollment)
				.set({ submittedClearance: true, status: 'completed' })
				.where(eq(enrollment.id, record.enrollment.id))
				.run();
			return { success: true, submittedClearance: true, status: 'completed' as const };
		},
		{ behavior: 'immediate' }
	);
});

export const completeEnrollmentFollowUp = command(enrollmentReferenceSchema, (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	return db.transaction(
		(tx) => {
			const record = getStudentEnrollment(tx, data.userId, data.enrollmentId);
			if (record.enrollment.status === 'dropped') error(409, 'This enrollment has been dropped.');
			if (!record.enrollment.finalizedGrades || !record.enrollment.meetingRequestSentAt)
				error(409, 'Send a meeting request for finalized grades before completing the follow-up.');
			if (record.enrollment.followUpCompletedAt) error(409, 'This follow-up is already completed.');
			const completedAt = new Date();
			tx.update(enrollment)
				.set({ followUpCompletedAt: completedAt })
				.where(eq(enrollment.id, record.enrollment.id))
				.run();
			return { success: true, followUpCompletedAt: completedAt };
		},
		{ behavior: 'immediate' }
	);
});

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

export const finalizeEnrollmentGrades = command(finalizeGradesSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	if (new Set(data.grades.map((subject) => subject.id)).size !== data.grades.length)
		error(400, 'Each subject can only appear once.');

	const record = db.transaction(
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
			const enrolledProgram = tx
				.select({ code: program.code, name: program.name })
				.from(curriculum)
				.innerJoin(program, eq(program.code, curriculum.programCode))
				.where(eq(curriculum.id, record.enrollment.curriculumId))
				.get();
			if (!enrolledProgram) error(404, 'Enrollment program not found.');
			// Null grades in a finalized enrollment represent INC (Incomplete).
			tx.update(enrollment)
				.set({
					finalizedGrades: true,
					status: record.enrollment.submittedClearance ? 'completed' : 'enrolled'
				})
				.where(eq(enrollment.id, record.enrollment.id))
				.run();
			return { ...record, program: enrolledProgram };
		},
		{ behavior: 'immediate' }
	);

	// The grade change is committed before contacting the email provider.
	let notificationSent = false;
	try {
		const message = createGradesFinalizedEmail(
			record.user.name,
			record.enrollment.schoolYearStart,
			record.enrollment.semester,
			enrollmentEmailUrl(),
			record.program
		);
		notificationSent = await sendEmail(
			record.user.email,
			message.subject,
			message.text,
			message.html
		);
	} catch (cause) {
		console.error('Grade finalization email failed:', cause);
	}
	return { success: true, finalizedGrades: true, notificationSent };
});
