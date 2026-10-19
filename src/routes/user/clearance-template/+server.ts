import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { getClearanceTemplateImage } from '#lib/server/clearance-template.js';
import { error, isHttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, request }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR, Role.STUDENT]);
	try {
		return await getClearanceTemplateImage(
			request.signal,
			new URL(request.url).searchParams.get('revision'),
			locals.user.role === Role.ADMIN
		);
	} catch (caught) {
		if (isHttpError(caught)) throw caught;
		if (caught instanceof Error && caught.name === 'NoSuchKey')
			error(404, 'Template file is unavailable. Contact an administrator.');
		error(503, 'Could not load the clearance template. Try again shortly.');
	}
};
