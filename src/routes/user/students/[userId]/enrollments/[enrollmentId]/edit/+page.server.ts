import { loadEnrollmentEditor } from '#lib/server/enrollment-editor.js';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals, params, url }) =>
	loadEnrollmentEditor({ locals, url, userId: params.userId, enrollmentId: params.enrollmentId });
