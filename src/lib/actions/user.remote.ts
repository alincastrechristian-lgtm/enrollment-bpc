import { Role } from '#lib/Roles.js';
import { hasAllApplicantDocuments } from '#lib/applicants.js';
import {
	applicant,
	curriculum,
	curriculumSubject,
	enrollment,
	enrollmentSubject,
	program,
	studentData,
	subject,
	SubjectSource,
	user
} from '#lib/schema.js';
import { auth, validateUser } from '#lib/server/auth.js';
import { command, getRequestEvent } from '$app/server';
import { error, isHttpError } from '@sveltejs/kit';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { prettifyError, z } from 'zod';
import { db, type Transaction } from '../server/db';

async function sendPasswordResetLink(email: string, headers: Headers) {
	try {
		await auth.api.requestPasswordReset({
			body: {
				email,
				redirectTo: '/first-login'
			},
			headers: headers
		});
	} catch (err) {
		error(400, err instanceof Error ? err.message : 'Failed to send account setup email.');
	}
}

export const resendMagicLink = command(
	z.object({
		email: z.email()
	}),
	async ({ email }) => {
		const { locals, request } = getRequestEvent();
		validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);

		if (!email) {
			error(400, 'Email is required.');
		}

		await sendPasswordResetLink(email, request.headers);

		return {
			success: true
		};
	}
);

const createUserSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2, 'Name must be at least 2 characters')
		.max(100, 'Name must be at most 100 characters'),

	email: z.email('Please enter a valid email address').trim().toLowerCase()
});
type CreateUserSchema = z.infer<typeof createUserSchema>;

export type CreateUserResult = {
	success: boolean;
	invitationSent: boolean;
	userId: string;
	email: string;
};

// Auth is asynchronous; callers handle database writes and invitations separately.
async function createUser(data: CreateUserSchema, role: Role, headers: Headers) {
	try {
		const result = await auth.api.createUser({
			body: {
				...data,
				role: role === Role.STUDENT ? undefined : role
			},
			headers
		});
		return result.user;
	} catch (cause) {
		error(400, cause instanceof Error ? cause.message : 'Email already exists or is invalid.');
	}
}

export const createRegistrar = command(
	createUserSchema,
	async (data): Promise<CreateUserResult> => {
		const { locals, request } = getRequestEvent();
		validateUser(locals, [Role.ADMIN]);

		const createdUser = await createUser(data, Role.REGISTRAR, request.headers);
		await sendPasswordResetLink(createdUser.email, request.headers);

		return {
			success: true,
			invitationSent: true,
			userId: createdUser.id,
			email: createdUser.email
		};
	}
);

const enrollStudentSchema = z.object({
	applicantId: z.string().trim().min(1, 'Applicant ID is required'),
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

type EnrollStudentInput = z.infer<typeof enrollStudentSchema>;
type EnrollmentSubjectValues = Omit<
	typeof enrollmentSubject.$inferInsert,
	'enrollmentId' | 'addedBy'
>;

// Validate before auth creates an account, and again inside the commit transaction.
function getEnrollmentPlan(
	database: typeof db | Transaction,
	data: EnrollStudentInput,
	linkedUserId?: string
) {
	// During commit, allow the account linked by this request; reject any competing account.
	const record = database.select().from(applicant).where(eq(applicant.id, data.applicantId)).get();
	if (!record) error(404, 'Applicant not found.');
	if (record.userId && record.userId !== linkedUserId)
		error(409, 'Applicant already has a student account.');
	if (!hasAllApplicantDocuments(record)) {
		error(400, 'All applicant documents must be received before creating a student account.');
	}

	if (
		database
			.select({ id: studentData.studentId })
			.from(studentData)
			.where(eq(studentData.applicantId, record.id))
			.get()
	) {
		error(409, 'Applicant already has a student record.');
	}

	// Enrollment uses the program's selected, published curriculum.
	const owner = database.select().from(program).where(eq(program.code, record.programCode)).get();
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

	if (
		data.yearLevel > selectedCurriculum.yearLevels ||
		data.semester > selectedCurriculum.semesters
	) {
		error(400, 'Year level and semester must be within the active curriculum limits.');
	}

	// Validate subject selection before auth creates an account.
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

	return { applicant: record, curriculum: selectedCurriculum, subjects };
}

export const enrollStudent = command(enrollStudentSchema, async (data) => {
	const { locals, request } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);

	// Use stored applicant identity and reject invalid enrollment details before creating an account.
	const initial = getEnrollmentPlan(db, data);
	const details = createUserSchema.safeParse({
		name: initial.applicant.name,
		email: initial.applicant.email
	});
	if (!details.success) error(400, prettifyError(details.error));

	// Auth is asynchronous, so it must run outside better-sqlite3's synchronous transaction.
	const createdUser = await createUser(details.data, Role.STUDENT, request.headers);
	let enrolled: { studentId: string; enrollmentId: string };

	try {
		// Applicant link, student record, enrollment, and subject records commit together.
		enrolled = db.transaction((tx) => {
			// Link only if applicant details and documents still match the initial check.
			const original = initial.applicant;
			const linked = tx
				.update(applicant)
				.set({ userId: createdUser.id })
				.where(
					and(
						eq(applicant.id, original.id),
						isNull(applicant.userId),
						eq(applicant.name, original.name),
						eq(applicant.email, original.email),
						eq(applicant.applicationId, original.applicationId),
						eq(applicant.programCode, original.programCode),
						eq(applicant.yearLevel, original.yearLevel),
						eq(applicant.hasBirthCertificate, true),
						eq(applicant.hasForm138, true),
						eq(applicant.hasGoodMoral, true),
						eq(applicant.hasPicture, true)
					)
				)
				.run();
			if (!linked.changes)
				error(409, 'Applicant changed during enrollment. Refresh and try again.');

			// Curriculum and subject state may have changed while awaiting account creation.
			const plan = getEnrollmentPlan(tx, data, createdUser.id);
			if (plan.curriculum.id !== initial.curriculum.id) {
				error(409, 'Active curriculum changed during enrollment. Refresh and try again.');
			}

			// The applicant's application number becomes the student number.
			const studentId = original.applicationId;
			tx.insert(studentData)
				.values({ studentId, userId: createdUser.id, applicantId: original.id })
				.run();

			const result = tx
				.insert(enrollment)
				.values({
					studentId,
					curriculumId: plan.curriculum.id,
					section: data.section,
					schoolYearStart: data.schoolYearStart,
					semester: data.semester,
					yearLevel: data.yearLevel,
					status: 'pending',
					enrolledAt: new Date()
				})
				.returning({ id: enrollment.id })
				.get();
			if (!result) error(500, 'Failed to create enrollment.');

			tx.insert(enrollmentSubject)
				.values(
					plan.subjects.map((entry) => ({
						...entry,
						enrollmentId: result.id,
						addedBy: locals.user!.id
					}))
				)
				.run();

			// Assign the current enrollment only after its record and subjects exist.
			tx.update(studentData)
				.set({ currentEnrollmentId: result.id })
				.where(eq(studentData.studentId, studentId))
				.run();

			return { studentId, enrollmentId: result.id };
		});
	} catch (cause) {
		try {
			// Transaction rolled back all links; compensate only this request's auth account.
			db.delete(user).where(eq(user.id, createdUser.id)).run();
		} catch (cleanupError) {
			console.error('Enrollment account cleanup failed:', createdUser.id, cleanupError);
			error(
				500,
				'Enrollment failed and the new account could not be removed. Contact an administrator.'
			);
		}

		// Keep expected validation/conflict responses; report unexpected database failures as 500.
		if (isHttpError(cause)) throw cause;
		console.error('Failed to enroll student:', cause);
		error(500, 'Failed to enroll student. Please try again.');
	}

	// Send only after commit. Email failure keeps enrollment intact so invitation can be resent.
	let invitationSent = true;
	try {
		await sendPasswordResetLink(createdUser.email, request.headers);
	} catch {
		invitationSent = false;
	}

	return {
		success: true,
		invitationSent,
		userId: createdUser.id,
		email: createdUser.email,
		...enrolled
	};
});
