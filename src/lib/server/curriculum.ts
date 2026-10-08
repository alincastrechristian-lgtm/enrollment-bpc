import { curriculum, curriculumSubject, program, subject } from '#lib/schema.js';
import { db } from '#lib/server/db/index.js';
import { error } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';

export function getCurriculum(id: string) {
	const record = db
		.select({
			id: curriculum.id,
			name: curriculum.name,
			programId: curriculum.programId,
			publishedAt: curriculum.publishedAt,
			isActive: curriculum.isActive,
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
