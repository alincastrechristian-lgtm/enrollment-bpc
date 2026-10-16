import { Role } from '#lib/Roles.js';
import {
	curriculum,
	enrollment,
	enrollmentSubject,
	program,
	studentData,
	subject,
	user
} from '#lib/schema.js';
import { db } from '#lib/server/db/index.js';
import {
	and,
	asc,
	count,
	desc,
	eq,
	exists,
	gt,
	gte,
	isNotNull,
	isNull,
	lt,
	ne,
	or,
	sql,
	type SQL
} from 'drizzle-orm';

export function getStaffDashboard(role: Role.ADMIN | Role.REGISTRAR, now = new Date()) {
	// One row per student account. The explicit current link owns status, not the newest term.
	const students = db
		.select({
			userId: sql<string>`${user.id}`.as('dashboard_user_id'),
			name: user.name,
			setupComplete: user.setupComplete,
			studentId: sql<string | null>`${studentData.studentId}`.as('dashboard_student_id'),
			enrollmentId: sql<string | null>`${enrollment.id}`.as('dashboard_enrollment_id'),
			status: enrollment.status,
			finalized: enrollment.finalizedGrades,
			clearance: enrollment.submittedClearance,
			followUpCompletedAt: enrollment.followUpCompletedAt,
			hasFailedGrades: exists(
				db
					.select({ id: enrollmentSubject.id })
					.from(enrollmentSubject)
					.where(
						and(eq(enrollmentSubject.enrollmentId, enrollment.id), gt(enrollmentSubject.grade, 3))
					)
			)
				.mapWith(Number)
				.as('dashboard_has_failed_grades'),
			programCode: curriculum.programCode,
			schoolYearStart: enrollment.schoolYearStart,
			semester: enrollment.semester,
			yearLevel: enrollment.yearLevel,
			section: enrollment.section,
			createdAt: user.createdAt
		})
		.from(user)
		.leftJoin(studentData, eq(studentData.userId, user.id))
		.leftJoin(
			enrollment,
			and(
				eq(enrollment.id, studentData.currentEnrollmentId),
				eq(enrollment.studentId, studentData.studentId)
			)
		)
		.leftJoin(curriculum, eq(curriculum.id, enrollment.curriculumId))
		.where(eq(user.role, Role.STUDENT))
		.as('dashboard_students');
	const tally = (condition: SQL) =>
		sql<number>`coalesce(sum(case when ${condition} then 1 else 0 end), 0)`.mapWith(Number);
	const gradesDue = and(
		eq(students.status, 'enrolled'),
		eq(students.finalized, false),
		eq(students.setupComplete, true)
	)!;
	const clearanceDue = and(
		eq(students.status, 'enrolled'),
		eq(students.finalized, true),
		eq(students.clearance, false)
	)!;
	const ready = and(
		eq(students.status, 'completed'),
		eq(students.finalized, true),
		eq(students.clearance, true),
		or(eq(students.hasFailedGrades, 0), isNotNull(students.followUpCompletedAt))
	)!;
	const setupDue = eq(students.setupComplete, false);
	const overview = db
		.select({
			totalStudents: count(),
			activeStudents: tally(eq(students.status, 'enrolled')),
			completedStudents: tally(eq(students.status, 'completed')),
			droppedStudents: tally(eq(students.status, 'dropped')),
			withoutEnrollment: tally(isNull(students.enrollmentId)),
			awaitingGrades: tally(gradesDue),
			awaitingClearance: tally(clearanceDue),
			readyForNextTerm: tally(ready),
			setupPending: tally(setupDue)
		})
		.from(students)
		.get()!;

	const queueFields = {
		userId: students.userId,
		name: students.name,
		studentId: students.studentId,
		enrollmentId: students.enrollmentId,
		programCode: students.programCode,
		schoolYearStart: students.schoolYearStart,
		semester: students.semester,
		yearLevel: students.yearLevel,
		section: students.section
	};
	const currentQueue = (condition: SQL) =>
		db
			.select(queueFields)
			.from(students)
			.where(condition)
			.orderBy(
				asc(students.schoolYearStart),
				asc(students.semester),
				asc(students.createdAt),
				asc(students.userId)
			)
			.limit(6)
			.all();

	// Match student meeting prompts: finalized concerns, including historical terms, excluding closed/dropped requests.
	const hasConcerns = exists(
		db
			.select({ id: enrollmentSubject.id })
			.from(enrollmentSubject)
			.where(
				and(
					eq(enrollmentSubject.enrollmentId, enrollment.id),
					or(gt(enrollmentSubject.grade, 3), isNull(enrollmentSubject.grade))
				)
			)
	);
	const needsFollowUp = and(
		eq(user.role, Role.STUDENT),
		ne(enrollment.status, 'dropped'),
		eq(enrollment.finalizedGrades, true),
		isNull(enrollment.followUpCompletedAt),
		hasConcerns
	)!;
	const followUpCount = db
		.select({ total: count(), sent: tally(isNotNull(enrollment.meetingRequestSentAt)) })
		.from(enrollment)
		.innerJoin(studentData, eq(studentData.studentId, enrollment.studentId))
		.innerJoin(user, eq(user.id, studentData.userId))
		.where(needsFollowUp)
		.get()!;
	const followUps = db
		.select({
			userId: user.id,
			name: user.name,
			studentId: studentData.studentId,
			enrollmentId: enrollment.id,
			programCode: curriculum.programCode,
			schoolYearStart: enrollment.schoolYearStart,
			semester: enrollment.semester,
			yearLevel: enrollment.yearLevel,
			section: enrollment.section,
			sentAt: enrollment.meetingRequestSentAt
		})
		.from(enrollment)
		.innerJoin(studentData, eq(studentData.studentId, enrollment.studentId))
		.innerJoin(user, eq(user.id, studentData.userId))
		.innerJoin(curriculum, eq(curriculum.id, enrollment.curriculumId))
		.where(needsFollowUp)
		.orderBy(asc(enrollment.schoolYearStart), asc(enrollment.semester), asc(enrollment.id))
		.limit(6)
		.all();

	const programs = db
		.select({ code: program.code, name: program.name, students: count(students.userId) })
		.from(program)
		.leftJoin(
			students,
			and(eq(students.programCode, program.code), eq(students.status, 'enrolled'))
		)
		.groupBy(program.id)
		.orderBy(desc(count(students.userId)), asc(program.code))
		.all();
	const gradeResults = db
		.select({
			passed: tally(sql`${enrollmentSubject.grade} between 1 and 3`),
			failed: tally(gt(enrollmentSubject.grade, 3)),
			incomplete: tally(isNull(enrollmentSubject.grade))
		})
		.from(enrollmentSubject)
		.innerJoin(students, eq(students.enrollmentId, enrollmentSubject.enrollmentId))
		.where(and(eq(students.finalized, true), ne(students.status, 'dropped')))
		.get()!;

	// Calendar months and boundaries use Manila time; null legacy timestamps are not fabricated.
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Asia/Manila',
		year: 'numeric',
		month: 'numeric'
	}).formatToParts(now);
	const year = Number(parts.find((part) => part.type === 'year')!.value);
	const month = Number(parts.find((part) => part.type === 'month')!.value) - 1;
	const start = new Date(Date.UTC(year, month - 5, 1) - 8 * 60 * 60 * 1000);
	const end = new Date(Date.UTC(year, month + 1, 1) - 8 * 60 * 60 * 1000);
	const monthKey = sql<string>`strftime('%Y-%m', ${enrollment.enrolledAt} / 1000, 'unixepoch', '+8 hours')`;
	const monthly = db
		.select({ month: monthKey, total: count() })
		.from(enrollment)
		.innerJoin(studentData, eq(studentData.studentId, enrollment.studentId))
		.innerJoin(user, eq(user.id, studentData.userId))
		.where(
			and(
				eq(user.role, Role.STUDENT),
				gte(enrollment.enrolledAt, start),
				lt(enrollment.enrolledAt, end),
				sql`${enrollment.enrolledAt} <= ${now.getTime()}`
			)
		)
		.groupBy(monthKey)
		.all();
	const trend = Array.from({ length: 6 }, (_, index) => {
		const date = new Date(Date.UTC(year, month - 5 + index, 1));
		const key = date.toISOString().slice(0, 7);
		return {
			key,
			label: new Intl.DateTimeFormat('en-PH', { month: 'short', timeZone: 'UTC' }).format(date),
			fullLabel: new Intl.DateTimeFormat('en-PH', {
				month: 'long',
				year: 'numeric',
				timeZone: 'UTC'
			}).format(date),
			total: monthly.find((entry) => entry.month === key)?.total ?? 0
		};
	});
	const recentEnrollments = db
		.select({
			userId: user.id,
			name: user.name,
			studentId: studentData.studentId,
			enrollmentId: enrollment.id,
			programCode: curriculum.programCode,
			schoolYearStart: enrollment.schoolYearStart,
			semester: enrollment.semester,
			yearLevel: enrollment.yearLevel,
			section: enrollment.section,
			status: enrollment.status,
			enrolledAt: enrollment.enrolledAt
		})
		.from(enrollment)
		.innerJoin(studentData, eq(studentData.studentId, enrollment.studentId))
		.innerJoin(user, eq(user.id, studentData.userId))
		.innerJoin(curriculum, eq(curriculum.id, enrollment.curriculumId))
		.where(eq(user.role, Role.STUDENT))
		.orderBy(desc(enrollment.enrolledAt), desc(enrollment.id))
		.limit(6)
		.all();

	// Staff-account and catalog health totals are returned only to administrators.
	const admin =
		role === Role.ADMIN
			? {
					registrars: db
						.select({ total: count(), setupPending: tally(eq(user.setupComplete, false)) })
						.from(user)
						.where(eq(user.role, Role.REGISTRAR))
						.get()!,
					programs: db
						.select({
							total: count(),
							active: tally(eq(program.isActive, true)),
							missingCurriculum: tally(
								and(
									eq(program.isActive, true),
									or(
										isNull(curriculum.id),
										isNull(curriculum.publishedAt),
										isNotNull(curriculum.archivedAt),
										eq(curriculum.isActive, false),
										ne(curriculum.programCode, program.code)
									)
								)!
							)
						})
						.from(program)
						.leftJoin(curriculum, eq(curriculum.id, program.activeCurriculumId))
						.get()!,
					curricula: db
						.select({
							total: count(),
							drafts: tally(and(isNull(curriculum.publishedAt), isNull(curriculum.archivedAt))!)
						})
						.from(curriculum)
						.get()!,
					subjects: db
						.select({ total: count(), active: tally(eq(subject.isActive, true)) })
						.from(subject)
						.get()!
				}
			: null;

	return {
		generatedAt: now,
		overview,
		followUpCount,
		programs,
		gradeResults,
		trend,
		recentEnrollments,
		admin,
		queues: {
			grades: currentQueue(gradesDue),
			clearance: currentQueue(clearanceDue),
			followUp: followUps,
			setup: currentQueue(setupDue),
			ready: currentQueue(ready)
		}
	};
}

export type StaffDashboardData = ReturnType<typeof getStaffDashboard>;
