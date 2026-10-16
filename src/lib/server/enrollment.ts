import { Role } from '#lib/Roles.js';
import { getGradeConcerns, getGradeStatus } from '#lib/enrollment-grades.js';
import {
	user,
	enrollment,
	curriculum,
	curriculumSubject,
	enrollmentSubject,
	program,
	studentData,
	subject,
	SubjectSource
} from '#lib/schema.js';
import type { db, Transaction } from '#lib/server/db/index.js';
import { error } from '@sveltejs/kit';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

export const enrollStudentSchema = z.object({
	userId: z.string().trim().min(1, 'Student account is required'),
	programCode: z.string().trim().min(1, 'Program is required'),
	curriculumId: z.string().trim().min(1, 'Curriculum is required'),
	currentEnrollmentId: z.string().nullable(),
	acknowledgeGradeConcerns: z.boolean().default(false),
	section: z.string().trim().min(1, 'Section is required'),
	schoolYearStart: z.number().int().positive('School year start must be a positive integer'),
	semester: z.number().int().positive('Semester must be a positive integer'),
	yearLevel: z.number().int().positive('Year level must be a positive integer'),

	subjects: z
		.array(
			z.object({
				id: z.string().trim().min(1, 'Subject ID is required'),
				units: z.number().positive('Units must be positive')
			})
		)
		.min(1, 'At least one subject must be selected')
});

export type EnrollStudentInput = z.infer<typeof enrollStudentSchema>;
type EnrollmentSubjectValues = Omit<
	typeof enrollmentSubject.$inferInsert,
	'enrollmentId' | 'addedBy'
>;

export function getEnrollmentLockReason(
	current: Pick<typeof enrollment.$inferSelect, 'finalizedGrades' | 'submittedClearance'> | null
) {
	if (current && (!current.finalizedGrades || !current.submittedClearance))
		return 'Finalize grades and verify clearance for the current enrollment before enrolling this student again.';
	return null;
}

export function getOutstandingEnrollmentSubjects(
	database: typeof db | Transaction,
	studentId: string
) {
	const attempts = database
		.select({
			id: enrollmentSubject.subjectId,
			code: enrollmentSubject.subjectCode,
			name: enrollmentSubject.subjectName,
			units: enrollmentSubject.units,
			grade: enrollmentSubject.grade,
			schoolYearStart: enrollment.schoolYearStart,
			semester: enrollment.semester
		})
		.from(enrollmentSubject)
		.innerJoin(enrollment, eq(enrollment.id, enrollmentSubject.enrollmentId))
		.where(and(eq(enrollment.studentId, studentId), eq(enrollment.finalizedGrades, true)))
		.orderBy(
			desc(enrollment.schoolYearStart),
			desc(enrollment.semester),
			desc(enrollment.enrolledAt),
			desc(enrollment.id)
		)
		.all();
	// A later finalized result replaces an earlier failure or INC for the same subject.
	const latest = new Map<string, (typeof attempts)[number]>();
	for (const attempt of attempts) if (!latest.has(attempt.id)) latest.set(attempt.id, attempt);
	return [...latest.values()].filter(
		(attempt) => attempt.grade === null || getGradeStatus(attempt.grade, true) === 'Failed'
	);
}

// Share eligibility and curriculum checks between enrollment pages and the command.
export function getEnrollmentContext(
	database: typeof db | Transaction,
	userId: string,
	programCode: string
) {
	const record = database
		.select({ student: studentData, user: { id: user.id, name: user.name, email: user.email } })
		.from(studentData)
		.innerJoin(user, eq(user.id, studentData.userId))
		.where(and(eq(user.id, userId), eq(user.role, Role.STUDENT)))
		.get();
	if (!record) error(404, 'Student not found.');

	// Enrollment uses the program's selected, published curriculum.
	const owner = database.select().from(program).where(eq(program.code, programCode)).get();
	if (!owner) error(404, 'Program not found.');
	if (!owner.isActive) error(400, 'The program must be active before enrolling students.');
	if (!owner.activeCurriculumId)
		error(404, 'Select an active curriculum for this program before enrolling students.');

	const selectedCurriculum = database
		.select()
		.from(curriculum)
		.where(eq(curriculum.id, owner.activeCurriculumId))
		.get();
	if (
		!selectedCurriculum ||
		selectedCurriculum.programCode !== owner.code ||
		selectedCurriculum.publishedAt === null ||
		selectedCurriculum.archivedAt !== null ||
		!selectedCurriculum.isActive
	) {
		error(409, 'The active curriculum is unavailable. Refresh and try again.');
	}

	return { ...record, curriculum: selectedCurriculum, program: owner };
}

// Validate enrollment ownership, term, curriculum, and subject selection inside the transaction.
export function getEnrollmentPlan(database: typeof db | Transaction, data: EnrollStudentInput) {
	const context = getEnrollmentContext(database, data.userId, data.programCode);
	const selectedCurriculum = context.curriculum;
	if (selectedCurriculum.id !== data.curriculumId)
		error(409, 'Active curriculum changed. Refresh and try again.');
	if (context.student.currentEnrollmentId !== data.currentEnrollmentId)
		error(409, 'Current enrollment changed. Refresh and try again.');
	const duplicate = database
		.select({ id: enrollment.id })
		.from(enrollment)
		.where(
			and(
				eq(enrollment.studentId, context.student.studentId),
				eq(enrollment.schoolYearStart, data.schoolYearStart),
				eq(enrollment.semester, data.semester)
			)
		)
		.get();
	if (duplicate)
		error(409, 'This student already has an enrollment for that school year and semester.');
	if (context.student.currentEnrollmentId) {
		const current = database
			.select()
			.from(enrollment)
			.where(
				and(
					eq(enrollment.id, context.student.currentEnrollmentId),
					eq(enrollment.studentId, context.student.studentId)
				)
			)
			.get();
		if (!current) error(409, 'Current enrollment is unavailable. Refresh and try again.');
		const lockReason = getEnrollmentLockReason(current);
		if (lockReason) error(409, lockReason);
		const concerns = getGradeConcerns(
			database
				.select({ grade: enrollmentSubject.grade })
				.from(enrollmentSubject)
				.where(eq(enrollmentSubject.enrollmentId, current.id))
				.all(),
			current.finalizedGrades
		);
		if ((concerns.failedCount || concerns.incompleteCount) && !data.acknowledgeGradeConcerns)
			error(
				409,
				'This student has failing or incomplete grades. Review the current enrollment and acknowledge the warning before enrolling.'
			);
		if (
			data.schoolYearStart < current.schoolYearStart ||
			(data.schoolYearStart === current.schoolYearStart && data.semester <= current.semester)
		)
			error(400, 'Select a term after the current enrollment.');
	}
	if (
		data.yearLevel > selectedCurriculum.yearLevels ||
		data.semester > selectedCurriculum.semesters
	) {
		error(400, 'Year level and semester must be within the active curriculum limits.');
	}

	// Validate the complete subject selection before writing enrollment records.
	const ids = data.subjects.map((entry) => entry.id);
	if (new Set(ids).size !== ids.length)
		error(400, 'A subject can only appear once in an enrollment.');

	const catalog = new Map(
		database
			.select()
			.from(subject)
			.where(inArray(subject.id, ids))
			.all()
			.map((entry) => [entry.id, entry])
	);
	if (catalog.size !== ids.length) error(400, 'One or more subjects do not exist in the database.');

	// Only subjects in this year and semester count as curriculum subjects. Others are extras.
	const matchingSubjects = new Map(
		database
			.select()
			.from(curriculumSubject)
			.where(
				and(
					eq(curriculumSubject.curriculumId, selectedCurriculum.id),
					eq(curriculumSubject.yearLevel, data.yearLevel),
					eq(curriculumSubject.semester, data.semester)
				)
			)
			.all()
			.map((entry) => [entry.subjectId, entry])
	);

	// Preserve published names and codes for curriculum subjects; all subjects allow custom units.
	const subjects: EnrollmentSubjectValues[] = data.subjects.map((entry) => {
		const match = matchingSubjects.get(entry.id);
		const catalogSubject = catalog.get(entry.id)!;

		return {
			subjectId: entry.id,
			curriculumSubjectId: match?.id ?? null,
			source: match ? SubjectSource.CURRICULUM : SubjectSource.EXTRA,
			subjectCode: match?.subjectCode ?? catalogSubject.code,
			subjectName: match?.subjectName ?? catalogSubject.name,
			units: entry.units
		};
	});

	return { ...context, subjects };
}
