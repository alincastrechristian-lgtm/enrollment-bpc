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
			studentData: {
				columns: {
					studentId: true,
					address: true,
					contactNumber: true,
					birthDate: true,
					sex: true
				},
				with: {
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
	const { studentData, ...details } = account;
	const contact = studentData;
	return {
		profile: {
			...details,
			contactNumber: contact?.contactNumber ?? null,
			address: contact?.address ?? null,
			birthDate: contact?.birthDate ?? null,
			sex: contact?.sex ?? null,
			student:
				account.role === Role.STUDENT && studentData
					? { studentId: studentData.studentId, enrollment: studentData.currentEnrollment }
					: null
		}
	};
};
