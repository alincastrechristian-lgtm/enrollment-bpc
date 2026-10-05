import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { applicant } from '#lib/server/db/schema.js';
import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm/sql/expressions/conditions';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import z from 'zod';

const fieldValidation = {
	applicationId: z.string().trim().min(1, 'Application ID is required'),
	name: z.string().trim().min(2, 'Name must be at least 2 characters'),
	program: z.string().trim().min(1, 'Program is required'),
	yearLevel: z.number().int().min(1).max(4),
	email: z.email('Please enter a valid email address').trim().toLowerCase(),
	contactNumber: z.string().trim().min(1, 'Contact number is required'),
	address: z.string().trim().min(1, 'Address is required')
};
const applicationInsertSchema = createInsertSchema(applicant, fieldValidation).omit({
	id: true,
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

	await db.insert(applicant).values(data);
});

export const updateApplicant = command(applicationUpdateSchema, async (data) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);

	if (!data.id) {
		error(400, 'Applicant ID is required for update.');
	}

	const result = await db.update(applicant).set(data).where(eq(applicant.id, data.id));

	if (result.changes === 0) {
		error(404, 'Applicant not found.');
	}
});

export const deleteApplicant = command(z.string(), async (applicantId) => {
	const { locals } = getRequestEvent();
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR]);

	const result = await db.delete(applicant).where(eq(applicant.id, applicantId));

	if (result.changes === 0) {
		error(404, 'Applicant not found.');
	}
});
