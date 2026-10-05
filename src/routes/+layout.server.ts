import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ cookies }) => {
	const theme = cookies.get('theme');

	return {
		theme: theme === 'dark' ? 'dark' : 'light'
	};
};
