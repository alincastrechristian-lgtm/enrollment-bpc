import { randomUUID } from 'node:crypto';
import {
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client
} from '@aws-sdk/client-s3';
import { GARAGE_API_ENDPOINT, GARAGE_REGION } from '$app/env/private';
import { error, isHttpError } from '@sveltejs/kit';
import { GARAGE_BUCKET } from './index';
import { getGarageCredentials } from './credentials';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FORM_BYTES = MAX_FILE_BYTES + 64 * 1024;
let client: S3Client | undefined;

export function fileStorageConfigured(): boolean {
	return Boolean(GARAGE_API_ENDPOINT && getGarageCredentials());
}

export function getGarageS3Client(): S3Client {
	if (!fileStorageConfigured()) error(503, 'File storage is not configured.');
	return (client ??= new S3Client({
		endpoint: GARAGE_API_ENDPOINT,
		region: GARAGE_REGION,
		credentials: async () => {
			const credentials = getGarageCredentials();
			if (!credentials) error(503, 'File storage is not configured.');
			return credentials;
		},
		forcePathStyle: true,
		requestChecksumCalculation: 'WHEN_REQUIRED',
		responseChecksumValidation: 'WHEN_REQUIRED',
		requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000 },
		maxAttempts: 2
	}));
}

function prefix(userId: string): string {
	return `test-files/${encodeURIComponent(userId)}/`;
}

export async function readFileUpload(request: Request): Promise<File> {
	if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) {
		error(415, 'Choose a file using the upload form.');
	}
	if (Number(request.headers.get('content-length')) > MAX_FORM_BYTES)
		error(413, 'Maximum file size is 10 MiB.');
	const reader = request.body?.getReader();
	if (!reader) error(400, 'Choose a file to upload.');
	const chunks: Uint8Array<ArrayBuffer>[] = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > MAX_FORM_BYTES) {
				await reader.cancel();
				error(413, 'Maximum file size is 10 MiB.');
			}
			chunks.push(value);
		}
		const form = await new Response(new Blob(chunks), { headers: request.headers }).formData();
		const file = form.get('file');
		if (!(file instanceof File) || !file.name) error(400, 'Choose a file to upload.');
		if (file.size > MAX_FILE_BYTES) error(413, 'Maximum file size is 10 MiB.');
		return file;
	} catch (caught) {
		if (isHttpError(caught)) throw caught;
		error(400, 'Could not read the uploaded file.');
	} finally {
		reader.releaseLock();
	}
}

export async function uploadFile(userId: string, file: File): Promise<string> {
	if (file.size > MAX_FILE_BYTES) error(413, 'Maximum file size is 10 MiB.');
	const name = safeUploadName(file.name);
	await getGarageS3Client().send(
		new PutObjectCommand({
			Bucket: GARAGE_BUCKET,
			Key: `${prefix(userId)}${randomUUID()}/${name}`,
			Body: new Uint8Array(await file.arrayBuffer()),
			ContentLength: file.size,
			ContentType: 'application/octet-stream'
		})
	);
	return name;
}

export function safeUploadName(filename: string): string {
	let name =
		Array.from(filename)
			.filter(
				(char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127 && !'/\\'.includes(char)
			)
			.slice(0, 180)
			.join('') || 'file';
	if (name === '.' || name === '..') name = 'file';
	return name;
}

export async function listFiles(userId: string, continuationToken?: string) {
	const result = await getGarageS3Client().send(
		new ListObjectsV2Command({
			Bucket: GARAGE_BUCKET,
			Prefix: prefix(userId),
			MaxKeys: 100,
			ContinuationToken: continuationToken
		})
	);
	return {
		files: (result.Contents ?? [])
			.filter((item) => item.Key?.startsWith(prefix(userId)))
			.map((item) => ({
				key: item.Key!,
				name: item.Key!.split('/').at(-1) || 'file',
				size: item.Size ?? 0,
				modified: item.LastModified?.toISOString() ?? null
			})),
		nextToken: result.IsTruncated ? result.NextContinuationToken : undefined
	};
}

export async function downloadFile(
	userId: string,
	key: string,
	signal?: AbortSignal
): Promise<Response> {
	if (
		!key.startsWith(prefix(userId)) ||
		key.endsWith('/') ||
		key.split('/').some((segment) => segment === '.' || segment === '..')
	)
		error(404, 'File not found.');
	return downloadObject(key, signal);
}

export async function downloadObject(key: string, signal?: AbortSignal): Promise<Response> {
	const result = await getGarageS3Client().send(
		new GetObjectCommand({ Bucket: GARAGE_BUCKET, Key: key }),
		{
			abortSignal: signal
		}
	);
	if (!result.Body) error(404, 'File not found.');
	const name = key.split('/').at(-1) || 'file';
	const encoded = encodeURIComponent(name).replace(
		/[!'()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
	);
	const headers = new Headers({
		'Content-Type': 'application/octet-stream',
		'Content-Disposition': `attachment; filename="download"; filename*=UTF-8''${encoded}`,
		'Cache-Control': 'private, no-store',
		'X-Content-Type-Options': 'nosniff'
	});
	if (result.ContentLength !== undefined)
		headers.set('Content-Length', String(result.ContentLength));
	return new Response(result.Body.transformToWebStream(), { headers });
}
