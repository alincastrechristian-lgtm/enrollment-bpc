import { getMasterlist } from '#lib/server/masterlist.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	// Page visits always start from the first batch; only the rows endpoint advances it.
	const source = new URL(url);
	source.searchParams.delete('page');
	return getMasterlist({ locals, url: source });
};
