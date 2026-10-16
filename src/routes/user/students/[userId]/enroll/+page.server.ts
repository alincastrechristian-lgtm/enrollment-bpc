import { Role } from '#lib/Roles.js';
import {
	curriculumSubject,
	curriculum,
	enrollment,
	enrollmentSubject,
	program,
	studentData,
	subject,
	user
} from '#lib/schema.js';
import { getGradeConcerns } from '#lib/enrollment-grades.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import {
	getEnrollmentContext,
	getEnrollmentLockReason,
	getOutstandingEnrollmentSubjects
} from '#lib/server/enrollment.js';
import { error } from '@sveltejs/kit';
import { and, asc, eq, getTableColumns } from 'drizzle-orm';
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
		? (db
				.select({
					...getTableColumns(enrollment),
					programCode: curriculum.programCode,
					curriculumSemesters: curriculum.semesters
				})
				.from(enrollment)
				.innerJoin(curriculum, eq(curriculum.id, enrollment.curriculumId))
				.where(
					and(
						eq(enrollment.id, record.student.currentEnrollmentId),
						eq(enrollment.studentId, record.student.studentId)
					)
				)
				.get() ?? null)
		: null;
	if (record.student.currentEnrollmentId && !current)
		error(409, 'Current enrollment is unavailable. Refresh and try again.');
	const enrollmentLockReason = getEnrollmentLockReason(current);
	const programs = db
		.select({ code: program.code, name: program.name })
		.from(program)
		.where(eq(program.isActive, true))
		.orderBy(asc(program.code))
		.all();
	const programCode =
		url.searchParams.get('programCode')?.trim() ||
		programs.find((entry) => entry.code === current?.programCode)?.code ||
		'';
	const context =
		programCode && !enrollmentLockReason
			? getEnrollmentContext(db, params.userId, programCode)
			: null;
	const restoring = current?.status === 'dropped';
	// Advance using the enrolled curriculum's calendar, even if the program changes.
	const nextYear = !!current && !restoring && current.semester >= current.curriculumSemesters;
	return {
		restoringDropped: restoring,
		enrollmentLockReason,
		gradeConcerns: getGradeConcerns(
			current
				? db
						.select({ grade: enrollmentSubject.grade })
						.from(enrollmentSubject)
						.where(eq(enrollmentSubject.enrollmentId, current.id))
						.all()
				: [],
			!!current?.finalizedGrades && !restoring
		),
		student: {
			...record.student,
			name: record.name,
			email: record.email,
			yearLevel: current ? current.yearLevel + (nextYear ? 1 : 0) : 1,
			semester: restoring ? current.semester : current && !nextYear ? current.semester + 1 : 1,
			section: current?.section ?? ''
		},
		programs,
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
					restoredSubjects: restoring
						? db
								.select({ id: enrollmentSubject.subjectId, units: enrollmentSubject.units })
								.from(enrollmentSubject)
								.where(eq(enrollmentSubject.enrollmentId, current.id))
								.orderBy(asc(enrollmentSubject.subjectCode))
								.all()
						: null,
					outstandingSubjects: getOutstandingEnrollmentSubjects(db, record.student.studentId),
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
