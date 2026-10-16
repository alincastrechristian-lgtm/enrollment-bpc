import { createReportCsv, getReports } from '#lib/server/reports.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) => {
	const report = getReports(event);
	const { schoolYearStart, semester } = report.filters;
	return new Response(createReportCsv(report), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${report.kind}-${schoolYearStart}-${schoolYearStart + 1}-semester-${semester}.csv"`,
			'Cache-Control': 'private, no-store'
		}
	});
};
