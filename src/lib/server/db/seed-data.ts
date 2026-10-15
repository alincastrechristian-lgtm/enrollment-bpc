import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { Role } from '#lib/Roles.js';
import { eq } from 'drizzle-orm';
import * as schema from '../../schema.ts';

const programs = [
	{ code: 'BSIS', name: 'Bachelor of Science in Information Systems' },
	{ code: 'ACT', name: 'Associate in Computer Technology' },
	{ code: 'DHRMT', name: 'Diploma in Hotel and Restaurant Management Technology' }
];

const subjects = [
	{ code: 'GE101', name: 'Understanding the Self' },
	{ code: 'GE102', name: 'Readings in Philippine History' },
	{ code: 'GE103', name: 'The Contemporary World' },
	{ code: 'GE104', name: 'Mathematics in the Modern World' },
	{ code: 'PE101', name: 'Physical Education 1' },
	{ code: 'PE102', name: 'Physical Education 2' },
	{ code: 'IS101', name: 'Introduction to Computing' },
	{ code: 'IS102', name: 'Fundamentals of Programming' },
	{ code: 'IS201', name: 'Data Structures and Algorithms' },
	{ code: 'IS202', name: 'Database Systems' },
	{ code: 'IS301', name: 'Systems Analysis and Design' },
	{ code: 'IS302', name: 'Web Application Development' },
	{ code: 'IS401', name: 'Capstone Project 1' },
	{ code: 'IS402', name: 'Capstone Project 2' },
	{ code: 'ACT101', name: 'Computer Hardware Servicing' },
	{ code: 'ACT201', name: 'Computer Networks' },
	{ code: 'HM101', name: 'Introduction to Hospitality Management' },
	{ code: 'HM102', name: 'Food and Beverage Service' },
	{ code: 'HM201', name: 'Front Office Operations' },
	{ code: 'HM202', name: 'Housekeeping Operations' }
];

// Subject code, year level, semester, units. These are sample drafts, not official curricula.
const curricula = [
	{
		programCode: 'BSIS',
		yearLevels: 4,
		subjects: [
			['GE101', 1, 1, 3],
			['IS101', 1, 1, 3],
			['PE101', 1, 1, 2],
			['GE102', 1, 2, 3],
			['IS102', 1, 2, 3],
			['PE102', 1, 2, 2],
			['GE103', 2, 1, 3],
			['IS201', 2, 1, 3],
			['GE104', 2, 2, 3],
			['IS202', 2, 2, 3],
			['IS301', 3, 1, 3],
			['IS302', 3, 2, 3],
			['IS401', 4, 1, 3],
			['IS402', 4, 2, 3]
		]
	},
	{
		programCode: 'ACT',
		yearLevels: 2,
		subjects: [
			['GE101', 1, 1, 3],
			['IS101', 1, 1, 3],
			['PE101', 1, 1, 2],
			['IS102', 1, 2, 3],
			['ACT101', 1, 2, 3],
			['GE104', 2, 1, 3],
			['ACT201', 2, 1, 3],
			['IS202', 2, 2, 3],
			['GE103', 2, 2, 3]
		]
	},
	{
		programCode: 'DHRMT',
		yearLevels: 2,
		subjects: [
			['GE101', 1, 1, 3],
			['HM101', 1, 1, 3],
			['PE101', 1, 1, 2],
			['GE102', 1, 2, 3],
			['HM102', 1, 2, 3],
			['PE102', 1, 2, 2],
			['HM201', 2, 1, 3],
			['GE103', 2, 1, 3],
			['HM202', 2, 2, 3],
			['GE104', 2, 2, 3]
		]
	}
] as const;

const names = [
	'Ana Santos',
	'Miguel Reyes',
	'Sofia Cruz',
	'Gabriel Garcia',
	'Isabella Ramos',
	'Luis Mendoza',
	'Camila Torres',
	'Daniel Flores',
	'Maria Rivera',
	'Joshua Aquino',
	'Andrea Bautista',
	'Paolo Navarro',
	'Nicole Villanueva',
	'Carlo Dela Cruz',
	'Angela Castillo',
	'Rafael Lim',
	'Bianca Perez',
	'Marco Gonzales',
	'Patricia Hernandez',
	'Adrian Lopez'
];

export function seedAcademicData(db: BetterSQLite3Database<typeof schema>) {
	return db.transaction((tx) => {
		const created = {
			programs: tx
				.insert(schema.program)
				.values(programs)
				.onConflictDoNothing({ target: schema.program.code })
				.returning()
				.all().length,
			subjects: tx
				.insert(schema.subject)
				.values(subjects)
				.onConflictDoNothing({ target: schema.subject.code })
				.returning()
				.all().length,
			curricula: 0,
			students: 0
		};
		const catalogPrograms = new Map(
			tx
				.select()
				.from(schema.program)
				.all()
				.map((record) => [record.code, record])
		);
		const catalogSubjects = new Map(
			tx
				.select()
				.from(schema.subject)
				.all()
				.map((record) => [record.code, record])
		);
		for (const template of curricula) {
			const program = catalogPrograms.get(template.programCode);
			if (!program) throw new Error(`Missing seed program: ${template.programCode}`);
			const curriculum = tx
				.insert(schema.curriculum)
				.values({
					name: '2026 Sample Curriculum',
					programCode: program.code,
					yearLevels: template.yearLevels,
					semesters: 2
				})
				.onConflictDoNothing({ target: [schema.curriculum.programCode, schema.curriculum.name] })
				.returning()
				.get();
			// Do not restore removed subjects or change edited/published curricula on reruns.
			if (!curriculum) continue;
			created.curricula++;
			for (const [code, yearLevel, semester, units] of template.subjects) {
				const subject = catalogSubjects.get(code);
				if (!subject) throw new Error(`Missing seed subject: ${code}`);
				tx.insert(schema.curriculumSubject)
					.values({
						curriculumId: curriculum.id,
						subjectId: subject.id,
						yearLevel,
						semester,
						units,
						subjectCode: subject.code,
						subjectName: subject.name
					})
					.run();
			}
		}
		for (const [index, name] of names.entries()) {
			const email = 'student.seed.' + (index + 1) + '@example.com';
			const id = 'seed-student-user-' + (index + 1);
			tx.insert(schema.user)
				.values({ id, name, email, role: Role.STUDENT })
				.onConflictDoNothing()
				.run();
			const existing = tx.select().from(schema.user).where(eq(schema.user.email, email)).get();
			if (!existing || existing.role !== Role.STUDENT) continue;
			created.students += tx
				.insert(schema.studentData)
				.values({
					studentId: 'SEED-2026-' + String(index + 1).padStart(6, '0'),
					userId: existing.id,
					contactNumber: '0917' + String(1000000 + index),
					address: 'City of Malolos, Bulacan'
				})
				.onConflictDoNothing()
				.returning()
				.all().length;
		}
		return created;
	});
}
