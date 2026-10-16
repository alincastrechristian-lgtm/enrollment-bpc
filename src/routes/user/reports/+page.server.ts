import { getReports } from '#lib/server/reports.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => getReports(event);
