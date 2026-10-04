import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error('DATABASE_URL is not set');
}

mkdirSync(dirname(resolve(databaseUrl)), { recursive: true });

const client = new Database(databaseUrl);

try {
	migrate(drizzle(client), { migrationsFolder: resolve('/app/drizzle') });
	console.info('Database migrations are up to date.');
} finally {
	client.close();
}

execFileSync(process.execPath, ['--import', 'tsx', resolve('src/lib/server/db/seed.ts')], {
	stdio: 'inherit'
});
