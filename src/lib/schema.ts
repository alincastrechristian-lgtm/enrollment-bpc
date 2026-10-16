import { Role } from '#lib/Roles.js';
import { relations, sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex,
	type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core';
import { createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import z from 'zod';
import { EmailApiType } from './email';

const uuid = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

export const systemSettings = sqliteTable('system_settings', {
	seeded: integer('seeded', { mode: 'boolean' }).default(false).notNull(),
	id: integer('id').primaryKey().default(1),
	smtpHost: text('smtp_host').default('smtp.gmail.com'),
	smtpPort: integer('smtp_port').default(465),
	senderEmail: text('sender_email'),
	senderName: text('sender_name').default('BPC Enrollment System'),
	senderPassword: text('sender_password'),

	emailApiType: text('email_api_type', { enum: [EmailApiType.SMTP, EmailApiType.RESEND] }).default(
		EmailApiType.SMTP
	),
	resendApiKey: text('resend_api_key')
});

export const program = sqliteTable('program', {
	id: uuid(),
	code: text('code').notNull().unique(),
	name: text('name').notNull(),
	description: text('description'),
	activeCurriculumId: text('active_curriculum_id').references(
		(): AnySQLiteColumn => curriculum.id,
		{ onDelete: 'restrict' }
	),
	isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull()
});

export const programRelations = relations(program, ({ one }) => ({
	activeCurriculum: one(curriculum, {
		fields: [program.activeCurriculumId],
		references: [curriculum.id]
	})
}));

export const subject = sqliteTable('subject', {
	id: uuid(),
	code: text('code').notNull().unique(),
	name: text('name').notNull(),
	description: text('description'),
	isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull()
});

export const curriculum = sqliteTable(
	'curriculum',
	{
		id: uuid(),
		programCode: text('program_code')
			.notNull()
			.references(() => program.code, { onUpdate: 'cascade', onDelete: 'restrict' }),

		// Examples: "2026 Curriculum", "2028 Curriculum"
		name: text('name').notNull(),
		yearLevels: integer('year_levels').notNull().default(4),
		semesters: integer('semesters').notNull().default(2),

		// if publishedAt is null, the curriculum is still in draft mode.
		publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
		archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
		isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull()
	},
	(table) => [uniqueIndex('curriculum_program_name_unique').on(table.programCode, table.name)]
);

export const curriculumRelations = relations(curriculum, ({ one, many }) => ({
	subjects: many(curriculumSubject),
	program: one(program, {
		fields: [curriculum.programCode],
		references: [program.code]
	})
}));

export const curriculumSubject = sqliteTable(
	'curriculum_subject',
	{
		id: uuid(),
		curriculumId: text('curriculum_id')
			.notNull()
			.references(() => curriculum.id, { onDelete: 'cascade' }),
		subjectId: text('subject_id')
			.notNull()
			.references(() => subject.id, { onDelete: 'restrict' }),

		yearLevel: integer('year_level').notNull(),

		// Curriculum subjects belong to semesters 1..curriculum.semesters.
		semester: integer('semester').notNull(),
		units: real('units').notNull(),

		// Snapshot when the curriculum is published.
		subjectCode: text('subject_code').notNull(),
		subjectName: text('subject_name').notNull()
	},
	(table) => [
		uniqueIndex('curriculum_subject_unique').on(table.curriculumId, table.subjectId),
		check('curriculum_subject_year_positive', sql`${table.yearLevel} > 0`),
		check('curriculum_subject_semester_positive', sql`${table.semester} > 0`),
		check('curriculum_subject_units_positive', sql`${table.units} > 0`)
	]
);

export const curriculumSubjectRelations = relations(curriculumSubject, ({ one }) => ({
	subject: one(subject, {
		fields: [curriculumSubject.subjectId],
		references: [subject.id]
	}),
	curriculum: one(curriculum, {
		fields: [curriculumSubject.curriculumId],
		references: [curriculum.id]
	})
}));

export const studentSequence = sqliteTable(
	'student_sequence',
	{
		year: integer('year').notNull(),
		month: integer('month').notNull(),
		lastNumber: integer('last_number').notNull().default(0)
	},
	(table) => [
		primaryKey({ columns: [table.year, table.month] }),
		check('student_sequence_month_range', sql`${table.month} BETWEEN 1 AND 12`),
		check('student_sequence_number_range', sql`${table.lastNumber} BETWEEN 0 AND 999999`)
	]
);

export const studentData = sqliteTable('student', {
	studentId: text('id').notNull().unique().primaryKey(),
	userId: text('user_id')
		.notNull()
		.unique()
		.references(() => user.id, { onDelete: 'restrict' }),
	address: text('address').notNull().default(''),
	contactNumber: text('contact_number').notNull().default(''),
	currentEnrollmentId: text('enrollment_id')
		.unique()
		// AnySQLiteColumn prevents circular reference which typescript cannot resolve.
		.references((): AnySQLiteColumn => enrollment.id, {
			onDelete: 'restrict'
		}),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull()
});

export const studentDataRelations = relations(studentData, ({ one, many }) => ({
	user: one(user, {
		fields: [studentData.userId],
		references: [user.id]
	}),
	currentEnrollment: one(enrollment, {
		fields: [studentData.currentEnrollmentId],
		references: [enrollment.id],
		relationName: 'currentEnrollment'
	}),
	enrollments: many(enrollment, { relationName: 'studentEnrollments' })
}));

export const enrollment = sqliteTable(
	'enrollment',
	{
		id: uuid(),
		studentId: text('student_id')
			.notNull()
			.references(() => studentData.studentId, { onDelete: 'restrict' }),
		curriculumId: text('curriculum_id')
			.notNull()
			.references(() => curriculum.id, { onDelete: 'restrict' }),
		section: text('section').notNull(),
		schoolYearStart: integer('school_year_start').notNull(),
		semester: integer('semester').notNull(),

		// Year level for THIS enrollment, not a global student value.
		yearLevel: integer('year_level').notNull(),

		status: text('status', {
			enum: ['enrolled', 'dropped', 'completed']
		})
			.default('enrolled')
			.notNull(),

		finalizedGrades: integer('finalized_grades', { mode: 'boolean' }).default(false).notNull(),
		submittedClearance: integer('submitted_clearance', { mode: 'boolean' })
			.default(false)
			.notNull(),
		meetingRequestSentAt: integer('meeting_request_sent_at', { mode: 'timestamp_ms' }),
		followUpCompletedAt: integer('follow_up_completed_at', { mode: 'timestamp_ms' }),
		// Claim a send without holding a database transaction open during email delivery.
		meetingRequestStartedAt: integer('meeting_request_started_at', { mode: 'timestamp_ms' }),
		droppedAt: integer('dropped_at', { mode: 'timestamp_ms' }),

		enrolledAt: integer('enrolled_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [
		uniqueIndex('enrollment_student_year_semester_unique')
			.on(table.studentId, table.schoolYearStart, table.semester)
			.where(sql`${table.status} <> 'dropped'`),
		index('enrollment_term_idx').on(table.schoolYearStart, table.semester),
		check('enrollment_year_range', sql`${table.yearLevel} > 0`),
		check('enrollment_status_valid', sql`${table.status} IN ('enrolled', 'dropped', 'completed')`)
	]
);

export const enrollmentRelations = relations(enrollment, ({ one, many }) => ({
	student: one(studentData, {
		fields: [enrollment.studentId],
		references: [studentData.studentId],
		relationName: 'studentEnrollments'
	}),
	curriculum: one(curriculum, {
		fields: [enrollment.curriculumId],
		references: [curriculum.id]
	}),
	subjects: many(enrollmentSubject)
}));

export enum SubjectSource {
	CURRICULUM = 'curriculum',
	EXTRA = 'extra'
}

export const enrollmentSubject = sqliteTable(
	'enrollment_subject',
	{
		id: uuid(),
		enrollmentId: text('enrollment_id')
			.notNull()
			.references(() => enrollment.id, { onDelete: 'cascade' }),
		subjectId: text('subject_id')
			.notNull()
			.references(() => subject.id, { onDelete: 'restrict' }),
		source: text('source', {
			enum: [SubjectSource.CURRICULUM, SubjectSource.EXTRA]
		}).notNull(),

		// Optional: identifies the curriculum entry used to select it.
		// Extra subjects can leave this null.
		curriculumSubjectId: text('curriculum_subject_id').references(() => curriculumSubject.id, {
			onDelete: 'restrict'
		}),

		// Null means no grade until finalized, then INC (Incomplete).
		grade: real('grade'),

		// Historical values for this specific subject attempt.
		subjectCode: text('subject_code').notNull(),
		subjectName: text('subject_name').notNull(),
		units: real('units').notNull(),

		addedBy: text('added_by')
			.notNull()
			.references(() => user.id, { onDelete: 'restrict' }),
		addedAt: integer('added_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [
		uniqueIndex('enrollment_subject_unique').on(table.enrollmentId, table.subjectId),
		index('enrollment_subject_subject_idx').on(table.subjectId),
		check('enrollment_subject_units_positive', sql`${table.units} > 0`),
		check(
			'enrollment_subject_grade_range',
			sql`${table.grade} IS NULL OR ${table.grade} BETWEEN 1 AND 5`
		),
		check('enrollment_subject_source_valid', sql`${table.source} IN ('curriculum', 'extra')`),
		check(
			'enrollment_subject_curriculum_source',
			sql`${table.source} != 'curriculum' OR ${table.curriculumSubjectId} IS NOT NULL`
		)
	]
);

export const enrollmentSubjectRelations = relations(enrollmentSubject, ({ one }) => ({
	enrollment: one(enrollment, {
		fields: [enrollmentSubject.enrollmentId],
		references: [enrollment.id]
	})
}));

export const task = sqliteTable('task', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	title: text('title').notNull(),
	priority: integer('priority').notNull().default(1)
});

const roleValues = Object.values(Role) as [Role, ...Role[]];

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
	image: text('image'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
	role: text('role', { enum: roleValues }).default(Role.STUDENT).notNull(),
	setupComplete: integer('setup_complete', { mode: 'boolean' }).default(false).notNull(),
	banned: integer('banned', { mode: 'boolean' }).default(false),
	banReason: text('ban_reason'),
	banExpires: integer('ban_expires', { mode: 'timestamp_ms' }),
	twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).default(false)
});

export const session = sqliteTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		token: text('token').notNull().unique(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		impersonatedBy: text('impersonated_by')
	},
	(table) => [index('session_userId_idx').on(table.userId)]
);

export const account = sqliteTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: integer('access_token_expires_at', {
			mode: 'timestamp_ms'
		}),
		refreshTokenExpiresAt: integer('refresh_token_expires_at', {
			mode: 'timestamp_ms'
		}),
		scope: text('scope'),
		password: text('password'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(table) => [index('account_userId_idx').on(table.userId)]
);

export const verification = sqliteTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)]
);

export const twoFactor = sqliteTable(
	'two_factor',
	{
		id: text('id').primaryKey(),
		secret: text('secret').notNull(),
		backupCodes: text('backup_codes').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		verified: integer('verified', { mode: 'boolean' }).default(true),
		failedVerificationCount: integer('failed_verification_count').default(0),
		lockedUntil: integer('locked_until', { mode: 'timestamp_ms' })
	},
	(table) => [
		index('twoFactor_secret_idx').on(table.secret),
		index('twoFactor_userId_idx').on(table.userId)
	]
);

export const userRelations = relations(user, ({ one, many }) => ({
	sessions: many(session),
	accounts: many(account),
	twoFactors: many(twoFactor),
	studentData: one(studentData)
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	})
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	})
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
	user: one(user, {
		fields: [twoFactor.userId],
		references: [user.id]
	})
}));

export const subjectSchema = createSelectSchema(subject);
export type Subject = z.infer<typeof subjectSchema>;

export const filterSubjectSchema = createUpdateSchema(subject).omit({
	id: true
});
export type FilterSubject = z.infer<typeof filterSubjectSchema>;

export const programSchema = createSelectSchema(program);
export type Program = z.infer<typeof programSchema>;

export const filterProgramSchema = createUpdateSchema(program).omit({
	id: true,
	activeCurriculumId: true
});
export type FilterProgram = z.infer<typeof filterProgramSchema>;

export const filterUserSchema = createUpdateSchema(user).pick({
	name: true,
	email: true,
	setupComplete: true
});

export const studentEnrollmentFilterSchema = z.object({
	programCode: z.string().optional().meta({
		title: 'Program code',
		filterControl: 'searchable-select',
		filterGroup: 'Current enrollment'
	}),
	yearLevel: z.number().int().positive().optional().meta({
		filterControl: 'select',
		filterGroup: 'Current enrollment'
	}),
	semester: z.number().int().positive().optional().meta({
		filterControl: 'select',
		filterGroup: 'Current enrollment'
	}),
	section: z.enum(['A', 'B', 'C', 'D']).optional().meta({ filterGroup: 'Current enrollment' })
});

export const filterStudentSchema = filterUserSchema
	.extend(studentEnrollmentFilterSchema.shape)
	.extend({
		name: filterUserSchema.shape.name.meta({ filterGroup: 'Student details' }),
		email: filterUserSchema.shape.email.meta({ filterGroup: 'Student details' }),
		setupComplete: filterUserSchema.shape.setupComplete.meta({
			title: 'Account setup complete',
			filterGroup: 'Account status'
		}),
		hasCurrentEnrollment: z.enum(['Yes', 'No']).optional().meta({
			title: 'Has current enrollment',
			filterGroup: 'Current enrollment'
		})
	});

export const curriculumSchema = createSelectSchema(curriculum);
export type Curriculum = z.infer<typeof curriculumSchema>;

export const filterCurriculumSchema = createUpdateSchema(curriculum).pick({
	name: true,
	publishedAt: true
});
