import { db } from '#lib/server/db/index.js';
import { getCertificateOfRegistration } from '#lib/server/cor.js';
import { createCORPdf } from '#lib/server/cor-pdf.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const record = getCertificateOfRegistration(db, locals, params.enrollmentId);
	const bytes = await createCORPdf(record);
	const safeStudentId = record.student.studentId.replace(/[^a-zA-Z0-9_-]/g, '_');
	return new Response(new Uint8Array(bytes), {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="COR-${safeStudentId}-${record.enrollment.schoolYearStart}-semester-${record.enrollment.semester}.pdf"`,
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
