import { Role } from '#lib/Roles.js';
import type { EmailEventType } from '#lib/email.js';
import { notification, user } from '#lib/schema.js';
import type { db, Transaction } from './db/index';
import { and, count, desc, eq, isNull, like, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { error } from '@sveltejs/kit';

type Database = typeof db | Transaction;
type Viewer = { id: string; role?: string | null };

function visibility(viewer: Viewer) {
	switch (viewer.role) {
		case Role.ADMIN:
			return undefined;
		case Role.REGISTRAR:
			return eq(notification.actorId, viewer.id);
		case Role.STUDENT:
			return eq(notification.recipientId, viewer.id);
		default:
			error(403, 'Forbidden');
	}
}

export function recordNotification(
	database: Database,
	data: {
		recipientId: string;
		actorId?: string | null;
		enrollmentId?: string;
		type: EmailEventType;
		title: string;
		message: string;
	}
) {
	return database.insert(notification).values(data).returning({ id: notification.id }).get()!;
}

export function getNotificationCounts(database: Database, viewer: Viewer) {
	const scope = visibility(viewer);
	const total = database.select({ value: count() }).from(notification).where(scope).get()!.value;
	const unread =
		viewer.role === Role.STUDENT
			? database
					.select({ value: count() })
					.from(notification)
					.where(and(scope, isNull(notification.readAt)))
					.get()!.value
			: 0;
	return { total, unread };
}

export function getNotifications(
	database: Database,
	viewer: Viewer,
	options: {
		search?: string;
		type?: EmailEventType;
		unreadOnly?: boolean;
		page?: number;
		pageSize?: number;
	} = {}
) {
	const actor = alias(user, 'notification_actor');
	const search = options.search?.trim();
	const where = and(
		visibility(viewer),
		options.type ? eq(notification.type, options.type) : undefined,
		options.unreadOnly && viewer.role === Role.STUDENT ? isNull(notification.readAt) : undefined,
		search
			? or(
					like(notification.title, `%${search}%`),
					like(notification.message, `%${search}%`),
					like(user.name, `%${search}%`)
				)
			: undefined
	);
	const total = database
		.select({ value: count() })
		.from(notification)
		.innerJoin(user, eq(user.id, notification.recipientId))
		.where(where)
		.get()!.value;
	const pageSize = options.pageSize ?? 20;
	const pages = Math.max(1, Math.ceil(total / pageSize));
	const page = Math.min(pages, Math.max(1, options.page ?? 1));
	const items = database
		.select({
			id: notification.id,
			type: notification.type,
			title: notification.title,
			message: notification.message,
			createdAt: notification.createdAt,
			enrollmentId: notification.enrollmentId,
			recipientId: notification.recipientId,
			recipientName: user.name,
			actorName: actor.name,
			readAt: notification.readAt
		})
		.from(notification)
		.innerJoin(user, eq(user.id, notification.recipientId))
		.leftJoin(actor, eq(actor.id, notification.actorId))
		.where(where)
		.orderBy(desc(notification.createdAt), desc(notification.id))
		.limit(pageSize)
		.offset((page - 1) * pageSize)
		.all();
	return {
		items: viewer.role === Role.STUDENT ? items : items.map((item) => ({ ...item, readAt: null })),
		total,
		page,
		pages,
		pageSize
	};
}

export type NotificationItem = ReturnType<typeof getNotifications>['items'][number];

export function markNotificationsRead(database: Database, viewer: Viewer, id?: string) {
	if (viewer.role !== Role.STUDENT) error(403, 'Only recipients can mark notifications as read.');
	const where = and(
		eq(notification.recipientId, viewer.id),
		id ? eq(notification.id, id) : undefined
	);
	if (id && !database.select({ id: notification.id }).from(notification).where(where).get())
		error(404, 'Notification not found.');
	database
		.update(notification)
		.set({ readAt: new Date() })
		.where(and(where, isNull(notification.readAt)))
		.run();
}
