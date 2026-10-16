import { z } from 'zod';

export const createStudentSchema = z.object({
	name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
	email: z.email('Enter a valid email address').trim().toLowerCase(),
	address: z.string().trim().min(1, 'Address is required').max(500),
	contactNumber: z.string().trim().min(1, 'Contact number is required').max(30)
});

export function canDeleteStudentAccount({
	setupComplete,
	currentEnrollmentId,
	hasEnrollment
}: {
	setupComplete: boolean;
	currentEnrollmentId?: string | null;
	hasEnrollment: boolean;
}) {
	return !setupComplete && !currentEnrollmentId && !hasEnrollment;
}
