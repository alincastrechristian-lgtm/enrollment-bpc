import { DATABASE_URL } from '$app/env/private';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../schema';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = new Database(DATABASE_URL);

export const db = drizzle(client, { schema });

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
