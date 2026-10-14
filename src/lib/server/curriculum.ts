import { curriculum, curriculumSubject, program, subject } from '#lib/schema.js';
import { db, type Transaction } from '#lib/server/db/index.js';
import { error } from '@sveltejs/kit';
import { asc, eq, sql } from 'drizzle-orm';

// Publication freezes the curriculum; the program pointer selects its current version.
export const curriculumStatus = sql<'draft' | 'inactive' | 'active' | 'archived'>`case
	when ${curriculum.archivedAt} is not null then 'archived'
	when ${curriculum.publishedAt} is null then 'draft'
	when ${program.activeCurriculumId} = ${curriculum.id} then 'active'
	else 'inactive' end`;

export function validateSubjectLimits(
	subjects: { yearLevel: number; semester: number }[],
	yearLevels: number,
	semesters: number
) {
	for (const entry of subjects) {
		if (entry.yearLevel > yearLevels)
			error(400, `Subject year level must be between 1 and ${yearLevels}.`);
		if (entry.semester > semesters)
			error(400, `Subject semester must be between 1 and ${semesters}.`);
	}
}

// Call inside the caller's transaction so metadata edits and selection changes commit together.
export function setProgramCurriculum(
	tx: Transaction,
	programId: string,
	curriculumId: string | null
) {
	const owner = tx.select().from(program).where(eq(program.id, programId)).get();
	if (!owner) error(404, 'Program not found.');
	if (curriculumId === null) {
		tx.update(program).set({ activeCurriculumId: null }).where(eq(program.id, owner.id)).run();
		return;
	}
	const selected = tx.select().from(curriculum).where(eq(curriculum.id, curriculumId)).get();
	if (!selected) error(404, 'Curriculum not found.');
	if (selected.programId !== owner.id) error(400, 'Select a curriculum belonging to this program.');
	if (!owner.isActive) error(400, 'The program must be active before activating a curriculum.');
	if (owner.activeCurriculumId === selected.id && selected.archivedAt === null) return;
	const entries = tx
		.select()
		.from(curriculumSubject)
		.where(eq(curriculumSubject.curriculumId, selected.id))
		.all();
	if (!entries.length) error(400, 'Add subjects before activating this curriculum.');
	validateSubjectLimits(entries, selected.yearLevels, selected.semesters);
	for (const entry of entries) {
		if (
			![entry.yearLevel, entry.semester, entry.units].every(
				(value) => Number.isSafeInteger(value) && value > 0
			)
		)
			error(400, 'Subject year, semester, and units must be positive whole numbers.');
		if (selected.publishedAt === null) {
			const catalog = tx.select().from(subject).where(eq(subject.id, entry.subjectId)).get();
			if (!catalog) error(400, 'Subject not found.');
			tx.update(curriculumSubject)
				.set({ subjectCode: catalog.code, subjectName: catalog.name })
				.where(eq(curriculumSubject.id, entry.id))
				.run();
		}
	}
	if (selected.publishedAt === null)
		tx.update(curriculum)
			.set({ publishedAt: new Date() })
			.where(eq(curriculum.id, selected.id))
			.run();
	if (owner.activeCurriculumId && owner.activeCurriculumId !== selected.id) {
		tx.update(curriculum)
			.set({ archivedAt: new Date() })
			.where(eq(curriculum.id, owner.activeCurriculumId))
			.run();
	}
	tx.update(curriculum).set({ archivedAt: null }).where(eq(curriculum.id, selected.id)).run();
	// Existing enrollments keep their own curriculum IDs.
	tx.update(program).set({ activeCurriculumId: selected.id }).where(eq(program.id, owner.id)).run();
}

export function getCurriculum(id: string) {
	const record = db
		.select({
			id: curriculum.id,
			name: curriculum.name,
			yearLevels: curriculum.yearLevels,
			semesters: curriculum.semesters,
			programId: curriculum.programId,
			publishedAt: curriculum.publishedAt,
			archivedAt: curriculum.archivedAt,
			isActive: curriculum.isActive,
			status: curriculumStatus,
			activeCurriculumId: program.activeCurriculumId,
			programName: program.name,
			programCode: program.code
		})
		.from(curriculum)
		.innerJoin(program, eq(curriculum.programId, program.id))
		.where(eq(curriculum.id, id))
		.get();
	if (!record) error(404, 'Curriculum not found.');
	const entries = db
		.select()
		.from(curriculumSubject)
		.where(eq(curriculumSubject.curriculumId, id))
		.orderBy(
			asc(curriculumSubject.yearLevel),
			asc(curriculumSubject.semester),
			asc(curriculumSubject.subjectCode)
		)
		.all();
	return { curriculum: record, entries };
}

export function getCurriculumCatalogs() {
	return {
		programs: db
			.select({
				id: program.id,
				code: program.code,
				name: program.name,
				isActive: program.isActive
			})
			.from(program)
			.orderBy(asc(program.name), asc(program.id))
			.all(),
		subjects: db
			.select({
				id: subject.id,
				code: subject.code,
				name: subject.name,
				isActive: subject.isActive
			})
			.from(subject)
			.orderBy(asc(subject.code), asc(subject.id))
			.all()
	};
}
