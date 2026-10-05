const routeMeta: Record<string, { pageTitle?: string; pageDescription?: string }> = {
	'/user/dashboard': {
		pageTitle: 'DASHBOARD',
		pageDescription: 'View an overview of your enrollment system.'
	},
	'/user/applicants': {
		pageTitle: 'APPLICANTS',
		pageDescription: 'Manage and review all incoming applicant records.'
	},
	'/user/registrars': {
		pageTitle: 'REGISTRARS',
		pageDescription: 'Manage and maintain registrar accounts and access.'
	},
	'/user/applicants/*': {
		pageTitle: 'APPLICANT DETAILS',
		pageDescription: 'View and manage applicant details.'
	},
	'/user/students': {
		pageTitle: 'STUDENTS',
		pageDescription: 'View and manage enrolled student records.'
	},
	'/user/enrollment': {
		pageTitle: 'ENROLLMENT',
		pageDescription: 'Track active enrollment periods and batches.'
	},
	'/user/subjects': {
		pageTitle: 'SUBJECTS',
		pageDescription: 'Manage the catalog of subjects offered.'
	},
	'/user/programs': {
		pageTitle: 'PROGRAMS',
		pageDescription: 'Manage degree and program offerings.'
	},
	'/user/requirements': {
		pageTitle: 'REQUIREMENTS',
		pageDescription: 'Review applicant and enrollment requirements.'
	},
	'/user/notifications': {
		pageTitle: 'NOTIFICATIONS',
		pageDescription: 'Send and track system notifications.'
	},
	'/user/reports': {
		pageTitle: 'REPORTS',
		pageDescription: 'Generate and view enrollment reports.'
	},
	'/user/settings': {
		pageTitle: 'SETTINGS',
		pageDescription: 'Configure system and user settings.'
	}
};

export const load = ({ url }: { url: URL }) => {
	const path = url.pathname.replace(/\/$/, '') || '/user/dashboard';
	const meta =
		routeMeta[path] ??
		(path.startsWith('/user/applicants/') ? routeMeta['/user/applicants/*'] : undefined) ??
		{};
	return {
		pageTitle: meta.pageTitle,
		pageDescription: meta.pageDescription
	};
};
