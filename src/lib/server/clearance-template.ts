import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { and, desc, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db, type Transaction } from './db';
import { clearanceTemplate, legacyClearanceTemplate, clearanceSubmission } from '#lib/schema.js';
import { definitionSchema, templateTermIssue } from '#lib/clearance/definition.js';
import { GARAGE_BUCKET } from './garage';
import {
	downloadObject,
	fileStorageConfigured,
	getGarageS3Client,
	MAX_FILE_BYTES,
	safeUploadName
} from './garage/files';

type Database = typeof db | Transaction;
type Term = { semester: number; schoolYearStart: number };
export function activeTemplateForEnrollment(database: Database, term: Term) {
	return (
		database
			.select()
			.from(clearanceTemplate)
			.where(
				and(
					eq(clearanceTemplate.active, true),
					eq(clearanceTemplate.semester, term.semester),
					eq(clearanceTemplate.schoolYearStart, term.schoolYearStart)
				)
			)
			.get() ?? null
	);
}
export function getClearanceTemplate(revision?: string) {
	return (
		db
			.select()
			.from(clearanceTemplate)
			.where(revision ? eq(clearanceTemplate.revision, revision) : undefined)
			.orderBy(desc(clearanceTemplate.id))
			.get() ?? null
	);
}
function info(saved: typeof clearanceTemplate.$inferSelect) {
	return {
		id: saved.id,
		revision: saved.revision,
		semester: saved.semester,
		schoolYearStart: saved.schoolYearStart,
		active: saved.active,
		activatedAt: saved.activatedAt?.toISOString() ?? null,
		needsImageUpdate: saved.needsImageUpdate,
		filename: saved.filename,
		contentType: saved.contentType,
		definition: saved.definition ?? null,
		size: saved.size,
		uploadedAt: saved.uploadedAt.toISOString()
	};
}
export function getClearanceTemplateInfo(revision?: string) {
	const saved = getClearanceTemplate(revision);
	return saved ? info(saved) : null;
}
export function listClearanceTemplates() {
	const used = new Set(
		db
			.select({ revision: clearanceSubmission.templateRevision })
			.from(clearanceSubmission)
			.all()
			.map((row) => row.revision)
	);
	return db
		.select()
		.from(clearanceTemplate)
		.orderBy(desc(clearanceTemplate.id))
		.all()
		.map((saved) => ({ ...info(saved), inUse: used.has(saved.revision) }));
}
function requireDraft(revision: string) {
	const saved = getClearanceTemplate(revision);
	if (!saved) error(409, 'Template changed. Refresh the page before editing it.');
	if (saved.activatedAt)
		error(409, 'Published templates are read-only. Reuse this version to create a draft.');
	return saved;
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

async function removeIfUnused(key: string) {
	if (
		db
			.select({ id: clearanceTemplate.id })
			.from(clearanceTemplate)
			.where(eq(clearanceTemplate.objectKey, key))
			.get() ||
		db
			.select({ id: legacyClearanceTemplate.id })
			.from(legacyClearanceTemplate)
			.where(eq(legacyClearanceTemplate.objectKey, key))
			.get()
	)
		return;
	await removeObject(key);
}

export async function deleteClearanceTemplate(expectedRevision: string) {
	const saved = db.transaction(
		(tx) => {
			const template = tx
				.select()
				.from(clearanceTemplate)
				.where(eq(clearanceTemplate.revision, expectedRevision))
				.get();
			if (!template)
				error(409, 'Template changed or was deleted. Refresh the page before deleting it.');
			if (
				tx
					.select({ id: clearanceSubmission.id })
					.from(clearanceSubmission)
					.where(eq(clearanceSubmission.templateRevision, expectedRevision))
					.get()
			)
				error(
					409,
					'This template is used by student submissions and must be kept for their clearance history.'
				);
			tx.delete(clearanceTemplate).where(eq(clearanceTemplate.revision, expectedRevision)).run();
			return template;
		},
		{ behavior: 'immediate' }
	);
	let cleanupWarning = false;
	try {
		await removeIfUnused(saved.objectKey);
	} catch {
		cleanupWarning = true;
		console.error('Deleted clearance template file cleanup failed.');
	}
	return { success: true, cleanupWarning };
}
export async function saveClearanceTemplate(
	file: File,
	expectedRevision: string,
	actorId: string,
	term?: Term,
	preserveAreas = false
) {
	if (!fileStorageConfigured()) error(503, 'File storage is not configured.');
	const bytes = await imageBytes(file);
	const previous = expectedRevision ? requireDraft(expectedRevision) : null;
	if (!previous && !term) error(400, 'Choose the school year and semester for this template.');
	const revision = randomUUID(),
		filename = safeUploadName(file.name),
		key = `clearance-templates/${revision}/${filename}`;
	await getGarageS3Client().send(
		new PutObjectCommand({
			Bucket: GARAGE_BUCKET,
			Key: key,
			Body: bytes,
			ContentLength: bytes.length,
			ContentType: file.type
		})
	);
	let id: number;
	try {
		id = db.transaction(
			(tx) => {
				if (previous) {
					const current = tx
						.select()
						.from(clearanceTemplate)
						.where(eq(clearanceTemplate.id, previous.id))
						.get();
					if (current?.revision !== expectedRevision || current.activatedAt)
						error(409, 'Template changed. Refresh before replacing it.');
				}
				const values = {
					revision,
					definition: preserveAreas ? (previous?.definition ?? null) : null,
					needsImageUpdate: false,
					objectKey: key,
					filename,
					contentType: file.type,
					size: bytes.length,
					uploadedBy: actorId,
					uploadedAt: new Date()
				};
				if (previous) {
					tx.update(clearanceTemplate)
						.set(values)
						.where(eq(clearanceTemplate.id, previous.id))
						.run();
					return previous.id;
				}
				return tx
					.insert(clearanceTemplate)
					.values({ ...values, semester: term!.semester, schoolYearStart: term!.schoolYearStart })
					.returning({ id: clearanceTemplate.id })
					.get()!.id;
			},
			{ behavior: 'immediate' }
		);
	} catch (cause) {
		try {
			await removeIfUnused(key);
		} catch {
			console.error('Clearance template staging cleanup failed.');
		}
		throw cause;
	}
	let cleanupWarning = false;
	if (previous)
		try {
			await removeIfUnused(previous.objectKey);
		} catch {
			cleanupWarning = true;
			console.error('Previous clearance draft cleanup failed.');
		}
	return { success: true, cleanupWarning, id, revision };
}
export function saveClearanceDefinition(expectedRevision: string, input: unknown) {
	const parsed = definitionSchema.safeParse(input);
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Invalid template areas.');
	return db.transaction(
		(tx) => {
			const previous = requireDraft(expectedRevision);
			if (previous.semester !== null && previous.schoolYearStart !== null) {
				const issue = templateTermIssue(parsed.data, {
					semester: previous.semester,
					schoolYearStart: previous.schoolYearStart
				});
				if (issue)
					error(
						400,
						'The marked semester and school year must match this draft. Create a new draft for another term.'
					);
			}
			const definition = {
				...parsed.data,
				personalFields: parsed.data.personalFields ?? previous.definition?.personalFields,
				officeRows: parsed.data.officeRows ?? previous.definition?.officeRows
			};
			const revision = randomUUID();
			const saved = tx
				.update(clearanceTemplate)
				.set({
					definition,
					revision,
					semester: Number(definition.semester),
					schoolYearStart: Number(definition.schoolYear.slice(0, 4))
				})
				.where(eq(clearanceTemplate.revision, expectedRevision))
				.returning({ id: clearanceTemplate.id })
				.get();
			if (!saved) error(409, 'Template changed. Refresh before saving its areas.');
			return { success: true, revision };
		},
		{ behavior: 'immediate' }
	);
}
export function reuseClearanceTemplate(sourceRevision: string, term: Term, actorId: string) {
	return db.transaction(
		(tx) => {
			const source = getClearanceTemplate(sourceRevision);
			if (!source?.definition) error(409, 'Save the source template areas before reusing it.');
			const definition = definitionSchema.parse({
				...source.definition,
				semester: String(term.semester),
				schoolYear: `${term.schoolYearStart}-${term.schoolYearStart + 1}`
			});
			const revision = randomUUID();
			const saved = tx
				.insert(clearanceTemplate)
				.values({
					revision,
					...term,
					objectKey: source.objectKey,
					filename: source.filename,
					contentType: source.contentType,
					size: source.size,
					uploadedAt: new Date(),
					uploadedBy: actorId,
					definition,
					needsImageUpdate:
						source.needsImageUpdate ||
						source.semester !== term.semester ||
						source.schoolYearStart !== term.schoolYearStart
				})
				.returning({ id: clearanceTemplate.id })
				.get()!;
			return { success: true, id: saved.id, revision };
		},
		{ behavior: 'immediate' }
	);
}
export function activateClearanceTemplate(
	expectedRevision: string,
	expectedActiveRevision: string
) {
	return db.transaction(
		(tx) => {
			const draft = requireDraft(expectedRevision);
			const parsed = definitionSchema.safeParse(draft.definition);
			if (
				!parsed.success ||
				!parsed.data.officeRows?.length ||
				parsed.data.officeRows.some((row) => !row.cleared || !row.signature)
			)
				error(
					400,
					'Save complete template areas and all office checkbox/signature boxes before activation.'
				);
			if (draft.needsImageUpdate)
				error(
					400,
					'Upload a reference image printed with the new semester and school year before activation.'
				);
			if (
				draft.semester === null ||
				draft.schoolYearStart === null ||
				templateTermIssue(parsed.data, {
					semester: draft.semester,
					schoolYearStart: draft.schoolYearStart
				})
			)
				error(400, 'The reference definition must match the draft term.');
			const previous = activeTemplateForEnrollment(tx, {
				semester: draft.semester,
				schoolYearStart: draft.schoolYearStart
			});
			if ((previous?.revision ?? '') !== expectedActiveRevision)
				error(409, 'The active template changed. Refresh before activating this draft.');
			if (previous)
				tx.update(clearanceTemplate)
					.set({ active: false })
					.where(eq(clearanceTemplate.id, previous.id))
					.run();
			tx.update(clearanceTemplate)
				.set({ active: true, activatedAt: new Date() })
				.where(eq(clearanceTemplate.revision, expectedRevision))
				.run();
			return { success: true };
		},
		{ behavior: 'immediate' }
	);
}
export async function getClearanceTemplateImage(
	signal?: AbortSignal,
	expectedRevision?: string | null,
	allowDraft = false
) {
	const saved = expectedRevision
		? getClearanceTemplate(expectedRevision)
		: db
				.select()
				.from(clearanceTemplate)
				.where(allowDraft ? undefined : eq(clearanceTemplate.active, true))
				.orderBy(desc(clearanceTemplate.id))
				.get();
	if (!saved) error(404, 'Clearance template version is unavailable. Refresh the page.');
	if (!allowDraft && !saved.activatedAt)
		error(403, 'Only administrators can view draft templates.');
	const response = await downloadObject(saved.objectKey, signal);
	response.headers.set('Content-Type', saved.contentType);
	response.headers.set(
		'Content-Disposition',
		(response.headers.get('Content-Disposition') ?? 'inline').replace(/^attachment/, 'inline')
	);
	return response;
}
