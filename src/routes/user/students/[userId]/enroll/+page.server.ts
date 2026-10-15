import { Role } from '#lib/Roles.js';
import { curriculumSubject, enrollment, program, studentData, subject, user } from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { getEnrollmentContext } from '#lib/server/enrollment.js';
import { error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params, url }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	const record = db
		.select({ student: studentData, name: user.name, email: user.email })
		.from(studentData)
		.innerJoin(user, eq(user.id, studentData.userId))
		.where(and(eq(user.id, params.userId), eq(user.role, Role.STUDENT)))
		.get();
	if (!record) error(404, 'Student not found.');
	const current = record.student.currentEnrollmentId
		? db
				.select()
				.from(enrollment)
				.where(
					and(
						eq(enrollment.id, record.student.currentEnrollmentId),
						eq(enrollment.studentId, record.student.studentId)
					)
				)
				.get()
		: null;
	const programCode = url.searchParams.get('programCode')?.trim();
	const context = programCode ? getEnrollmentContext(db, params.userId, programCode) : null;
	const nextYear = !!current && current.semester >= (context?.curriculum.semesters ?? 2);
	return {
		student: {
			...record.student,
			name: record.name,
			email: record.email,
			yearLevel: current ? current.yearLevel + (nextYear ? 1 : 0) : 1,
			semester: current && !nextYear ? current.semester + 1 : 1
		},
		programs: db
			.select({ code: program.code, name: program.name })
			.from(program)
			.where(eq(program.isActive, true))
			.orderBy(asc(program.code))
			.all(),
		programCode: programCode ?? '',
		schoolYearStart:
			(current ? current.schoolYearStart + (nextYear ? 1 : 0) : undefined) ??
			Number(
				new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric' }).format(
					new Date()
				)
			),
		plan: context
			? {
					curriculum: context.curriculum,
					program: context.program,
					entries: db
						.select()
						.from(curriculumSubject)
						.where(eq(curriculumSubject.curriculumId, context.curriculum.id))
						.orderBy(
							asc(curriculumSubject.yearLevel),
							asc(curriculumSubject.semester),
							asc(curriculumSubject.subjectCode)
						)
						.all(),
					subjects: db
						.select({
							id: subject.id,
							code: subject.code,
							name: subject.name,
							isActive: subject.isActive
						})
						.from(subject)
						.orderBy(asc(subject.code))
						.all()
				}
			: null
	};
};
