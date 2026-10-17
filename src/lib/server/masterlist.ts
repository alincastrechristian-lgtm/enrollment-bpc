import { Role } from '#lib/Roles.js';
import { curriculum, enrollment, program, studentData, user } from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { error } from '@sveltejs/kit';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { createCsv } from './csv';

export function getMasterlist(
	{ locals, url }: Pick<RequestEvent, 'locals' | 'url'>,
	{ all = false }: { all?: boolean } = {}
) {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	const eligibleEnrollment = inArray(enrollment.status, ['enrolled', 'completed']);

	function integerParameter(key: string, label: string, fallback?: number) {
		const raw = url.searchParams.get(key)?.trim();
		if (!raw) return fallback;
		const value = Number(raw);
		if (!Number.isSafeInteger(value) || value <= 0) error(400, `Choose a valid ${label}.`);
		return value;
	}

	const terms = db
		.selectDistinct({ schoolYearStart: enrollment.schoolYearStart, semester: enrollment.semester })
		.from(enrollment)
		.where(eligibleEnrollment)
		.orderBy(desc(enrollment.schoolYearStart), desc(enrollment.semester))
		.all();
	const schoolYearStart = integerParameter(
		'schoolYearStart',
		'school year',
		terms[0]?.schoolYearStart ?? new Date().getFullYear()
	)!;
	const semester = integerParameter(
		'semester',
		'semester',
		terms.find((term) => term.schoolYearStart === schoolYearStart)?.semester ?? 1
	)!;
	const yearLevel = integerParameter('yearLevel', 'year level');
	const programCode = url.searchParams.get('programCode')?.trim() ?? '';
	const section = url.searchParams.get('section')?.trim() ?? '';
	const programs = db
		.select({ code: program.code, name: program.name })
		.from(program)
		.orderBy(asc(program.code))
		.all();
	if (programCode && !programs.some((item) => item.code === programCode))
		error(400, 'Choose a valid program.');
	// Include existing custom sections as well as the usual A–D choices.
	const sections = [
		...new Set([
			'A',
			'B',
			'C',
			'D',
			...db
				.selectDistinct({ value: enrollment.section })
				.from(enrollment)
				.where(eligibleEnrollment)
				.all()
				.map(({ value }) => value)
		])
	].sort();
	if (section && !sections.includes(section)) error(400, 'Choose a valid section.');

	// Historical rosters use the enrollment's class, not the student's current enrollment pointer.
	// One semester and the valid-term constraint give one row per student.
	const roster = db.$with('masterlist_rows').as(
		db
			.select({
				enrollmentId: sql<string>`${enrollment.id}`.as('enrollment_id'),
				userId: sql<string>`${user.id}`.as('user_id'),
				studentId: sql<string>`${studentData.studentId}`.as('student_id'),
				name: user.name,
				firstName: user.firstName,
				middleName: user.middleName,
				lastName: user.lastName,
				email: user.email,
				programCode: curriculum.programCode,
				programName: sql<string>`${program.name}`.as('program_name'),
				yearLevel: enrollment.yearLevel,
				section: enrollment.section,
				status: enrollment.status
			})
			.from(enrollment)
			.innerJoin(studentData, eq(studentData.studentId, enrollment.studentId))
			.innerJoin(user, eq(user.id, studentData.userId))
			.innerJoin(curriculum, eq(curriculum.id, enrollment.curriculumId))
			.innerJoin(program, eq(program.code, curriculum.programCode))
			.where(
				and(
					eq(user.role, Role.STUDENT),
					eligibleEnrollment,
					eq(enrollment.schoolYearStart, schoolYearStart),
					eq(enrollment.semester, semester),
					programCode ? eq(curriculum.programCode, programCode) : undefined,
					yearLevel ? eq(enrollment.yearLevel, yearLevel) : undefined,
					section ? eq(enrollment.section, section) : undefined
				)
			)
	);
	const total = db.with(roster).select({ value: count() }).from(roster).get()!.value;
	const pageSize = 50;
	const currentPage = all ? 1 : integerParameter('page', 'batch', 1)!;
	const rows = db
		.with(roster)
		.select()
		.from(roster)
		.orderBy(
			asc(roster.lastName),
			asc(roster.firstName),
			asc(roster.middleName),
			asc(roster.studentId)
		);
	const students = all
		? rows.all()
		: (currentPage - 1) * pageSize < total
			? rows
					.limit(pageSize)
					.offset((currentPage - 1) * pageSize)
					.all()
			: [];

	return {
		students,
		total,
		nextPage: !all && currentPage * pageSize < total ? currentPage + 1 : null,
		filters: { schoolYearStart, semester, programCode, yearLevel, section },
		options: {
			programs,
			sections,
			schoolYears: [
				...new Set([schoolYearStart, ...terms.map((term) => term.schoolYearStart)])
			].sort((a, b) => b - a),
			semesters: [...new Set([semester, ...terms.map((term) => term.semester)])].sort(
				(a, b) => a - b
			),
			yearLevels: [
				...new Set([
					...(yearLevel ? [yearLevel] : []),
					...db
						.selectDistinct({ value: enrollment.yearLevel })
						.from(enrollment)
						.where(eligibleEnrollment)
						.all()
						.map(({ value }) => value)
				])
			].sort((a, b) => a - b)
		}
	};
}

export function createMasterlistCsv({
	filters,
	students
}: Pick<ReturnType<typeof getMasterlist>, 'filters' | 'students'>) {
	const group =
		filters.programCode && filters.yearLevel && filters.section
			? `${filters.programCode} ${filters.yearLevel}${filters.section}`
			: [
					filters.programCode || 'All programs',
					filters.yearLevel ? `Year ${filters.yearLevel}` : 'All year levels',
					filters.section ? `Section ${filters.section}` : 'All sections'
				].join(' / ');
	const title = `${group} ENROLLEES - SEMESTER ${filters.semester} SY ${filters.schoolYearStart}-${filters.schoolYearStart + 1}`;
	return createCsv([
		[title, '', '', '', ''],
		['', '', '', '', ''],
		['No.', 'Student ID', 'Surname', 'Given Name', 'Middle Name'],
		...students.map((student, index) => [
			index + 1,
			student.studentId,
			student.lastName,
			student.firstName,
			student.middleName
		])
	]);
}
