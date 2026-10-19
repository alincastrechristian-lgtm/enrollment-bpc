import { Role } from '#lib/Roles.js';
import { validateUser } from '#lib/server/auth.js';
import { garageAdminConfigured } from '#lib/server/garage/index.js';
import { fileStorageConfigured } from '#lib/server/garage/files.js';
import { getStorageOverview } from '#lib/server/garage/admin.js';
import { browseStorage, storageFolder } from '#lib/server/garage/explorer.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, setHeaders }) => {
	validateUser(locals, [Role.ADMIN]);
	setHeaders({ 'Cache-Control': 'private, no-store' });
	const folder = storageFolder(url.searchParams.get('prefix') || '');
	const configured = garageAdminConfigured();
	const filesConfigured = fileStorageConfigured();
	const [status, listing] = await Promise.allSettled([
		configured ? getStorageOverview() : Promise.resolve(null),
		filesConfigured
			? browseStorage(folder, url.searchParams.get('cursor') || undefined)
			: Promise.resolve(null)
	]);
	return {
		pageTitle: 'Storage settings',
		pageDescription: 'Manage Garage storage, node capacity, and files.',
		configured,
		filesConfigured,
		folder,
		overview: status.status === 'fulfilled' ? status.value : null,
		statusError:
			status.status === 'rejected'
				? 'Could not load Garage status. Check connectivity and admin token permissions.'
				: null,
		listing: listing.status === 'fulfilled' ? listing.value : null,
		filesError:
			listing.status === 'rejected'
				? 'Could not load files. Check storage connectivity and permissions.'
				: null
	};
};
