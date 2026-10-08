import { Role } from '#lib/Roles.js';
import { relations, sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import { createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import type z from 'zod';

const uuid = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

export const systemSettings = sqliteTable('system_settings', {
	id: integer('id').primaryKey().default(1),
	smtpHost: text('smtp_host').default('smtp.gmail.com'),
	smtpPort: integer('smtp_port').default(465),
	senderEmail: text('sender_email'),
	senderName: text('sender_name').default('BPC Enrollment System'),
	senderPassword: text('sender_password')
});

export const program = sqliteTable('program', {
	id: uuid(),
	code: text('code').notNull().unique(),
	name: text('name').notNull(),
	description: text('description'),
	isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull()
});

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
		programId: text('program_id')
			.notNull()
			.references(() => program.id, { onDelete: 'restrict' }),

		// Examples: "2026 Curriculum", "2028 Curriculum"
		name: text('name').notNull(),

		// if publishedAt is null, the curriculum is still in draft mode.
		publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
		isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull()
	},
	(table) => [uniqueIndex('curriculum_program_name_unique').on(table.programId, table.name)]
);

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

		// 1 = first semester, 2 = second, 3 = summer
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

export const studentData = sqliteTable('student', {
	id: uuid(),
	userId: text('user_id')
		.notNull()
		.unique()
		.references(() => user.id, { onDelete: 'restrict' }),
	studentNumber: text('student_number').notNull().unique()
});

export const academicTerm = sqliteTable(
	'academic_term',
	{
		id: uuid(),

		// Example: 2026 represents school year 2026–2027.
		startYear: integer('start_year').notNull(),
		semester: integer('semester').notNull(),

		enrollmentOpensAt: integer('enrollment_opens_at', {
			mode: 'timestamp_ms'
		}).notNull(),
		enrollmentClosesAt: integer('enrollment_closes_at', {
			mode: 'timestamp_ms'
		}).notNull()
	},
	(table) => [
		uniqueIndex('academic_term_year_semester_unique').on(table.startYear, table.semester),
		check('academic_term_semester_range', sql`${table.semester} BETWEEN 1 AND 3`),
		check(
			'academic_term_enrollment_dates',
			sql`${table.enrollmentClosesAt} > ${table.enrollmentOpensAt}`
		)
	]
);

export const enrollment = sqliteTable(
	'enrollment',
	{
		id: uuid(),
		studentId: text('student_id')
			.notNull()
			.references(() => studentData.id, { onDelete: 'restrict' }),
		termId: text('term_id')
			.notNull()
			.references(() => academicTerm.id, { onDelete: 'restrict' }),
		curriculumId: text('curriculum_id')
			.notNull()
			.references(() => curriculum.id, { onDelete: 'restrict' }),

		// Year level for THIS enrollment, not a global student value.
		yearLevel: integer('year_level').notNull(),

		status: text('status', {
			enum: ['pending', 'enrolled', 'cancelled', 'withdrawn']
		})
			.default('pending')
			.notNull(),

		enrolledAt: integer('enrolled_at', { mode: 'timestamp_ms' })
	},
	(table) => [
		uniqueIndex('enrollment_student_term_unique').on(table.studentId, table.termId),
		index('enrollment_term_idx').on(table.termId),
		check('enrollment_year_range', sql`${table.yearLevel} BETWEEN 1 AND 4`),
		check(
			'enrollment_status_valid',
			sql`${table.status} IN ('pending', 'enrolled', 'cancelled', 'withdrawn')`
		)
	]
);

export const enrollmentSubject = sqliteTable(
	'enrollment_subject',
	{
		id: uuid(),
		enrollmentId: text('enrollment_id')
			.notNull()
			.references(() => enrollment.id, { onDelete: 'restrict' }),
		subjectId: text('subject_id')
			.notNull()
			.references(() => subject.id, { onDelete: 'restrict' }),

		// Optional: identifies the curriculum entry used to select it.
		// Extra subjects can leave this null.
		curriculumSubjectId: text('curriculum_subject_id').references(() => curriculumSubject.id, {
			onDelete: 'restrict'
		}),

		source: text('source', {
			enum: ['curriculum', 'extra']
		})
			.default('curriculum')
			.notNull(),

		remarks: text('remarks'),

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
		check('enrollment_subject_source_valid', sql`${table.source} IN ('curriculum', 'extra')`),
		check(
			'enrollment_subject_curriculum_source',
			sql`${table.source} != 'curriculum' OR ${table.curriculumSubjectId} IS NOT NULL`
		)
	]
);

export const applicant = sqliteTable(
	'applicant',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.unique()
			.references(() => user.id, { onDelete: 'set null' }),

		applicationId: text('application_id').notNull().unique(),

		name: text('name').notNull(),
		program: text('program').notNull(),
		yearLevel: integer('year_level').notNull(),
		dateApplied: integer('date_applied', { mode: 'timestamp_ms' }).notNull(),
		email: text('email').notNull(),
		contactNumber: text('contact_number').notNull(),
		address: text('address').notNull(),

		hasBirthCertificate: integer('has_birth_certificate', { mode: 'boolean' })
			.default(false)
			.notNull(),
		hasForm138: integer('has_form_138', { mode: 'boolean' }).default(false).notNull(),
		hasGoodMoral: integer('has_good_moral', { mode: 'boolean' }).default(false).notNull(),
		hasPicture: integer('has_picture', { mode: 'boolean' }).default(false).notNull(),

		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(table) => [check('year_level_range', sql`${table.yearLevel} BETWEEN 1 AND 4`)]
);

export const applicantSequence = sqliteTable('applicant_sequence', {
	year: integer('year').primaryKey(),
	lastNumber: integer('last_number').notNull().default(0)
});

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
	applicant: one(applicant)
}));

export const applicantRelations = relations(applicant, ({ one }) => ({
	user: one(user, {
		fields: [applicant.userId],
		references: [user.id]
	})
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

export const applicantSchema = createSelectSchema(applicant);
export type Applicant = z.infer<typeof applicantSchema>;

export const filterApplicantSchema = createUpdateSchema(applicant).omit({
	id: true,
	userId: true,
	applicationId: true,
	updatedAt: true,
	createdAt: true
});
export type FilterApplicant = z.infer<typeof filterApplicantSchema>;

export const subjectSchema = createSelectSchema(subject);
export type Subject = z.infer<typeof subjectSchema>;

export const filterSubjectSchema = createUpdateSchema(subject).omit({
	id: true
});
export type FilterSubject = z.infer<typeof filterSubjectSchema>;

export const programSchema = createSelectSchema(program);
export type Program = z.infer<typeof programSchema>;

export const filterProgramSchema = createUpdateSchema(program).omit({
	id: true
});
export type FilterProgram = z.infer<typeof filterProgramSchema>;

export const filterUserSchema = createUpdateSchema(user).pick({
	name: true,
	email: true,
	setupComplete: true
});

export const curriculumSchema = createSelectSchema(curriculum);
export type Curriculum = z.infer<typeof curriculumSchema>;
