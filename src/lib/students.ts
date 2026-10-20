import { z } from 'zod';
import { latestStudentBirthDate, studentSexValues, todayInManila } from './student-demographics';
import { personNameSchema } from './person-name';

const studentInformationSchema = personNameSchema.extend({
	email: z.email('Enter a valid email address').trim().toLowerCase(),
	address: z.string().trim().min(1, 'Address is required').max(500),
	contactNumber: z.string().trim().min(1, 'Contact number is required').max(30),
	birthDate: z.iso
		.date('Enter a valid birth date')
		.refine((value) => value <= todayInManila(), 'Birth date cannot be in the future'),
	sex: z.enum(studentSexValues, { error: 'Choose a valid sex' })
});

// Shared with the native form pattern; separators do not count as phone digits.
export const studentContactNumberPattern = ' *[0-9](?:[ \\-]*[0-9]){10} *';
export const createStudentSchema = studentInformationSchema.extend({
	contactNumber: studentInformationSchema.shape.contactNumber.regex(
		new RegExp(`^${studentContactNumberPattern}$`),
		'Contact number must contain exactly 11 digits. Spaces and hyphens are allowed.'
	),
	birthDate: studentInformationSchema.shape.birthDate.refine(
		(value) => value <= latestStudentBirthDate(),
		'Student must be at least 17 years old.'
	)
});

// Compare exactly what staff opened, without normalizing the original values.
export const studentInformationSnapshotSchema = z.object({
	name: z.string(),
	firstName: z.string(),
	middleName: z.string(),
	lastName: z.string(),
	email: z.string(),
	address: z.string(),
	contactNumber: z.string(),
	birthDate: z.string(),
	sex: z.enum(studentSexValues)
});
export type StudentInformationSnapshot = z.infer<typeof studentInformationSnapshotSchema>;
export type EditableStudentInformation = StudentInformationSnapshot & { userId: string };

export const updateStudentSchema = studentInformationSchema.extend({
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
