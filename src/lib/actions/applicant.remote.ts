import { Role } from '#lib/Roles.js';
import { applicant, applicantSequence, program } from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm/sql/expressions/conditions';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import z from 'zod';

const fieldValidation = {
	name: z.string().trim().min(2, 'Name must be at least 2 characters'),
	programCode: z.string().trim().min(1, 'Program is required'),
	yearLevel: z.number().int().min(1).max(4),
	email: z.email('Please enter a valid email address').trim().toLowerCase(),
	contactNumber: z.string().trim().min(1, 'Contact number is required'),
	address: z.string().trim().min(1, 'Address is required')
};

const applicationInsertSchema = createInsertSchema(applicant, fieldValidation).omit({
	id: true,
	applicationId: true,
	userId: true,
	createdAt: true,
	updatedAt: true
});

const applicationUpdateSchema = createUpdateSchema(applicant, fieldValidation)
	.omit({ applicationId: true, userId: true, createdAt: true, updatedAt: true })
	.partial()
	.extend({ id: z.string().min(1) });

export const createApplicant = command(applicationInsertSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);

	if (
		!db.select({ id: program.id }).from(program).where(eq(program.code, data.programCode)).get()
	) {
		error(400, 'Select a program from the program catalog.');
	}
	return db.transaction((tx) => {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone: 'Asia/Manila',
			year: 'numeric',
			month: '2-digit'
		}).formatToParts(new Date());
		const year = Number(parts.find((part) => part.type === 'year')!.value);
		const month = Number(parts.find((part) => part.type === 'month')!.value);
		const sequence = tx
			.insert(applicantSequence)
			.values({ year, month, lastNumber: 1 })
			.onConflictDoUpdate({
				target: [applicantSequence.year, applicantSequence.month],
				set: { lastNumber: sql`${applicantSequence.lastNumber} + 1` },
				setWhere: sql`${applicantSequence.lastNumber} < 999999`
			})
			.returning({ lastNumber: applicantSequence.lastNumber })
			.get();
		if (!sequence) error(409, 'Monthly applicant number limit reached.');

		const applicationId = `MA-${year}${String(month).padStart(2, '0')}-${String(sequence.lastNumber).padStart(6, '0')}`;
		tx.insert(applicant)
			.values({ ...data, applicationId })
			.run();
		return { applicationId };
	});
});

export const updateApplicant = command(applicationUpdateSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);

	if (!data.id) {
		error(400, 'Applicant ID is required for update.');
	}
	if (
		data.programCode !== undefined &&
		!db.select({ id: program.id }).from(program).where(eq(program.code, data.programCode)).get()
	) {
		error(400, 'Select a program from the program catalog.');
	}

	const result = await db.update(applicant).set(data).where(eq(applicant.id, data.id));

	if (result.changes === 0) {
		error(404, 'Applicant not found.');
	}
});

export const deleteApplicant = command(z.string(), async (applicantId) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);

	const applicantData = await db.query.applicant.findFirst({
		where: eq(applicant.id, applicantId),
		with: { studentData: true }
	});

	if (!applicantData) {
		error(404, 'Applicant not found.');
	}

	if (applicantData.studentData) {
		error(409, 'Cannot delete applicant with an associated student account.');
	}

	const result = await db.delete(applicant).where(eq(applicant.id, applicantId));

	if (result.changes === 0) {
		error(404, 'Applicant not found.');
	}
});
