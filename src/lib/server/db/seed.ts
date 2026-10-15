import 'dotenv/config';

import { Role } from '#lib/Roles.js';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../schema.ts';
import { seedAcademicData } from './seed-data.ts';

async function main() {
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
	const sqlite = new Database(process.env.DATABASE_URL);
	const db = drizzle(sqlite, { schema });
	const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || 'admin@admin.com').trim().toLowerCase();
	try {
		const settings = db
			.select({ seeded: schema.systemSettings.seeded })
			.from(schema.systemSettings)
			.where(eq(schema.systemSettings.id, 1))
			.get();
		if (settings?.seeded) {
			console.log('Database already seeded; skipping.');
			return;
		}

		db.insert(schema.systemSettings).values({ id: 1 }).onConflictDoNothing().run();
		const created = seedAcademicData(db);
		console.log(
			`Added ${created.programs} programs, ${created.subjects} subjects, ${created.curricula} curricula, and ${created.students} students. No enrollments created.`
		);
		if (
			!db
				.select({ id: schema.user.id })
				.from(schema.user)
				.where(eq(schema.user.email, adminEmail))
				.get()
		) {
			const auth = betterAuth({
				baseURL: process.env.ORIGIN!,
				secret: process.env.BETTER_AUTH_SECRET!,
				database: drizzleAdapter(db, { provider: 'sqlite' }),
				emailAndPassword: { enabled: true, disableSignUp: false },
				plugins: [
					admin({
						defaultRole: Role.ADMIN
					})
				]
			});

			const adminResult = await auth.api.signUpEmail({
				body: {
					email: adminEmail,
					password: process.env.INITIAL_ADMIN_PASSWORD || 'admin123',
					name: 'Admin'
				}
			});

			if (adminResult) {
				console.log('Created admin user successfully');
			}
		}

		await db
			.update(schema.user)
			.set({ role: Role.ADMIN, setupComplete: true })
			.where(eq(schema.user.email, adminEmail))
			.execute();

		db.update(schema.systemSettings)
			.set({ seeded: true })
			.where(eq(schema.systemSettings.id, 1))
			.run();

		console.log('Seeding complete!');
	} finally {
		sqlite.close();
	}
}

main().catch((cause) => {
	console.error('Seeding failed:', cause instanceof Error ? cause.message : cause);
	process.exitCode = 1;
});
