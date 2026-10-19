import { validateUser } from '#lib/server/auth.js';
import {
	fileStorageConfigured,
	listFiles,
	readFileUpload,
	uploadFile
} from '#lib/server/garage/files.js';
import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, setHeaders }) => {
	if (!locals.user || !locals.session) redirect(303, resolve('/login'));
	setHeaders({ 'Cache-Control': 'private, no-store' });
	const configured = fileStorageConfigured();
	if (!configured) return { configured, files: [], storageError: null, nextToken: undefined };
	try {
		return {
			configured,
			...(await listFiles(locals.user.id, url.searchParams.get('cursor') || undefined)),
			storageError: null
		};
	} catch {
		return {
			configured,
			files: [],
			storageError: 'Could not load files. Check storage connectivity and try again.',
			nextToken: undefined
		};
	}
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		validateUser(locals);
		if (!fileStorageConfigured()) return fail(503, { error: 'File storage is not configured.' });
		try {
			const file = await readFileUpload(request);
			const name = await uploadFile(locals.user.id, file);
			return { uploaded: name };
		} catch (caught) {
			if (isHttpError(caught)) return fail(caught.status, { error: caught.body.message });
			return fail(503, { error: 'Upload failed. Check storage connectivity and try again.' });
		}
	}
};
