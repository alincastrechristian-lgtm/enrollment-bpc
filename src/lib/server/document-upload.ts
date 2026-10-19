import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { requiredDocument } from '#lib/schema.js';
import { db } from './db';
import { studentDocumentContext, documentInfo } from './documents';
import {
	fileStorageConfigured,
	getGarageS3Client,
	safeUploadName,
	MAX_FILE_BYTES
} from './garage/files';
import { GARAGE_BUCKET } from './garage';

export async function validateDocumentFile(file: File) {
	if (!file.size || file.size > MAX_FILE_BYTES) error(400, 'Choose a document up to 10 MiB.');
	const bytes = Buffer.from(await file.arrayBuffer());
	if (file.type === 'application/pdf') {
		if (
			!bytes
				.subarray(0, 8)
				.toString('ascii')
				.match(/^%PDF-\d\.\d/) ||
			!bytes.subarray(-2048).includes(Buffer.from('%%EOF'))
		)
			error(400, 'Choose a valid PDF document.');
	} else {
		try {
			const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' });
			const metadata = await image.metadata();
			const formats: Record<string, string> = {
				jpeg: 'image/jpeg',
				png: 'image/png',
				webp: 'image/webp'
			};
			if (!metadata.format || formats[metadata.format] !== file.type || (metadata.pages ?? 1) !== 1)
				throw new Error('Invalid format');
			await image.stats();
		} catch {
			error(400, 'Choose a valid JPG, PNG, WebP or PDF document.');
		}
	}
	return bytes;
}
export async function uploadRequiredDocument(
	userId: string,
	input: { id: string; revision: number; file: File },
	signal?: AbortSignal
) {
	if (!fileStorageConfigured()) error(503, 'File storage is unavailable. Contact the Registrar.');
	studentDocumentContext(db, userId);
	const previous = db
		.select()
		.from(requiredDocument)
		.where(eq(requiredDocument.id, input.id))
		.get();
	if (!previous || previous.userId !== userId) error(404, 'Document request not found.');
	if (previous.revision !== input.revision || !['requested', 'rejected'].includes(previous.status))
		error(409, 'Document changed or is awaiting verification. Refresh before uploading.');
	const bytes = await validateDocumentFile(input.file);
	signal?.throwIfAborted();
	const filename = safeUploadName(input.file.name),
		key = `required-documents/${encodeURIComponent(userId)}/${previous.id}/${randomUUID()}/${filename}`;
	await getGarageS3Client().send(
		new PutObjectCommand({
			Bucket: GARAGE_BUCKET,
			Key: key,
			Body: bytes,
			ContentType: input.file.type,
			ContentLength: bytes.length
		}),
		{ abortSignal: signal }
	);
	try {
		db.transaction(
			(tx) => {
				studentDocumentContext(tx, userId);
				const current = tx
					.select()
					.from(requiredDocument)
					.where(eq(requiredDocument.id, input.id))
					.get();
				if (
					!current ||
					current.userId !== userId ||
					current.revision !== input.revision ||
					current.status !== previous.status
				)
					error(409, 'Document changed while uploading. Refresh and retry.');
				tx.update(requiredDocument)
					.set({
						objectKey: key,
						filename,
						contentType: input.file.type,
						size: bytes.length,
						status: 'uploaded',
						revision: current.revision + 1,
						uploadedAt: new Date(),
						reviewedAt: null,
						reviewedBy: null,
						reviewerName: null,
						rejectionReason: null
					})
					.where(eq(requiredDocument.id, current.id))
					.run();
			},
			{ behavior: 'immediate' }
		);
	} catch (cause) {
		if (
			db.select().from(requiredDocument).where(eq(requiredDocument.id, input.id)).get()
				?.objectKey !== key
		)
			try {
				await getGarageS3Client().send(
					new DeleteObjectCommand({ Bucket: GARAGE_BUCKET, Key: key })
				);
			} catch {
				console.error('Document staging cleanup failed.');
			}
		throw cause;
	}
	if (previous.objectKey)
		try {
			await getGarageS3Client().send(
				new DeleteObjectCommand({ Bucket: GARAGE_BUCKET, Key: previous.objectKey })
			);
		} catch {
			console.error('Previous document cleanup failed.');
		}
	return {
		success: true,
		document: documentInfo(
			db.select().from(requiredDocument).where(eq(requiredDocument.id, input.id)).get()!
		)
	};
}
