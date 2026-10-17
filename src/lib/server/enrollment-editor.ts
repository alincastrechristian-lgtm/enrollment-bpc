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
import { and, asc, eq, getTableColumns, or } from 'drizzle-orm';
import { getStudentEnrollment } from './student-enrollment';
import { canCorrectEnrollment } from './enrollment-corrections';

export function loadEnrollmentEditor({
	locals,
	url,
	userId,
	enrollmentId
}: {
	locals: App.Locals;
	url: URL;
	userId: string;
	enrollmentId?: string;
}) {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	const record = db
		.select({ student: studentData, name: user.name, email: user.email })
		.from(studentData)
		.innerJoin(user, eq(user.id, studentData.userId))
		.where(and(eq(user.id, userId), eq(user.role, Role.STUDENT)))
		.get();
	if (!record) error(404, 'Student not found.');
	const correction = enrollmentId ? getStudentEnrollment(db, userId, enrollmentId) : null;
	if (correction && !canCorrectEnrollment(locals.user?.role, correction))
		error(
			409,
			'Only unfinalized enrollments can be corrected. Registrars can correct only the current enrollment.'
		);
	const target = correction
		? db
				.select({
					...getTableColumns(enrollment),
					programCode: curriculum.programCode,
					curriculumSemesters: curriculum.semesters
				})
				.from(enrollment)
				.innerJoin(curriculum, eq(curriculum.id, enrollment.curriculumId))
				.where(eq(enrollment.id, correction.enrollment.id))
				.get()!
		: null;
	const originalSubjects = target
		? db
				.select()
				.from(enrollmentSubject)
				.where(eq(enrollmentSubject.enrollmentId, target.id))
				.orderBy(asc(enrollmentSubject.subjectCode))
				.all()
		: [];
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
	const gradeConcerns = getGradeConcerns(
		current && !correction
			? db
					.select({ grade: enrollmentSubject.grade })
					.from(enrollmentSubject)
					.where(eq(enrollmentSubject.enrollmentId, current.id))
					.all()
			: [],
		!correction && !!current?.finalizedGrades && current.status !== 'dropped'
	);
	const enrollmentLockReason = correction
		? null
		: getEnrollmentLockReason(current, gradeConcerns.failedCount);
	const programs = db
		.select({ code: program.code, name: program.name })
		.from(program)
		.where(
			or(eq(program.isActive, true), target ? eq(program.code, target.programCode) : undefined)
		)
		.orderBy(asc(program.code))
		.all();
	const programCode =
		url.searchParams.get('programCode')?.trim() ||
		programs.find((entry) => entry.code === (target ?? current)?.programCode)?.code ||
		'';
	const context =
		programCode && !enrollmentLockReason
			? getEnrollmentContext(db, userId, programCode, target?.curriculumId)
			: null;
	const restoring = !correction && current?.status === 'dropped';
	// Advance using the enrolled curriculum's calendar, even if the program changes.
	const nextYear =
		!correction && !!current && !restoring && current.semester >= current.curriculumSemesters;
	return {
		editing: target
			? { enrollmentId: target.id, revision: target.revision, originalSubjects }
			: null,
		restoringDropped: restoring,
		enrollmentLockReason,
		gradeConcerns,
		student: {
			...record.student,
			name: record.name,
			email: record.email,
			yearLevel: target?.yearLevel ?? (current ? current.yearLevel + (nextYear ? 1 : 0) : 1),
			semester:
				target?.semester ??
				(restoring ? current.semester : current && !nextYear ? current.semester + 1 : 1),
			section: (target ?? current)?.section ?? ''
		},
		programs,
		programCode: programCode ?? '',
		schoolYearStart:
			target?.schoolYearStart ??
			(current ? current.schoolYearStart + (nextYear ? 1 : 0) : undefined) ??
			Number(
				new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric' }).format(
					new Date()
				)
			),
		plan: context
			? {
					restoredSubjects: target
						? programCode === target.programCode
							? originalSubjects.map((entry) => ({ id: entry.subjectId, units: entry.units }))
							: null
						: restoring
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
}
