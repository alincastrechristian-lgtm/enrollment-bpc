import { validateUser } from '#lib/server/auth.js';
import { downloadFile } from '#lib/server/garage/files.js';
import { error, isHttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url, request }) => {
	validateUser(locals);
	const key = url.searchParams.get('key');
	if (!key) error(400, 'Choose a file to download.');
	try {
		return await downloadFile(locals.user.id, key, request.signal);
	} catch (caught) {
		if (isHttpError(caught)) throw caught;
		if (caught instanceof Error && caught.name === 'NoSuchKey') error(404, 'File not found.');
		error(503, 'Download failed. Check storage connectivity and try again.');
	}
};
