import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { readFileUpload } from '#lib/server/garage/files.js';
import { storageFolder, uploadStorageFile } from '#lib/server/garage/explorer.js';
import { error, isHttpError, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request, url }) => {
	validateUser(locals, [Role.ADMIN]);
	try {
		const folder = storageFolder(url.searchParams.get('prefix') || '');
		const name = await uploadStorageFile(folder, await readFileUpload(request));
		return json({ name });
	} catch (caught) {
		if (isHttpError(caught)) throw caught;
		error(503, 'Upload failed. Check storage connectivity and try again.');
	}
};
