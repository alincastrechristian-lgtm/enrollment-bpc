import { Role } from '#lib/Roles.js';
import {
	curriculum,
	enrollment,
	enrollmentSubject,
	program,
	studentData,
	user
} from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import type { db } from '#lib/server/db/index.js';
import { error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';

export function getCertificateOfRegistration(
	database: typeof db,
	locals: App.Locals,
	enrollmentId: string
) {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR, Role.STUDENT]);
	// Resolve both the record and its subjects in one read snapshot during corrections.
	return database.transaction((tx) => {
		const record = tx
			.select({
				student: {
					studentId: studentData.studentId,
					name: user.name,
					email: user.email,
					address: studentData.address,
					contactNumber: studentData.contactNumber,
					birthDate: studentData.birthDate,
					sex: studentData.sex
				},
				enrollment: {
					id: enrollment.id,
					programCode: curriculum.programCode,
					programName: program.name,
					schoolYearStart: enrollment.schoolYearStart,
					semester: enrollment.semester,
					yearLevel: enrollment.yearLevel,
					section: enrollment.section,
					status: enrollment.status
				}
			})
			.from(enrollment)
			.innerJoin(studentData, eq(studentData.studentId, enrollment.studentId))
			.innerJoin(user, eq(user.id, studentData.userId))
			.innerJoin(curriculum, eq(curriculum.id, enrollment.curriculumId))
			.innerJoin(program, eq(program.code, curriculum.programCode))
			.where(
				and(
					eq(enrollment.id, enrollmentId),
					eq(user.role, Role.STUDENT),
					locals.user.role === Role.STUDENT ? eq(user.id, locals.user.id) : undefined
				)
			)
			.get();
		// Apply ownership before reporting status; other students cannot probe this record.
		if (!record) error(404, 'Enrollment not found.');
		if (record.enrollment.status !== 'enrolled' && record.enrollment.status !== 'completed')
			error(409, 'A COR is available only for enrolled or completed enrollments.');
		const subjects = tx
			.select({
				code: enrollmentSubject.subjectCode,
				name: enrollmentSubject.subjectName,
				units: enrollmentSubject.units
			})
			.from(enrollmentSubject)
			.where(eq(enrollmentSubject.enrollmentId, record.enrollment.id))
			.orderBy(asc(enrollmentSubject.subjectCode), asc(enrollmentSubject.id))
			.all();
		if (!subjects.length) error(409, 'This enrollment has no registered subjects.');
		return { ...record, subjects };
	});
}

export type CertificateOfRegistration = ReturnType<typeof getCertificateOfRegistration>;
