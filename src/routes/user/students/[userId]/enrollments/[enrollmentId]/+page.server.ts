import { Role } from '#lib/Roles.js';
import { curriculum, enrollmentSubject, enrollmentAudit } from '#lib/schema.js';
import {
	canCorrectEnrollment,
	canVoidEnrollment,
	canReopenEnrollment,
	type EnrollmentSnapshot
} from '#lib/server/enrollment-corrections.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import {
	canEditEnrollmentGrades,
	canDropEnrollment,
	canFinalizeEnrollmentGrades,
	getEnrollmentGradeLockReason,
	getStudentEnrollment
} from '#lib/server/student-enrollment.js';
import { error } from '@sveltejs/kit';
import { asc, desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	const record = getStudentEnrollment(db, params.userId, params.enrollmentId);
	const selectedCurriculum = await db.query.curriculum.findFirst({
		where: eq(curriculum.id, record.enrollment.curriculumId),
		with: { program: true }
	});
	if (!selectedCurriculum) error(404, 'Curriculum not found.');
	const subjects = db
		.select()
		.from(enrollmentSubject)
		.where(eq(enrollmentSubject.enrollmentId, record.enrollment.id))
		.orderBy(asc(enrollmentSubject.subjectCode), asc(enrollmentSubject.id))
		.all();
	const isCurrent = record.student.currentEnrollmentId === record.enrollment.id;
	const gradeLockReason = getEnrollmentGradeLockReason(record);
	return {
		canCorrect: canCorrectEnrollment(locals.user.role, record),
		canVoid: canVoidEnrollment(locals.user.role, record),
		canReopen: canReopenEnrollment(locals.user.role, record),
		audit: db
			.select()
			.from(enrollmentAudit)
			.where(eq(enrollmentAudit.enrollmentId, record.enrollment.id))
			.orderBy(desc(enrollmentAudit.createdAt), desc(enrollmentAudit.id))
			.all()
			.map((entry) => ({
				...entry,
				before: entry.before as EnrollmentSnapshot,
				after: entry.after as EnrollmentSnapshot
			})),
		canDrop: canDropEnrollment(locals.user.role, record),
		student: { ...record.user, studentId: record.student.studentId },
		enrollment: { ...record.enrollment, curriculum: selectedCurriculum, subjects },
		isCurrent,
		gradeLockReason,
		canEdit: canEditEnrollmentGrades(locals.user.role, record),
		canFinalize: canFinalizeEnrollmentGrades(locals.user.role, record)
	};
};
