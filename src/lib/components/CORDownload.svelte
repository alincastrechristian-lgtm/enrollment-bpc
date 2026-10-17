<script lang="ts">
	import { resolve } from '$app/paths';
	import { error } from '@sveltejs/kit';
	import { FileDown } from '@lucide/svelte';
	import { getErrorMessage } from '#lib/errors.js';
	import type { enrollment } from '#lib/schema.js';
	import { showError } from '#lib/components/Popup/Popup.svelte.js';

	let {
		enrollmentId,
		status,
		disabled = false
	}: {
		enrollmentId: string;
		status: typeof enrollment.$inferSelect.status;
		disabled?: boolean;
	} = $props();
	let downloading = $state(false);

	async function download() {
		if (disabled || downloading) return;
		downloading = true;
		try {
			const response = await fetch(
				resolve('/user/enrollment/[enrollmentId]/cor', { enrollmentId })
			);
			if (!response.ok) {
				// Map known HTTP states locally; never show server/provider response bodies.
				const messages: Record<number, string> = {
					401: 'Your session has expired. Sign in again to download the COR.',
					403: 'You do not have permission to download this COR.',
					404: 'This enrollment could not be found.',
					409: 'A COR is available only for enrolled or completed enrollments.',
					429: 'Too many requests. Wait a moment before trying again.'
				};
				if (messages[response.status]) error(response.status, messages[response.status]);
				throw new Error('COR download failed');
			}
			if (response.headers.get('content-type')?.split(';')[0].trim() !== 'application/pdf') {
				throw new Error('Unexpected COR response');
			}

			const file = await response.blob();
			const url = URL.createObjectURL(file);
			const link = document.createElement('a');
			const filename = response.headers
				.get('content-disposition')
				?.match(/filename="([^"]+)"/)?.[1];
			link.href = url;
			link.download = filename?.replace(/[^a-zA-Z0-9._-]/g, '_') || `COR-${enrollmentId}.pdf`;
			document.body.append(link);
			link.click();
			link.remove();
			// Give the browser time to start reading the download before releasing its URL.
			setTimeout(() => URL.revokeObjectURL(url), 60_000);
		} catch (cause) {
			showError(getErrorMessage(cause, 'Could not download the COR. Please try again.'));
		} finally {
			downloading = false;
		}
	}
</script>

{#if status === 'enrolled' || status === 'completed'}
	<button
		type="button"
		class="btn border-base-300 btn-outline btn-sm"
		disabled={disabled || downloading}
		aria-busy={downloading}
		onclick={download}
	>
		{#if downloading}
			<span class="loading loading-xs loading-spinner" aria-hidden="true"></span>
		{:else}
			<FileDown class="size-4" aria-hidden="true" />
		{/if}
		{downloading ? 'Downloading COR…' : 'Download COR'}
	</button>
{/if}
