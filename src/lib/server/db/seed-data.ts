import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
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
	{ code: 'GE105', name: 'Purposive Communication' },
	{ code: 'GE106', name: 'Art Appreciation' },
	{ code: 'GE107', name: 'Science, Technology and Society' },
	{ code: 'GE108', name: 'Ethics' },
	{ code: 'PE101', name: 'Physical Education 1' },
	{ code: 'PE102', name: 'Physical Education 2' },
	{ code: 'PE201', name: 'Physical Education 3' },
	{ code: 'PE202', name: 'Physical Education 4' },
	{ code: 'IS101', name: 'Introduction to Computing' },
	{ code: 'IS102', name: 'Fundamentals of Programming' },
	{ code: 'IS103', name: 'Discrete Mathematics' },
	{ code: 'IS104', name: 'Computer Organization' },
	{ code: 'IS201', name: 'Data Structures and Algorithms' },
	{ code: 'IS202', name: 'Database Systems' },
	{ code: 'IS203', name: 'Object-Oriented Programming' },
	{ code: 'IS204', name: 'Networking Fundamentals' },
	{ code: 'IS205', name: 'Human-Computer Interaction' },
	{ code: 'IS206', name: 'Information Management' },
	{ code: 'IS301', name: 'Systems Analysis and Design' },
	{ code: 'IS302', name: 'Web Application Development' },
	{ code: 'IS303', name: 'Software Engineering' },
	{ code: 'IS304', name: 'Information Systems Security' },
	{ code: 'IS305', name: 'Enterprise Architecture' },
	{ code: 'IS306', name: 'IT Project Management' },
	{ code: 'IS401', name: 'Capstone Project 1' },
	{ code: 'IS402', name: 'Capstone Project 2' },
	{ code: 'IS403', name: 'Professional Elective' },
	{ code: 'IS404', name: 'Information Systems Internship' },
	{ code: 'ACT101', name: 'Computer Hardware Servicing' },
	{ code: 'ACT102', name: 'Operating Systems' },
	{ code: 'ACT103', name: 'Computer Troubleshooting and Maintenance' },
	{ code: 'ACT201', name: 'Computer Networks' },
	{ code: 'ACT202', name: 'Network Administration' },
	{ code: 'ACT203', name: 'Web Development Fundamentals' },
	{ code: 'ACT204', name: 'Technical Support Practicum' },
	{ code: 'HM101', name: 'Introduction to Hospitality Management' },
	{ code: 'HM102', name: 'Food and Beverage Service' },
	{ code: 'HM103', name: 'Food Safety and Sanitation' },
	{ code: 'HM104', name: 'Culinary Fundamentals' },
	{ code: 'HM201', name: 'Front Office Operations' },
	{ code: 'HM202', name: 'Housekeeping Operations' },
	{ code: 'HM203', name: 'Hospitality Accounting' },
	{ code: 'HM204', name: 'Events Management' },
	{ code: 'HM205', name: 'Hospitality Marketing' },
	{ code: 'HM206', name: 'Hospitality Practicum' }
];

// Every prerequisite is scheduled in an earlier term in each curriculum using it.
const prerequisites: Record<string, string[]> = {
	PE102: ['PE101'],
	PE201: ['PE102'],
	PE202: ['PE201'],
	IS102: ['IS101'],
	IS201: ['IS102'],
	IS202: ['IS102'],
	IS203: ['IS102'],
	IS204: ['IS101'],
	IS205: ['IS203'],
	IS206: ['IS202'],
	IS301: ['IS202'],
	IS302: ['IS203', 'IS202'],
	IS303: ['IS301', 'IS203'],
	IS304: ['IS204'],
	IS305: ['IS301'],
	IS306: ['IS303'],
	IS401: ['IS301', 'IS302', 'IS303'],
	IS402: ['IS401'],
	IS404: ['IS401'],
	ACT103: ['ACT101'],
	ACT201: ['IS101'],
	ACT202: ['ACT201'],
	ACT203: ['IS102'],
	ACT204: ['ACT101', 'ACT201'],
	HM102: ['HM101', 'HM103'],
	HM104: ['HM103'],
	HM201: ['HM101'],
	HM202: ['HM101'],
	HM203: ['HM101'],
	HM204: ['HM102'],
	HM205: ['HM101'],
	HM206: ['HM102', 'HM104', 'HM201']
};

// Subject code, year level, semester, units. Samples, not official curricula.
const curricula = [
	{
		programCode: 'BSIS',
		yearLevels: 4,
		subjects: [
			['GE101', 1, 1, 3],
			['IS101', 1, 1, 3],
			['PE101', 1, 1, 2],
			['IS103', 1, 1, 3],
			['GE105', 1, 1, 3],
			['GE102', 1, 2, 3],
			['IS102', 1, 2, 3],
			['PE102', 1, 2, 2],
			['IS104', 1, 2, 3],
			['GE106', 1, 2, 3],
			['GE103', 2, 1, 3],
			['IS201', 2, 1, 3],
			['IS203', 2, 1, 3],
			['PE201', 2, 1, 2],
			['GE104', 2, 2, 3],
			['IS202', 2, 2, 3],
			['IS204', 2, 2, 3],
			['PE202', 2, 2, 2],
			['IS301', 3, 1, 3],
			['IS205', 3, 1, 3],
			['IS206', 3, 1, 3],
			['GE107', 3, 1, 3],
			['IS302', 3, 2, 3],
			['IS303', 3, 2, 3],
			['IS304', 3, 2, 3],
			['GE108', 3, 2, 3],
			['IS401', 4, 1, 3],
			['IS305', 4, 1, 3],
			['IS306', 4, 1, 3],
			['IS402', 4, 2, 3],
			['IS403', 4, 2, 3],
			['IS404', 4, 2, 6]
		]
	},
	{
		programCode: 'ACT',
		yearLevels: 2,
		subjects: [
			['GE101', 1, 1, 3],
			['IS101', 1, 1, 3],
			['PE101', 1, 1, 2],
			['GE105', 1, 1, 3],
			['ACT102', 1, 1, 3],
			['IS102', 1, 2, 3],
			['ACT101', 1, 2, 3],
			['GE102', 1, 2, 3],
			['PE102', 1, 2, 2],
			['GE106', 1, 2, 3],
			['GE104', 2, 1, 3],
			['ACT201', 2, 1, 3],
			['ACT103', 2, 1, 3],
			['IS203', 2, 1, 3],
			['PE201', 2, 1, 2],
			['GE107', 2, 1, 3],
			['IS202', 2, 2, 3],
			['GE103', 2, 2, 3],
			['ACT202', 2, 2, 3],
			['ACT203', 2, 2, 3],
			['ACT204', 2, 2, 6],
			['PE202', 2, 2, 2],
			['GE108', 2, 2, 3]
		]
	},
	{
		programCode: 'DHRMT',
		yearLevels: 2,
		subjects: [
			['GE101', 1, 1, 3],
			['HM101', 1, 1, 3],
			['PE101', 1, 1, 2],
			['GE105', 1, 1, 3],
			['HM103', 1, 1, 3],
			['GE102', 1, 2, 3],
			['HM102', 1, 2, 3],
			['PE102', 1, 2, 2],
			['HM104', 1, 2, 3],
			['GE106', 1, 2, 3],
			['HM201', 2, 1, 3],
			['GE103', 2, 1, 3],
			['HM203', 2, 1, 3],
			['HM205', 2, 1, 3],
			['PE201', 2, 1, 2],
			['GE107', 2, 1, 3],
			['HM202', 2, 2, 3],
			['GE104', 2, 2, 3],
			['HM204', 2, 2, 3],
			['HM206', 2, 2, 6],
			['PE202', 2, 2, 2],
			['GE108', 2, 2, 3]
		]
	}
] as const;

// const names = [
// 	'Ana Santos',
// 	'Miguel Reyes',
// 	'Sofia Cruz',
// 	'Gabriel Garcia',
// 	'Isabella Ramos',
// 	'Luis Mendoza',
// 	'Camila Torres',
// 	'Daniel Flores',
// 	'Maria Rivera',
// 	'Joshua Aquino',
// 	'Andrea Bautista',
// 	'Paolo Navarro',
// 	'Nicole Villanueva',
// 	'Carlo Dela Cruz',
// 	'Angela Castillo',
// 	'Rafael Lim',
// 	'Bianca Perez',
// 	'Marco Gonzales',
// 	'Patricia Hernandez',
// 	'Adrian Lopez'
// ];

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
					semesters: 2,
					publishedAt: new Date()
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
				for (const prerequisiteCode of prerequisites[code] ?? []) {
					const prerequisite = catalogSubjects.get(prerequisiteCode);
					if (!prerequisite) throw new Error(`Missing seed prerequisite: ${prerequisiteCode}`);
					tx.insert(schema.curriculumPrerequisite)
						.values({
							curriculumId: curriculum.id,
							subjectId: subject.id,
							prerequisiteId: prerequisite.id
						})
						.onConflictDoNothing()
						.run();
				}
			}
			// Set the default without replacing a program's existing curriculum selection.
			if (program.isActive && program.activeCurriculumId === null) {
				tx.update(schema.program)
					.set({ activeCurriculumId: curriculum.id })
					.where(eq(schema.program.id, program.id))
					.run();
			}
		}
		// for (const [index, name] of names.entries()) {
		// 	const email = 'student.seed.' + (index + 1) + '@example.com';
		// 	const id = 'seed-student-user-' + (index + 1);
		// 	tx.insert(schema.user)
		// 		.values({ id, name, email, role: Role.STUDENT })
		// 		.onConflictDoNothing()
		// 		.run();
		// 	const existing = tx.select().from(schema.user).where(eq(schema.user.email, email)).get();
		// 	if (!existing || existing.role !== Role.STUDENT) continue;
		// 	created.students += tx
		// 		.insert(schema.studentData)
		// 		.values({
		// 			studentId: 'SEED-2026-' + String(index + 1).padStart(6, '0'),
		// 			userId: existing.id,
		// 			contactNumber: '0917' + String(1000000 + index),
		// 			address: 'City of Malolos, Bulacan'
		// 		})
		// 		.onConflictDoNothing()
		// 		.returning()
		// 		.all().length;
		// }
		return created;
	});
}
