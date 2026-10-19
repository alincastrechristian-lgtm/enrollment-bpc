import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => ({
	resumeSetup: Boolean(
		locals.user &&
		locals.session &&
		!locals.user.setupComplete &&
		!url.searchParams.has('token') &&
		!url.searchParams.has('error')
	)
});
