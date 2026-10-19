import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { requiredDocument, studentData, user, enrollment, curriculum } from '#lib/schema.js';
import { DOCUMENT_LABELS, type DocumentKind } from '#lib/documents.js';
import { Role } from '#lib/Roles.js';
import type { db, Transaction } from './db';
import { recordNotification } from './notifications';

type Database = typeof db | Transaction;
type Actor = { id: string; name: string };
export function documentInfo(record: typeof requiredDocument.$inferSelect) {
	const { objectKey, ...info } = record;
	return { ...info, hasFile: !!objectKey };
}
export function studentDocumentContext(database: Database, userId: string) {
	const record = database
		.select({ student: studentData })
		.from(studentData)
		.innerJoin(user, eq(user.id, studentData.userId))
		.where(and(eq(user.id, userId), eq(user.role, Role.STUDENT)))
		.get();
	if (!record) error(404, 'Student not found.');
	const current = record.student.currentEnrollmentId
		? database
				.select({ enrollment, curriculum })
				.from(enrollment)
				.innerJoin(curriculum, eq(curriculum.id, enrollment.curriculumId))
				.where(
					and(
						eq(enrollment.id, record.student.currentEnrollmentId),
						eq(enrollment.studentId, record.student.studentId)
					)
				)
				.get()
		: undefined;
	return { ...record, current };
}
export function getDocumentState(database: Database, userId: string) {
	const { current } = studentDocumentContext(database, userId);
	const items = database
		.select()
		.from(requiredDocument)
		.where(eq(requiredDocument.userId, userId))
		.all()
		.map(documentInfo);
	const canRequest =
		!!current &&
		!['dropped', 'voided'].includes(current.enrollment.status) &&
		current.enrollment.yearLevel === current.curriculum.yearLevels &&
		current.enrollment.semester === 1;
	return {
		userId,
		items,
		canRequest,
		enrollmentId: current?.enrollment.id ?? null,
		uploadBlock: current ? documentUploadBlock(database, userId, current.enrollment) : null
	};
}
export type DocumentState = ReturnType<typeof getDocumentState>;

export function documentUploadBlock(
	database: Database,
	userId: string,
	current: { curriculumId: string; yearLevel: number; semester: number }
) {
	const calendar = database
		.select()
		.from(curriculum)
		.where(eq(curriculum.id, current.curriculumId))
		.get();
	if (
		!calendar ||
		current.yearLevel !== calendar.yearLevels ||
		current.semester < Math.max(1, calendar.semesters - 1)
	)
		return null;
	const missing = database
		.select()
		.from(requiredDocument)
		.where(eq(requiredDocument.userId, userId))
		.all()
		.filter((row) => !['uploaded', 'verified'].includes(row.status));
	return missing.length
		? `Upload all required documents before requesting final-semester enrollment: ${missing.map((row) => DOCUMENT_LABELS[row.kind]).join(', ')}.`
		: null;
}
export function documentEnrollmentBlock(
	database: Database,
	userId: string,
	target: { yearLevel: number; semester: number },
	calendar: { yearLevels: number; semesters: number }
) {
	if (target.yearLevel !== calendar.yearLevels || target.semester !== calendar.semesters)
		return null;
	const pending = database
		.select()
		.from(requiredDocument)
		.where(eq(requiredDocument.userId, userId))
		.all()
		.filter((row) => row.status !== 'verified');
	return pending.length
		? `Verify all required documents before final-semester enrollment: ${pending.map((row) => DOCUMENT_LABELS[row.kind]).join(', ')}.`
		: null;
}
export function requestStudentDocuments(
	database: typeof db,
	input: { userId: string; enrollmentId: string; kinds: DocumentKind[] },
	actor: Actor
) {
	return database.transaction(
		(tx) => {
			const state = getDocumentState(tx, input.userId);
			if (!state.canRequest || state.enrollmentId !== input.enrollmentId)
				error(
					409,
					'Request documents during the first semester of the student’s final year. Refresh the student record.'
				);
			const { current } = studentDocumentContext(tx, input.userId);
			const kinds = input.kinds.filter((kind) => !state.items.some((row) => row.kind === kind));
			if (!kinds.length) error(409, 'These documents have already been requested.');
			for (const kind of kinds)
				tx.insert(requiredDocument)
					.values({
						userId: input.userId,
						requestedEnrollmentId: input.enrollmentId,
						kind,
						dueYearLevel: current!.curriculum.yearLevels,
						dueSemester: current!.curriculum.semesters,
						requestedBy: actor.id,
						requestedAt: new Date()
					})
					.run();
			recordNotification(tx, {
				recipientId: input.userId,
				actorId: actor.id,
				enrollmentId: input.enrollmentId,
				type: 'documents_requested',
				title: 'Required documents requested',
				message: `Upload every requested document: ${kinds.map((kind) => DOCUMENT_LABELS[kind]).join(', ')}. Uploads are required before requesting final-semester enrollment; staff must verify them before enrolling you.`
			});
			return { success: true };
		},
		{ behavior: 'immediate' }
	);
}
export function reviewStudentDocument(
	database: typeof db,
	input: { id: string; revision: number; decision: 'verified' | 'rejected'; reason?: string },
	actor: Actor
) {
	return database.transaction(
		(tx) => {
			const row = tx.select().from(requiredDocument).where(eq(requiredDocument.id, input.id)).get();
			if (!row) error(404, 'Document request not found.');
			studentDocumentContext(tx, row.userId);
			if (row.revision !== input.revision || row.status !== 'uploaded' || !row.objectKey)
				error(409, 'Document changed or has already been reviewed. Refresh before continuing.');
			if (input.decision === 'rejected' && (!input.reason || input.reason.trim().length < 5))
				error(400, 'Explain why another copy is needed.');
			tx.update(requiredDocument)
				.set({
					status: input.decision,
					revision: row.revision + 1,
					reviewedBy: actor.id,
					reviewerName: actor.name,
					reviewedAt: new Date(),
					rejectionReason: input.decision === 'rejected' ? input.reason!.trim() : null
				})
				.where(eq(requiredDocument.id, row.id))
				.run();
			recordNotification(tx, {
				recipientId: row.userId,
				actorId: actor.id,
				enrollmentId: row.requestedEnrollmentId,
				type: input.decision === 'verified' ? 'document_verified' : 'document_rejected',
				title: `${DOCUMENT_LABELS[row.kind]} ${input.decision === 'verified' ? 'verified' : 'needs another upload'}`,
				message:
					input.decision === 'verified'
						? `${DOCUMENT_LABELS[row.kind]} has been verified by ${actor.name}.`
						: `Upload another copy of ${DOCUMENT_LABELS[row.kind]}. ${input.reason!.trim()}`
			});
			return { success: true, userId: row.userId };
		},
		{ behavior: 'immediate' }
	);
}
