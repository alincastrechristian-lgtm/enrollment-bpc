import { Role } from '#lib/Roles.js';
import { user } from '#lib/schema.js';
import { validateUser } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	validateUser(locals, [Role.ADMIN, Role.REGISTRAR, Role.STUDENT]);
	const account = await db.query.user.findFirst({
		where: eq(user.id, locals.user.id),
		columns: {
			name: true,
			email: true,
			image: true,
			role: true,
			emailVerified: true,
			setupComplete: true,
			createdAt: true,
			updatedAt: true
		},
		with: {
			applicant: { columns: { contactNumber: true, address: true } },
			studentData: {
				columns: { studentId: true },
				with: {
					applicant: { columns: { contactNumber: true, address: true } },
					currentEnrollment: {
						columns: {
							yearLevel: true,
							section: true,
							semester: true,
							schoolYearStart: true,
							status: true
						},
						with: {
							curriculum: {
								columns: { programCode: true },
								with: { program: { columns: { name: true } } }
							}
						}
					}
				}
			}
		}
	});
	if (!account) error(404, 'Your profile could not be found.');
	const { applicant, studentData, ...details } = account;
	const contact = studentData?.applicant ?? applicant;
	return {
		profile: {
			...details,
			contactNumber: contact?.contactNumber ?? null,
			address: contact?.address ?? null,
			student:
				account.role === Role.STUDENT && studentData
					? { studentId: studentData.studentId, enrollment: studentData.currentEnrollment }
					: null
		}
	};
};
