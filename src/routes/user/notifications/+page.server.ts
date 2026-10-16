import { Role } from '#lib/Roles.js';
import { emailEventTypes } from '#lib/email.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { getNotificationCounts, getNotifications } from '#lib/server/notifications.js';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR, Role.STUDENT]);
	const search = url.searchParams.get('q')?.trim() ?? '';
	const parsedType = z
		.enum(emailEventTypes)
		.optional()
		.safeParse(url.searchParams.get('type') || undefined);
	if (!parsedType.success) error(400, 'Choose a valid notification type.');
	const status =
		locals.user.role === Role.STUDENT ? (url.searchParams.get('status') ?? 'all') : 'all';
	if (status !== 'all' && status !== 'unread') error(400, 'Choose a valid notification status.');
	const requestedPage = Number(url.searchParams.get('page'));
	return {
		...getNotifications(db, locals.user, {
			search,
			type: parsedType.data,
			unreadOnly: status === 'unread',
			page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
		}),
		counts: getNotificationCounts(db, locals.user),
		search,
		type: parsedType.data ?? '',
		status,
		role: locals.user.role
	};
};
