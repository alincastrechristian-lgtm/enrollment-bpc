import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = (event) => {
	if (!event.locals.user) {
		return redirect(302, resolve('/login'));
	}
	return {};
};
