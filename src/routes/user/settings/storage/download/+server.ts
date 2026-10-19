import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { downloadStorageFile } from '#lib/server/garage/explorer.js';
import { error, isHttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url, request }) => {
	validateUser(locals, [Role.ADMIN]);
	try {
		return await downloadStorageFile(url.searchParams.get('key') || '', request.signal);
	} catch (caught) {
		if (isHttpError(caught)) throw caught;
		if (caught instanceof Error && caught.name === 'NoSuchKey') error(404, 'File not found.');
		error(503, 'Download failed. Check storage connectivity and try again.');
	}
};
