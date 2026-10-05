import { redirect } from '@sveltejs/kit';

export async function load() {
	redirect(302, '/user/settings/profile');
}
