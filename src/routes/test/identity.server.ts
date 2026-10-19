import { Role } from '#lib/Roles.js';
import { user, studentData } from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityStudent } from '#lib/clearance/identity.js';
export { recognizeIdentity } from '#lib/server/handwriting.js';

export function getIdentityStudent(locals: App.Locals): IdentityStudent | null {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR, Role.STUDENT]);
	return (
		db
			.select({ name: user.name, studentNumber: studentData.studentId })
			.from(studentData)
			.innerJoin(user, eq(user.id, studentData.userId))
			.where(
				and(
					eq(user.role, Role.STUDENT),
					locals.user.role === Role.STUDENT
						? eq(user.id, locals.user.id)
						: eq(studentData.studentId, 'MA-23016578')
				)
			)
			.get() ?? null
	);
}

const maxBodyBytes = 2 * 1024 * 1024;
const imageSchema = z
	.string()
	.max(1_000_000)
	.regex(/^[A-Za-z0-9+/]+={0,2}$/);
const cropsSchema = z.object({ name: imageSchema, studentNumber: imageSchema }).strict();

export async function readIdentityCrops(request: Request) {
	if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
		error(415, 'Send the two field crops as JSON.');
	if (Number(request.headers.get('content-length')) > maxBodyBytes)
		error(413, 'Field crops are too large.');
	const reader = request.body?.getReader();
	if (!reader) error(400, 'Upload the name and student-number crops.');
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > maxBodyBytes) {
				await reader.cancel();
				error(413, 'Field crops are too large.');
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	let input: unknown;
	try {
		input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch {
		error(400, 'Invalid crop request.');
	}
	const parsed = cropsSchema.safeParse(input);
	if (!parsed.success) error(400, 'Upload two valid PNG field crops.');
	for (const encoded of Object.values(parsed.data)) {
		const png = Buffer.from(encoded, 'base64');
		if (
			png.length < 33 ||
			!png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
			png.readUInt32BE(8) !== 13 ||
			png.toString('ascii', 12, 16) !== 'IHDR'
		)
			error(400, 'Only PNG field crops are accepted.');
		const width = png.readUInt32BE(16),
			height = png.readUInt32BE(20);
		if (!width || !height || width > 2400 || height > 1000 || width * height > 2_000_000)
			error(400, 'Crop dimensions are too large or invalid.');
	}
	return parsed.data;
}
