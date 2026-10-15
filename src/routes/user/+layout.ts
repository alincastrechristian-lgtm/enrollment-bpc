import type { LayoutLoad } from './$types';
import { resolve } from '$app/paths';

const routeMeta: Record<string, { pageTitle?: string; pageDescription?: string }> = {
	'/user/dashboard': {
		pageTitle: 'DASHBOARD',
		pageDescription: 'View an overview of your enrollment system.'
	},
	'/user/registrars': {
		pageTitle: 'REGISTRARS',
		pageDescription: 'Manage and maintain registrar accounts and access.'
	},
	'/user/students': {
		pageTitle: 'STUDENTS',
		pageDescription: 'Create student accounts and manage enrollment records.'
	},
	'/user/students/[userId]/enroll': {
		pageTitle: 'ENROLL STUDENT',
		pageDescription:
			'Choose a program, review enrollment information, and customize subjects and units.'
	},
	'/user/students/[userId]': {
		pageTitle: 'STUDENT DETAILS',
		pageDescription: 'Review student information, account status, and enrollment history.'
	},
	'/user/students/[userId]/enrollments/[enrollmentId]': {
		pageTitle: 'ENROLLMENT DETAILS',
		pageDescription: 'Review enrollment subjects and grades.'
	},
	'/user/enrollment': {
		pageTitle: 'ENROLLMENT',
		pageDescription: 'Review your enrollment history, subjects, and grades.'
	},
	'/user/subjects': {
		pageTitle: 'SUBJECTS',
		pageDescription: 'Manage the catalog of subjects offered.'
	},
	'/user/programs': {
		pageTitle: 'PROGRAMS',
		pageDescription: 'Manage degree and program offerings.'
	},
	'/user/curriculum': {
		pageTitle: 'CURRICULUM',
		pageDescription: 'View curriculum subjects, semesters, and unit requirements.'
	},
	'/user/curriculum/new': {
		pageTitle: 'NEW CURRICULUM',
		pageDescription: 'Build a curriculum and arrange its subjects.'
	},
	'/user/curriculum/*': {
		pageTitle: 'CURRICULUM DETAILS',
		pageDescription: 'Review curriculum subjects, semesters, and units.'
	},
	'/user/requirements': {
		pageTitle: 'REQUIREMENTS',
		pageDescription: 'Review enrollment information.'
	},
	'/user/notifications': {
		pageTitle: 'NOTIFICATIONS',
		pageDescription: 'Send and track system notifications.'
	},
	'/user/reports': {
		pageTitle: 'REPORTS',
		pageDescription: 'Generate and view enrollment reports.'
	},
	'/user/settings/email': {
		pageTitle: 'EMAIL SETTINGS',
		pageDescription: 'Configure the system sender and SMTP connection.'
	},
	'/user/settings/profile': {
		pageTitle: 'MY PROFILE',
		pageDescription: 'View your personal details and account information.'
	},
	'/user/settings': {
		pageTitle: 'SETTINGS',
		pageDescription: 'Configure system and user settings.'
	}
};

export const load: LayoutLoad = ({ url, route, params }) => {
	const path = url.pathname.replace(/\/$/, '') || '/user/dashboard';
	const meta =
		routeMeta[route.id ?? ''] ??
		routeMeta[path] ??
		(path.startsWith('/user/curriculum/') ? routeMeta['/user/curriculum/*'] : undefined) ??
		{};
	return {
		backHref:
			(route.id === '/user/students/[userId]/enrollments/[enrollmentId]' ||
				route.id === '/user/students/[userId]/enroll') &&
			params.userId
				? resolve('/user/students/[userId]', { userId: params.userId })
				: undefined,
		pageTitle: meta.pageTitle,
		pageDescription: meta.pageDescription
	};
};
