import { Role } from '#lib/Roles.js';
import {
	getEnrollmentLockReason,
	getGradeConcerns,
	getGradeStatus
} from '#lib/enrollment-grades.js';
import { reportTypes, type ReportKind, type ReportRow } from '#lib/reports.js';
import {
	curriculum,
	enrollment,
	enrollmentSubject,
	program,
	studentData,
	user
} from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { error, type RequestEvent } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';

export function getReports(
	{ locals, url }: Pick<RequestEvent, 'locals' | 'url'>,
	now = new Date()
) {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);
	const requestedKind = url.searchParams.get('report') || 'summary';
	const definition = reportTypes.find((item) => item.value === requestedKind);
	if (!definition) error(400, 'Choose a valid report.');
	const kind: ReportKind = definition.value;
	function numberFilter(key: string, label: string, fallback?: number) {
		const raw = url.searchParams.get(key)?.trim();
		if (!raw) return fallback;
		const value = Number(raw);
		if (!Number.isSafeInteger(value) || value <= 0) error(400, `Choose a valid ${label}.`);
		return value;
	}
	const terms = db
		.selectDistinct({ year: enrollment.schoolYearStart, semester: enrollment.semester })
		.from(enrollment)
		.where(ne(enrollment.status, 'voided'))
		.orderBy(desc(enrollment.schoolYearStart), desc(enrollment.semester))
		.all();
	const schoolYearStart = numberFilter(
		'schoolYearStart',
		'school year',
		terms[0]?.year ??
			Number(
				new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric' }).format(now)
			)
	)!;
	const semester = numberFilter(
		'semester',
		'semester',
		terms.find((term) => term.year === schoolYearStart)?.semester ?? 1
	)!;
	const yearLevel = numberFilter('yearLevel', 'year level');
	const programCode = url.searchParams.get('programCode')?.trim() ?? '';
	const section = url.searchParams.get('section')?.trim() ?? '';
	const programs = db
		.select({ code: program.code, name: program.name })
		.from(program)
		.orderBy(asc(program.code))
		.all();
	const academic = db
		.selectDistinct({ yearLevel: enrollment.yearLevel, section: enrollment.section })
		.from(enrollment)
		.where(ne(enrollment.status, 'voided'))
		.all();
	const sections = [
		...new Set(['A', 'B', 'C', 'D', ...academic.map((item) => item.section)])
	].sort();
	if (programCode && !programs.some((item) => item.code === programCode))
		error(400, 'Choose a valid program.');
	if (section && !sections.includes(section)) error(400, 'Choose a valid section.');
	const scope = and(
		ne(enrollment.status, 'voided'),
		eq(enrollment.schoolYearStart, schoolYearStart),
		eq(enrollment.semester, semester),
		programCode ? eq(curriculum.programCode, programCode) : undefined,
		yearLevel ? eq(enrollment.yearLevel, yearLevel) : undefined,
		section ? eq(enrollment.section, section) : undefined
	);

	// Read this term's enrollment snapshots, even when the student has since changed class.
	const records = db
		.select({
			id: enrollment.id,
			userId: user.id,
			studentId: studentData.studentId,
			name: user.name,
			programCode: curriculum.programCode,
			yearLevel: enrollment.yearLevel,
			section: enrollment.section,
			status: enrollment.status,
			finalizedGrades: enrollment.finalizedGrades,
			submittedClearance: enrollment.submittedClearance,
			meetingRequestSentAt: enrollment.meetingRequestSentAt,
			followUpCompletedAt: enrollment.followUpCompletedAt,
			droppedAt: enrollment.droppedAt,
			currentEnrollmentId: studentData.currentEnrollmentId
		})
		.from(enrollment)
		.innerJoin(studentData, eq(studentData.studentId, enrollment.studentId))
		.innerJoin(user, eq(user.id, studentData.userId))
		.innerJoin(curriculum, eq(curriculum.id, enrollment.curriculumId))
		.where(and(eq(user.role, Role.STUDENT), scope))
		.orderBy(asc(user.name), asc(studentData.studentId), asc(enrollment.id))
		.all();
	const needsSubjects = kind === 'grades' || kind === 'attention' || kind === 'completion';
	// A subquery keeps large reports within SQLite's parameter limit.
	const selectedIds = db
		.select({ id: enrollment.id })
		.from(enrollment)
		.innerJoin(curriculum, eq(curriculum.id, enrollment.curriculumId))
		.where(scope);
	const subjects = needsSubjects
		? db
				.select({
					id: enrollmentSubject.id,
					enrollmentId: enrollmentSubject.enrollmentId,
					code: enrollmentSubject.subjectCode,
					name: enrollmentSubject.subjectName,
					units: enrollmentSubject.units,
					grade: enrollmentSubject.grade
				})
				.from(enrollmentSubject)
				.where(inArray(enrollmentSubject.enrollmentId, selectedIds))
				.orderBy(asc(enrollmentSubject.subjectCode), asc(enrollmentSubject.id))
				.all()
		: [];
	const byEnrollment = new Map<string, typeof subjects>();
	for (const subject of subjects) {
		const list = byEnrollment.get(subject.enrollmentId) ?? [];
		list.push(subject);
		byEnrollment.set(subject.enrollmentId, list);
	}
	const baseColumns = ['Student number', 'Student', 'Program', 'Year level', 'Section'];
	const columns: string[] =
		kind === 'summary'
			? [
					'Program',
					'Year level',
					'Section',
					'Enrolled',
					'Completed',
					'Dropped',
					'Enrollment records',
					'Distinct students'
				]
			: kind === 'grades'
				? [...baseColumns, 'Subject code', 'Subject', 'Units', 'Grade', 'Outcome', 'Grade release']
				: kind === 'attention'
					? [...baseColumns, 'Failed subjects', 'INC subjects', 'Follow-up', 'Needs attention']
					: kind === 'completion'
						? [...baseColumns, 'Grades', 'Clearance', 'Follow-up', 'Next-term enrollment']
						: [...baseColumns, 'Dropped on', 'Record'];
	const rows: ReportRow[] = [];
	if (kind === 'summary') {
		const groups = new Map<
			string,
			{
				programCode: string;
				yearLevel: number;
				section: string;
				enrolled: number;
				completed: number;
				dropped: number;
				students: Set<string>;
			}
		>();
		for (const record of records) {
			if (record.status === 'voided') continue;
			const key = JSON.stringify([record.programCode, record.yearLevel, record.section]);
			const group = groups.get(key) ?? {
				programCode: record.programCode,
				yearLevel: record.yearLevel,
				section: record.section,
				enrolled: 0,
				completed: 0,
				dropped: 0,
				students: new Set<string>()
			};
			group[record.status]++;
			group.students.add(record.studentId);
			groups.set(key, group);
		}
		for (const [id, group] of [...groups].sort(
			([, a], [, b]) =>
				a.programCode.localeCompare(b.programCode) ||
				a.yearLevel - b.yearLevel ||
				a.section.localeCompare(b.section)
		))
			rows.push({
				id,
				cells: [
					group.programCode,
					group.yearLevel,
					group.section,
					group.enrolled,
					group.completed,
					group.dropped,
					group.enrolled + group.completed + group.dropped,
					group.students.size
				]
			});
	} else {
		for (const record of records) {
			const base = [
				record.studentId,
				record.name,
				record.programCode,
				record.yearLevel,
				record.section
			];
			const ownSubjects = byEnrollment.get(record.id) ?? [];
			const { failedCount, incompleteCount } = getGradeConcerns(
				ownSubjects,
				record.finalizedGrades
			);
			const followUpNeeded = record.finalizedGrades && (failedCount > 0 || incompleteCount > 0);
			const followUp = record.followUpCompletedAt
				? 'Completed'
				: followUpNeeded
					? record.meetingRequestSentAt
						? 'Requested'
						: 'Not requested'
					: 'Not required';
			const link = { userId: record.userId, enrollmentId: record.id };
			if (kind === 'dropped') {
				if (record.status !== 'dropped') continue;
				rows.push({
					id: record.id,
					...link,
					cells: [
						...base,
						record.droppedAt
							? new Intl.DateTimeFormat('en-PH', {
									timeZone: 'Asia/Manila',
									dateStyle: 'medium',
									timeStyle: 'short'
								}).format(record.droppedAt)
							: 'Not recorded',
						record.currentEnrollmentId === record.id ? 'Current enrollment' : 'Historical'
					]
				});
				continue;
			}
			if (record.status === 'dropped') continue;
			if (kind === 'grades') {
				for (const subject of ownSubjects)
					rows.push({
						id: subject.id,
						...link,
						cells: [
							...base,
							subject.code,
							subject.name,
							subject.units,
							subject.grade ?? (record.finalizedGrades ? 'INC' : 'Not entered'),
							getGradeStatus(subject.grade, record.finalizedGrades),
							record.finalizedGrades ? 'Finalized' : 'Draft'
						]
					});
			} else if (kind === 'attention') {
				const concerns = [
					...(!record.finalizedGrades ? ['Grades not finalized'] : []),
					...(failedCount ? ['Failed grades'] : []),
					...(incompleteCount ? ['Incomplete grades'] : []),
					...(followUpNeeded && !record.followUpCompletedAt ? ['Registrar follow-up pending'] : []),
					...(!record.submittedClearance ? ['Clearance not verified'] : [])
				];
				if (concerns.length)
					rows.push({
						id: record.id,
						...link,
						cells: [...base, failedCount, incompleteCount, followUp, concerns.join('; ')]
					});
			} else {
				const readiness =
					record.currentEnrollmentId !== record.id
						? 'Historical enrollment'
						: getEnrollmentLockReason(record, failedCount)
							? 'Requirements pending'
							: 'Ready';
				rows.push({
					id: record.id,
					...link,
					cells: [
						...base,
						record.finalizedGrades ? 'Finalized' : 'Not finalized',
						record.submittedClearance ? 'Verified' : 'Not verified',
						followUp,
						readiness
					]
				});
			}
		}
	}
	return {
		kind,
		title: definition.label,
		description: definition.description,
		columns,
		rows,
		generatedAt: now,
		filters: { schoolYearStart, semester, programCode, yearLevel, section },
		overview: {
			students: new Set(records.map((record) => record.studentId)).size,
			enrolled: records.filter((record) => record.status === 'enrolled').length,
			completed: records.filter((record) => record.status === 'completed').length,
			dropped: records.filter((record) => record.status === 'dropped').length
		},
		options: {
			programs,
			sections,
			schoolYears: [...new Set([schoolYearStart, ...terms.map((term) => term.year)])].sort(
				(a, b) => b - a
			),
			semesters: [...new Set([semester, ...terms.map((term) => term.semester)])].sort(
				(a, b) => a - b
			),
			yearLevels: [
				...new Set([...(yearLevel ? [yearLevel] : []), ...academic.map((item) => item.yearLevel)])
			].sort((a, b) => a - b)
		}
	};
}

export function createReportCsv(report: Pick<ReturnType<typeof getReports>, 'columns' | 'rows'>) {
	const cell = (value: string | number) => {
		const text = String(value);
		// Quoting alone does not prevent spreadsheet formulas in names and subject titles.
		const safe = /^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
		return `"${safe.replaceAll('"', '""')}"`;
	};
	return (
		'\uFEFF' +
		[report.columns, ...report.rows.map((row) => row.cells)]
			.map((row) => row.map(cell).join(','))
			.join('\r\n') +
		'\r\n'
	);
}
