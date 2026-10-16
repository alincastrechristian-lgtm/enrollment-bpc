import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { LayoutServerLoad } from './$types';
import { db } from '#lib/server/db/index.js';
import { getNotificationCounts } from '#lib/server/notifications.js';

export const load: LayoutServerLoad = (event) => {
	if (!event.locals.user) {
		return redirect(302, resolve('/login'));
	}
	return { unreadNotifications: getNotificationCounts(db, event.locals.user).unread };
};
