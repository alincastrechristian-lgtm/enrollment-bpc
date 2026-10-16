import { getMasterlist } from '#lib/server/masterlist.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, url }) => {
	const { students, total, nextPage } = getMasterlist({ locals, url });
	return json({ students, total, nextPage }, { headers: { 'Cache-Control': 'private, no-store' } });
};
