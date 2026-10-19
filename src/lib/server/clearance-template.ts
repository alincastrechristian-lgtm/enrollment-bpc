import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from './db';
import { clearanceTemplate } from '#lib/schema.js';
import { definitionSchema } from '#lib/clearance/definition.js';
import { GARAGE_BUCKET } from './garage';
import {
	downloadObject,
	fileStorageConfigured,
	getGarageS3Client,
	MAX_FILE_BYTES,
	safeUploadName
} from './garage/files';

export function getClearanceTemplate() {
	return db.select().from(clearanceTemplate).where(eq(clearanceTemplate.id, 1)).get() ?? null;
}

export function getClearanceTemplateInfo() {
	const saved = getClearanceTemplate();
	if (!saved) return null;
	return {
		revision: saved.revision,
		filename: saved.filename,
		contentType: saved.contentType,
		definition: definitionSchema.safeParse(saved.definition).data ?? null,
		size: saved.size,
		uploadedAt: saved.uploadedAt.toISOString()
	};
}

async function imageBytes(file: File) {
	if (!(file instanceof File) || !file.name || !file.size)
		error(400, 'Choose a blank clearance image.');
	if (file.size > MAX_FILE_BYTES) error(413, 'Maximum template size is 10 MiB.');
	if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
		error(400, 'Choose a JPG, PNG or WebP image.');
	const bytes = Buffer.from(await file.arrayBuffer());
	const valid =
		file.type === 'image/png'
			? bytes.length >= 33 &&
				bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
				bytes.toString('ascii', 12, 16) === 'IHDR'
			: file.type === 'image/jpeg'
				? bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
				: bytes.length >= 20 &&
					bytes.toString('ascii', 0, 4) === 'RIFF' &&
					bytes.toString('ascii', 8, 12) === 'WEBP';
	if (!valid) error(400, 'File contents do not match a supported image. Choose another image.');
	return bytes;
}

async function removeObject(key: string) {
	await getGarageS3Client().send(new DeleteObjectCommand({ Bucket: GARAGE_BUCKET, Key: key }));
}

export async function saveClearanceTemplate(file: File, expectedRevision: string, actorId: string) {
	if (!fileStorageConfigured()) error(503, 'File storage is not configured.');
	const bytes = await imageBytes(file);
	const previous = getClearanceTemplate();
	if ((previous?.revision ?? '') !== expectedRevision)
		error(409, 'Template changed. Refresh the page before replacing it.');
	const revision = randomUUID();
	const filename = safeUploadName(file.name);
	const key = `clearance-templates/${revision}/${filename}`;
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
		db.transaction((tx) => {
			const current = tx.select().from(clearanceTemplate).where(eq(clearanceTemplate.id, 1)).get();
			if ((current?.revision ?? '') !== expectedRevision)
				error(409, 'Template changed. Refresh the page before replacing it.');
			const values = {
				revision,
				definition: null,
				objectKey: key,
				filename,
				contentType: file.type,
				size: bytes.length,
				uploadedBy: actorId,
				uploadedAt: new Date()
			};
			tx.insert(clearanceTemplate)
				.values({ id: 1, ...values })
				.onConflictDoUpdate({ target: clearanceTemplate.id, set: values })
				.run();
		});
	} catch (cause) {
		// Never remove an object if a commit outcome is uncertain.
		try {
			if (getClearanceTemplate()?.objectKey !== key) await removeObject(key);
		} catch {
			console.error('Clearance template upload cleanup failed.');
		}
		throw cause;
	}
	let cleanupWarning = false;
	if (previous) {
		try {
			await removeObject(previous.objectKey);
		} catch {
			cleanupWarning = true;
			console.error('Previous clearance template cleanup failed.');
		}
	}
	return { success: true, cleanupWarning };
}

export function saveClearanceDefinition(expectedRevision: string, input: unknown) {
	const parsed = definitionSchema.safeParse(input);
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Invalid template areas.');
	const revision = randomUUID();
	const previous = getClearanceTemplate();
	// Older clients omit optional steps. Only explicit empty arrays clear their saved areas.
	const definition = {
		...parsed.data,
		personalFields: parsed.data.personalFields ?? previous?.definition?.personalFields,
		officeRows: parsed.data.officeRows ?? previous?.definition?.officeRows
	};
	const saved = db
		.update(clearanceTemplate)
		.set({ definition, revision })
		.where(eq(clearanceTemplate.revision, expectedRevision))
		.returning({ id: clearanceTemplate.id })
		.get();
	if (!saved) error(409, 'Template changed. Refresh the page before saving its areas.');
	return { success: true, revision };
}

export async function getClearanceTemplateImage(
	signal?: AbortSignal,
	expectedRevision?: string | null
) {
	const saved = getClearanceTemplate();
	if (!saved) error(404, 'No clearance template has been uploaded.');
	if (expectedRevision && expectedRevision !== saved.revision)
		error(409, 'Template changed. Refresh the page to load its current image and areas.');
	const response = await downloadObject(saved.objectKey, signal);
	response.headers.set('Content-Type', saved.contentType);
	response.headers.set(
		'Content-Disposition',
		response.headers.get('Content-Disposition')!.replace(/^attachment/, 'inline')
	);
	return response;
}
