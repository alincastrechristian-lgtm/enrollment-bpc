import { z } from 'zod';
import { studentSexValues, todayInManila } from './student-demographics';

export const createStudentSchema = z.object({
	name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
	email: z.email('Enter a valid email address').trim().toLowerCase(),
	address: z.string().trim().min(1, 'Address is required').max(500),
	contactNumber: z.string().trim().min(1, 'Contact number is required').max(30),
	birthDate: z.iso
		.date('Enter a valid birth date')
		.refine((value) => value <= todayInManila(), 'Birth date cannot be in the future')
		.nullable()
		.default(null),
	sex: z.enum(studentSexValues, { error: 'Choose a valid sex' }).nullable().default(null)
});

// Compare exactly what the admin opened, including legacy casing/spacing.
export const studentInformationSnapshotSchema = z.object({
	name: z.string(),
	email: z.string(),
	address: z.string(),
	contactNumber: z.string(),
	birthDate: z.string().nullable(),
	sex: z.enum(studentSexValues).nullable()
});
export type StudentInformationSnapshot = z.infer<typeof studentInformationSnapshotSchema>;
export type EditableStudentInformation = StudentInformationSnapshot & { userId: string };

export const updateStudentSchema = createStudentSchema.extend({
	userId: z.string().min(1),
	original: studentInformationSnapshotSchema
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
