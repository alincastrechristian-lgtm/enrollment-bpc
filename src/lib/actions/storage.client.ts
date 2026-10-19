import { resolve } from '$app/paths';
import { error } from '@sveltejs/kit';

export async function uploadGarageFile(folder: string, file: File): Promise<string> {
	const body = new FormData();
	body.set('file', file);
	const response = await fetch(
		`${resolve('/user/settings/storage/upload')}?${new URLSearchParams({ prefix: folder })}`,
		{ method: 'POST', body, headers: { Accept: 'application/json' } }
	);
	const result = await response.json();
	if (!response.ok) {
		error(response.status, typeof result.message === 'string' ? result.message : 'Upload failed.');
	}
	if (typeof result.name !== 'string') throw new Error('Invalid upload response.');
	return result.name;
}
