import { command, getRequestEvent } from '$app/server';
import { z } from 'zod';
import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { markNotificationsRead } from '#lib/server/notifications.js';

export const readNotifications = command(
	z.object({ id: z.string().min(1).optional() }),
	({ id }) => {
		const { locals } = getRequestEvent();
		validateUser(locals, [Role.STUDENT]);
		markNotificationsRead(db, locals.user, id);
		return { success: true };
	}
);
