import 'dotenv/config';
import Database from 'better-sqlite3';
import { migrateSettingsSecrets } from '../src/lib/server/secrets';

const mode = process.argv[2];
if (!['encrypt', 'decrypt'].includes(mode)) {
	console.error('Usage: npm run db:secrets -- encrypt|decrypt. Stop app instances before running.');
	process.exit(1);
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const database = new Database(process.env.DATABASE_URL, { fileMustExist: true });
try {
	const changed = migrateSettingsSecrets(
		database,
		process.env.DATA_ENCRYPTION_KEY,
		mode as 'encrypt' | 'decrypt'
	);
	console.log(
		`${changed} stored credentials ${mode === 'encrypt' ? 'encrypted' : 'decrypted for rollback'}. No secret values were printed.`
	);
} finally {
	database.close();
}
