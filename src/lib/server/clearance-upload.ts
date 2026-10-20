import { abortable, withDeadline, CLEARANCE_CHECK_TIMEOUT_MS } from '#lib/clearance/deadline.js';
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { error, isHttpError } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { clearanceSubmission, clearanceTemplate } from '#lib/schema.js';
import {
	definitionSchema,
	clearanceTermFromEnrollment,
	hasIdentityAreas
} from '#lib/clearance/definition.js';
import { clearanceCanSubmit, hasCurrentClearanceChecks } from '#lib/clearance/report.js';
import { overall, type Corners } from '#lib/clearance/clearance.js';
import { matchIdentity } from '#lib/clearance/identity.js';
import { checkClearance, decodeClearance, clearanceIdentityCrops } from './clearance-checker';
import { recognizeIdentity } from './handwriting';
import { getClearancePolicy } from './clearance-settings';
import {
	getGarageS3Client,
	downloadObject,
	fileStorageConfigured,
	MAX_FILE_BYTES,
	safeUploadName
} from './garage/files';
import { GARAGE_BUCKET } from './garage';
import { getSubmission, requireClearanceEnrollment, submissionInfo } from './clearance-workflow';

type ClearanceUpload = {
	file: File;
	enrollmentId: string;
	revision: number;
	templateRevision: string;
	corners: Corners;
};

export async function uploadStudentClearance(
	userId: string,
	input: ClearanceUpload,
	signal?: AbortSignal
) {
	try {
		return await withDeadline(
			(deadline) => processStudentClearance(userId, input, deadline),
			CLEARANCE_CHECK_TIMEOUT_MS,
			signal
		);
	} catch (cause) {
		if (cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError'))
			error(
				408,
				'Clearance checking took too long or was interrupted. Refresh clearance status before trying again.'
			);
		throw cause;
	}
}

async function processStudentClearance(
	userId: string,
	input: ClearanceUpload,
	signal?: AbortSignal
) {
	const policy = getClearancePolicy(db);
	if (!fileStorageConfigured()) error(503, 'File storage is unavailable. Contact the Registrar.');
	const record = requireClearanceEnrollment(db, userId, input.enrollmentId);
	const previous = getSubmission(db, input.enrollmentId);
	if (
		record.enrollment.submittedClearance ||
		(previous?.status === 'requested' && hasCurrentClearanceChecks(previous.report)) ||
		previous?.status === 'verified'
	)
		error(409, 'Your clearance is already awaiting review or verified.');
	if (record.enrollment.revision !== input.revision)
		error(409, 'Enrollment changed. Refresh before uploading.');
	const template = db.select().from(clearanceTemplate).where(eq(clearanceTemplate.id, 1)).get();
	if (!template || template.revision !== input.templateRevision)
		error(409, 'Clearance template changed. Refresh before uploading.');
	const parsed = definitionSchema.safeParse(template.definition);
	if (
		!parsed.success ||
		!parsed.data.officeRows?.length ||
		parsed.data.officeRows.some((r) => !r.cleared || !r.signature)
	)
		error(503, 'The Registrar must finish configuring the clearance template and office boxes.');
	const definition = parsed.data;
	if (policy.personalInfoVerificationEnabled && !hasIdentityAreas(definition))
		error(
			503,
			'The Registrar must mark the student name and student number areas in the clearance template.'
		);
	const file = input.file;
	if (!file.size || file.size > MAX_FILE_BYTES)
		error(400, 'Choose a clearance image up to 10 MiB.');
	signal?.throwIfAborted();
	const bytes = Buffer.from(await abortable(file.arrayBuffer(), signal));
	let image;
	try {
		image = await decodeClearance(bytes, file.type);
	} catch (cause) {
		if (isHttpError(cause)) throw cause;
		error(400, 'Could not read this image. Choose a valid JPG, PNG or WebP.');
	}
	const reference = await abortable(downloadObject(template.objectKey, signal), signal);
	const report = await abortable(
		checkClearance(
			Buffer.from(await abortable(reference.arrayBuffer(), signal)),
			image,
			input.corners,
			definition,
			clearanceTermFromEnrollment(record.enrollment),
			policy.personalInfoVerificationEnabled,
			signal
		),
		signal
	);
	signal?.throwIfAborted();
	if (overall(report.template) !== 'pass' || overall(report.offices) !== 'pass')
		return { success: false, report, submission: null };
	if (policy.personalInfoVerificationEnabled) {
		if (
			report.identityCheckVersion !== 1 ||
			report.identityPresence?.name.verdict !== 'pass' ||
			report.identityPresence?.studentNumber.verdict !== 'pass'
		)
			return { success: false, report, submission: null };
		const crops = await clearanceIdentityCrops(image, input.corners, definition);
		signal?.throwIfAborted();
		report.identity = matchIdentity(
			await recognizeIdentity(crops, signal ?? new AbortController().signal),
			{ name: record.user.name, studentNumber: record.student.studentId }
		);
	} else {
		report.identity = 'disabled';
		report.identityVerificationEnabled = false;
		report.identityCheckVersion = 1;
		delete report.identityPresence;
	}
	if (!clearanceCanSubmit(report)) return { success: false, report, submission: null };
	signal?.throwIfAborted();
	const id = randomUUID(),
		filename = safeUploadName(file.name),
		key = `student-clearances/${encodeURIComponent(record.student.studentId)}/${id}/${filename}`;
	try {
		const pendingPut = getGarageS3Client().send(
			new PutObjectCommand({
				Bucket: GARAGE_BUCKET,
				Key: key,
				Body: bytes,
				ContentLength: bytes.length,
				ContentType: file.type
			}),
			{ abortSignal: signal }
		);
		// A storage server may accept the upload even after the caller stops waiting.
		// Clean a late staged object only when no committed submission references it.
		void pendingPut.then(
			async () => {
				if (!signal?.aborted) return;
				try {
					if (getSubmission(db, input.enrollmentId)?.objectKey !== key) {
						await deleteClearanceObject(key);
					}
				} catch {
					console.error('Late clearance staging cleanup failed.');
				}
			},
			() => {}
		);
		await abortable(pendingPut, signal);
		signal?.throwIfAborted();
		db.transaction(
			(tx) => {
				signal?.throwIfAborted();
				const current = requireClearanceEnrollment(tx, userId, input.enrollmentId);
				if (
					getClearancePolicy(tx).personalInfoVerificationEnabled !==
					policy.personalInfoVerificationEnabled
				)
					error(409, 'Verification settings changed while checking. Upload again.');
				const currentSubmission = getSubmission(tx, input.enrollmentId);
				if (
					current.enrollment.revision !== input.revision ||
					current.user.name !== record.user.name ||
					current.student.studentId !== record.student.studentId ||
					current.enrollment.submittedClearance ||
					currentSubmission?.id !== previous?.id ||
					currentSubmission?.status !== previous?.status ||
					tx.select().from(clearanceTemplate).where(eq(clearanceTemplate.id, 1)).get()?.revision !==
						template.revision
				)
					error(
						409,
						'Enrollment, template or clearance changed while checking. Refresh and retry.'
					);
				const values = {
					id,
					enrollmentId: input.enrollmentId,
					objectKey: key,
					filename,
					contentType: file.type,
					size: bytes.length,
					templateRevision: template.revision,
					definition,
					corners: input.corners,
					report,
					status: 'ready' as const,
					uploadedAt: new Date(),
					requestedAt: null,
					reviewedAt: null,
					reviewedBy: null,
					reviewerName: null,
					rejectionReason: null
				};
				tx.insert(clearanceSubmission)
					.values(values)
					.onConflictDoUpdate({ target: clearanceSubmission.enrollmentId, set: values })
					.run();
			},
			{ behavior: 'immediate' }
		);
	} catch (cause) {
		// A failed or uncertain commit must never delete the currently referenced file.
		if (getSubmission(db, input.enrollmentId)?.objectKey !== key) {
			try {
				await deleteClearanceObject(key);
			} catch {
				console.error('Clearance staging cleanup failed.');
			}
		}
		throw cause;
	}
	if (previous) {
		try {
			await deleteClearanceObject(previous.objectKey);
		} catch {
			console.error('Previous student clearance cleanup failed.');
		}
	}
	return {
		success: true,
		report,
		submission: submissionInfo(getSubmission(db, input.enrollmentId))
	};
}

async function deleteClearanceObject(key: string) {
	await withDeadline(
		(signal) =>
			getGarageS3Client().send(new DeleteObjectCommand({ Bucket: GARAGE_BUCKET, Key: key }), {
				abortSignal: signal
			}),
		10_000
	);
}
