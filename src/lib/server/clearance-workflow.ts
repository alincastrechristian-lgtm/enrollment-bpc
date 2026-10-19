import { error } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { clearanceSubmission, enrollment, studentData, user } from '#lib/schema.js';
import type { db, Transaction } from './db';
import { getStudentEnrollment } from './student-enrollment';
import { clearancePassed } from '#lib/clearance/report.js';
import { activeTemplateForEnrollment } from './clearance-template';

type Database = typeof db | Transaction;
export function submissionInfo(record: typeof clearanceSubmission.$inferSelect | undefined) {
	if (!record) return null;
	return {
		id: record.id,
		enrollmentId: record.enrollmentId,
		filename: record.filename,
		contentType: record.contentType,
		size: record.size,
		templateRevision: record.templateRevision,
		definition: record.definition,
		corners: record.corners,
		report: record.report,
		status: record.status,
		uploadedAt: record.uploadedAt,
		requestedAt: record.requestedAt,
		reviewedAt: record.reviewedAt,
		reviewerName: record.reviewerName,
		rejectionReason: record.rejectionReason
	};
}
export function getSubmission(database: Database, enrollmentId: string) {
	return database
		.select()
		.from(clearanceSubmission)
		.where(eq(clearanceSubmission.enrollmentId, enrollmentId))
		.get();
}
export function requireClearanceEnrollment(
	database: Database,
	userId: string,
	enrollmentId: string
) {
	const record = getStudentEnrollment(database, userId, enrollmentId);
	if (
		record.student.currentEnrollmentId !== enrollmentId ||
		!record.user.setupComplete ||
		!record.enrollment.finalizedGrades ||
		['dropped', 'voided'].includes(record.enrollment.status)
	)
		error(409, 'Clearance requires the current, active enrollment with finalized grades.');
	return record;
}
export function requestClearanceEnrollment(
	database: typeof db,
	userId: string,
	submissionId: string
) {
	return database.transaction(
		(tx) => {
			const submission = tx
				.select()
				.from(clearanceSubmission)
				.where(eq(clearanceSubmission.id, submissionId))
				.get();
			if (!submission) error(404, 'Clearance submission not found.');
			const record = requireClearanceEnrollment(tx, userId, submission.enrollmentId);
			if (
				record.enrollment.submittedClearance ||
				submission.status !== 'ready' ||
				!clearancePassed(submission.report)
			)
				error(409, 'Upload and pass clearance checks before requesting enrollment.');
			const template = activeTemplateForEnrollment(tx, record.enrollment);
			if (template?.revision !== submission.templateRevision)
				error(409, 'The template changed. Upload and check your clearance again.');
			tx.update(clearanceSubmission)
				.set({ status: 'requested', requestedAt: new Date() })
				.where(eq(clearanceSubmission.id, submission.id))
				.run();
			return { success: true };
		},
		{ behavior: 'immediate' }
	);
}
export function verifyClearanceSubmission(
	database: Database,
	enrollmentId: string,
	submissionId: string | undefined,
	actor: { id: string; name: string }
) {
	const submission = getSubmission(database, enrollmentId);
	if (
		!submission ||
		submission.id !== submissionId ||
		submission.status !== 'requested' ||
		!submission.requestedAt ||
		!clearancePassed(submission.report)
	)
		error(
			409,
			'Review the current student enrollment request and uploaded clearance before verifying.'
		);
	database
		.update(clearanceSubmission)
		.set({
			status: 'verified',
			reviewedBy: actor.id,
			reviewerName: actor.name,
			reviewedAt: new Date(),
			rejectionReason: null
		})
		.where(eq(clearanceSubmission.id, submission.id))
		.run();
}
export function rejectClearanceSubmission(
	database: typeof db,
	input: {
		userId: string;
		enrollmentId: string;
		revision: number;
		submissionId: string;
		reason: string;
	},
	actor: { id: string; name: string }
) {
	return database.transaction(
		(tx) => {
			const record = requireClearanceEnrollment(tx, input.userId, input.enrollmentId);
			if (record.enrollment.revision !== input.revision)
				error(409, 'Enrollment changed. Refresh before reviewing.');
			const submission = getSubmission(tx, input.enrollmentId);
			if (
				record.enrollment.submittedClearance ||
				submission?.id !== input.submissionId ||
				submission.status !== 'requested'
			)
				error(409, 'This request changed or has already been reviewed.');
			tx.update(clearanceSubmission)
				.set({
					status: 'rejected',
					reviewedBy: actor.id,
					reviewerName: actor.name,
					reviewedAt: new Date(),
					rejectionReason: input.reason
				})
				.where(eq(clearanceSubmission.id, submission.id))
				.run();
			tx.update(enrollment)
				.set({ revision: sql`${enrollment.revision} + 1` })
				.where(eq(enrollment.id, input.enrollmentId))
				.run();
			return { success: true };
		},
		{ behavior: 'immediate' }
	);
}
export function clearanceRequests(database: Database) {
	return database
		.select({
			id: clearanceSubmission.id,
			userId: user.id,
			name: user.name,
			studentId: studentData.studentId,
			enrollmentId: enrollment.id,
			schoolYearStart: enrollment.schoolYearStart,
			semester: enrollment.semester,
			status: clearanceSubmission.status,
			requestedAt: clearanceSubmission.requestedAt
		})
		.from(clearanceSubmission)
		.innerJoin(enrollment, eq(enrollment.id, clearanceSubmission.enrollmentId))
		.innerJoin(
			studentData,
			and(
				eq(studentData.studentId, enrollment.studentId),
				eq(studentData.currentEnrollmentId, enrollment.id)
			)
		)
		.innerJoin(user, eq(user.id, studentData.userId))
		.where(
			and(
				sql`${clearanceSubmission.status} IN ('requested','verified')`,
				sql`${enrollment.status} NOT IN ('dropped','voided')`
			)
		)
		.orderBy(clearanceSubmission.requestedAt)
		.all();
}
