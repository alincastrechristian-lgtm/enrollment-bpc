import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { error, isHttpError } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { clearanceSubmission, clearanceTemplate } from '#lib/schema.js';
import { definitionSchema } from '#lib/clearance/definition.js';
import { clearancePassed, hasCurrentOfficeChecks } from '#lib/clearance/report.js';
import type { Corners } from '#lib/clearance/clearance.js';
import { checkClearance, decodeClearance } from './clearance-checker';
import {
	getGarageS3Client,
	downloadObject,
	fileStorageConfigured,
	MAX_FILE_BYTES,
	safeUploadName
} from './garage/files';
import { GARAGE_BUCKET } from './garage';
import { getSubmission, requireClearanceEnrollment, submissionInfo } from './clearance-workflow';

export async function uploadStudentClearance(
	userId: string,
	input: {
		file: File;
		enrollmentId: string;
		revision: number;
		templateRevision: string;
		corners: Corners;
	}
) {
	if (!fileStorageConfigured()) error(503, 'File storage is unavailable. Contact the Registrar.');
	const record = requireClearanceEnrollment(db, userId, input.enrollmentId);
	const previous = getSubmission(db, input.enrollmentId);
	if (
		record.enrollment.submittedClearance ||
		(previous?.status === 'requested' && hasCurrentOfficeChecks(previous.report)) ||
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
	if (
		Number(definition.semester) !== record.enrollment.semester ||
		definition.schoolYear !==
			`${record.enrollment.schoolYearStart}-${record.enrollment.schoolYearStart + 1}`
	)
		error(409, 'The saved template does not cover your enrollment term. Contact the Registrar.');
	const file = input.file;
	if (!file.size || file.size > MAX_FILE_BYTES)
		error(400, 'Choose a clearance image up to 10 MiB.');
	const bytes = Buffer.from(await file.arrayBuffer());
	let image;
	try {
		image = await decodeClearance(bytes, file.type);
	} catch (cause) {
		if (isHttpError(cause)) throw cause;
		error(400, 'Could not read this image. Choose a valid JPG, PNG or WebP.');
	}
	const reference = await downloadObject(template.objectKey);
	const report = await checkClearance(
		Buffer.from(await reference.arrayBuffer()),
		image,
		input.corners,
		definition
	);
	if (!clearancePassed(report)) return { success: false, report, submission: null };
	const id = randomUUID(),
		filename = safeUploadName(file.name),
		key = `student-clearances/${encodeURIComponent(record.student.studentId)}/${id}/${filename}`;
	await getGarageS3Client().send(
		new PutObjectCommand({
			Bucket: GARAGE_BUCKET,
			Key: key,
			Body: bytes,
			ContentLength: bytes.length,
			ContentType: file.type
		})
	);
	try {
		db.transaction(
			(tx) => {
				const current = requireClearanceEnrollment(tx, userId, input.enrollmentId);
				const currentSubmission = getSubmission(tx, input.enrollmentId);
				if (
					current.enrollment.revision !== input.revision ||
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
				await getGarageS3Client().send(
					new DeleteObjectCommand({ Bucket: GARAGE_BUCKET, Key: key })
				);
			} catch {
				console.error('Clearance staging cleanup failed.');
			}
		}
		throw cause;
	}
	if (previous) {
		try {
			await getGarageS3Client().send(
				new DeleteObjectCommand({ Bucket: GARAGE_BUCKET, Key: previous.objectKey })
			);
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
