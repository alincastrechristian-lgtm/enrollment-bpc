import { createMasterlistCsv, getMasterlist } from '#lib/server/masterlist.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) => {
	const roster = getMasterlist(event, { all: true });
	const { schoolYearStart, semester } = roster.filters;
	return new Response(createMasterlistCsv(roster), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="masterlist-${schoolYearStart}-${schoolYearStart + 1}-semester-${semester}.csv"`,
			'Cache-Control': 'private, no-store'
		}
	});
};
