import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { user } from '#lib/schema.js';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	validateUser(locals);
	setHeaders({ 'cache-control': 'no-store' });
	const account = await db.query.user.findFirst({
		where: eq(user.id, locals.user.id),
		columns: { twoFactorEnabled: true }
	});
	if (!account) error(404, 'Your account could not be found.');
	return { twoFactorEnabled: !!account.twoFactorEnabled };
};
