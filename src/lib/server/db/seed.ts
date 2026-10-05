import 'dotenv/config';

import { Role } from '#lib/Roles.js';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { seed } from 'drizzle-seed';
import * as schema from './schema.ts';

async function main() {
	const sqlite = new Database(process.env.DATABASE_URL!);
	const db = drizzle(sqlite, { schema });

	const auth = betterAuth({
		baseURL: process.env.ORIGIN!,
		secret: process.env.BETTER_AUTH_SECRET!,
		database: drizzleAdapter(db, { provider: 'sqlite' }),
		emailAndPassword: { enabled: true, disableSignUp: false },
		plugins: [
			admin({
				defaultRole: Role.STUDENT
			})
		]
	});

	try {
		// @ts-expect-error Weird type error with drizzle-seed, but it works fine at runtime

		await seed(db, {
			applicant: schema.applicant
		}).refine((funcs) => ({
			applicant: {
				count: 20,
				columns: {
					yearLevel: funcs.int({
						minValue: 1,
						maxValue: 4
					})
				}
			}
		}));
	} catch (error) {
		console.error(`Failed to seed applicants: ${(error as Error).message}`);
	}

	try {
		const adminResult = await auth.api.signUpEmail({
			body: {
				email: process.env.INITIAL_ADMIN_EMAIL || 'admin@admin.com',
				password: process.env.INITIAL_ADMIN_PASSWORD || 'admin123',
				name: 'Admin'
			}
		});

		if (adminResult) {
			console.log('Created admin user successfully');
		}
	} catch (error) {
		console.error(`Failed to create admin user: ${(error as Error).message}`);
	}

	await db
		.update(schema.user)
		.set({ role: Role.ADMIN, setupComplete: true })
		.where(eq(schema.user.email, 'admin@admin.com'))
		.execute();

	console.log('Seeding complete!');
}

main();
