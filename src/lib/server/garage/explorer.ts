import { randomUUID } from 'node:crypto';
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { getGarageS3Client, downloadObject, safeUploadName, MAX_FILE_BYTES } from './files';
import { GARAGE_BUCKET } from './index';

function validKey(key: string): boolean {
	return (
		Buffer.byteLength(key, 'utf8') <= 1024 &&
		!key.startsWith('/') &&
		!key.split('/').some((segment) => segment === '.' || segment === '..') &&
		!Array.from(key).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
	);
}

export function storageFolder(folder: string): string {
	if (!validKey(folder) || (folder !== '' && !folder.endsWith('/')))
		error(400, 'Choose a valid storage folder.');
	return folder;
}

export async function browseStorage(folder: string, cursor?: string) {
	storageFolder(folder);
	if (cursor && cursor.length > 8192) error(400, 'Invalid file-list cursor.');
	const result = await getGarageS3Client().send(
		new ListObjectsV2Command({
			Bucket: GARAGE_BUCKET,
			Prefix: folder,
			Delimiter: '/',
			MaxKeys: 100,
			ContinuationToken: cursor
		})
	);
	return {
		folders: (result.CommonPrefixes ?? []).flatMap(({ Prefix }) =>
			Prefix && Prefix.startsWith(folder) && validKey(Prefix)
				? [{ prefix: Prefix, name: Prefix.slice(folder.length).replace(/\/$/, '') }]
				: []
		),
		files: (result.Contents ?? []).flatMap((item) =>
			item.Key && item.Key.startsWith(folder) && !item.Key.endsWith('/') && validKey(item.Key)
				? [
						{
							key: item.Key,
							name: item.Key.slice(folder.length),
							size: item.Size ?? 0,
							modified: item.LastModified?.toISOString() ?? null
						}
					]
				: []
		),
		nextToken: result.IsTruncated ? (result.NextContinuationToken ?? null) : null
	};
}

export async function uploadStorageFile(folder: string, file: File): Promise<string> {
	storageFolder(folder);
	if (file.size > MAX_FILE_BYTES) error(413, 'Maximum file size is 10 MiB.');
	// Garage has no conditional writes: unique names prevent concurrent overwrites.
	const name = `${randomUUID()}-${safeUploadName(file.name)}`;
	const key = folder + name;
	if (!validKey(key)) error(400, 'Folder path is too long for this filename.');
	await getGarageS3Client().send(
		new PutObjectCommand({
			Bucket: GARAGE_BUCKET,
			Key: key,
			Body: new Uint8Array(await file.arrayBuffer()),
			ContentLength: file.size,
			ContentType: 'application/octet-stream'
		})
	);
	return name;
}

export async function downloadStorageFile(key: string, signal?: AbortSignal): Promise<Response> {
	if (!key || key.endsWith('/') || !validKey(key)) error(400, 'Choose a valid file to download.');
	return downloadObject(key, signal);
}

export const deleteSchema = z
	.object({
		kind: z.enum(['file', 'folder']),
		key: z.string().min(1),
		confirmed: z.literal('yes')
	})
	.strict();

export async function deleteStorageEntry(folder: string, input: unknown): Promise<void> {
	storageFolder(folder);
	const parsed = deleteSchema.safeParse(input);
	if (!parsed.success) error(400, 'Choose a file or folder and confirm permanent deletion.');
	const { key, kind } = parsed.data;
	const child = key.slice(folder.length);
	const name = kind === 'folder' ? child.slice(0, -1) : child;
	if (
		!validKey(key) ||
		!key.startsWith(folder) ||
		!name ||
		name.includes('/') ||
		(kind === 'folder' ? !key.endsWith('/') : key.endsWith('/'))
	)
		error(400, 'Choose a file or folder in the current folder.');

	const client = getGarageS3Client();
	let cursor: string | undefined;
	do {
		const page =
			kind === 'folder'
				? await client.send(
						new ListObjectsV2Command({
							Bucket: GARAGE_BUCKET,
							Prefix: key,
							MaxKeys: 1000,
							ContinuationToken: cursor
						})
					)
				: { Contents: [{ Key: key }], IsTruncated: false, NextContinuationToken: undefined };
		const keys = (page.Contents ?? []).map((item) => item.Key);
		if (keys.some((item) => !item || (kind === 'folder' ? !item.startsWith(key) : item !== key)))
			error(503, 'Unexpected folder listing. Deletion stopped; refresh before retrying.');
		if (page.IsTruncated && (!page.NextContinuationToken || page.NextContinuationToken === cursor))
			error(503, 'Incomplete folder listing. Some files may remain; refresh before retrying.');
		if (keys.length) {
			const result = await client.send(
				new DeleteObjectsCommand({
					Bucket: GARAGE_BUCKET,
					Delete: { Objects: keys.map((Key) => ({ Key: Key! })), Quiet: true }
				})
			);
			if (result.Errors?.length)
				error(503, 'Some files could not be deleted. Refresh and retry the remaining files.');
		}
		cursor = page.IsTruncated ? page.NextContinuationToken : undefined;
	} while (cursor);
}
