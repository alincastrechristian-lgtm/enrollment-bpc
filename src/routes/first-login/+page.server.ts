import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	if (event.locals.user && event.locals.user.setupComplete) {
		return redirect(302, '/user/dashboard');
	}

	if (!event.locals.user) {
		return redirect(302, '/');
	}
	return {};
};
