<script lang="ts">
	import { getStudentDocuments } from '#lib/actions/documents.remote.js';
	import { DOCUMENT_LABELS } from '#lib/documents.js';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	let { popup = false }: { popup?: boolean } = $props();
	const documents = getStudentDocuments();
	const outstanding = $derived(
		documents.current?.items.filter((item) => item.status !== 'verified') ?? []
	);
	const missing = $derived(outstanding.filter((item) => item.status !== 'uploaded'));
	let dialog = $state<HTMLDialogElement>();
	let mounted = $state(false);
	const seen = new SvelteSet<string>();
	onMount(() => {
		mounted = true;
		if (!popup) return;
		const refresh = () => {
			if (document.visibilityState === 'visible') void documents.refresh().catch(() => {});
		};
		window.addEventListener('focus', refresh);
		const timer = window.setInterval(refresh, 60_000);
		return () => {
			window.clearInterval(timer);
			window.removeEventListener('focus', refresh);
		};
	});
	$effect(() => {
		if (!popup || !mounted || !dialog) return;
		if (!missing.length) {
			dialog.close();
			return;
		}
		let unseen = false;
		for (const item of missing) {
			const key = `${documents.current?.userId}:${item.id}:${item.revision}`;
			if (seen.has(key)) continue;
			seen.add(key);
			try {
				if (sessionStorage.getItem(`document-notice:${key}`)) continue;
				sessionStorage.setItem(`document-notice:${key}`, '1');
			} catch {
				/* In-memory acknowledgment remains available. */
			}
			unseen = true;
		}
		if (unseen && !dialog.open) dialog.showModal();
	});
</script>

{#snippet contents()}
	<h2 id={popup ? 'document-popup-title' : 'document-notice-title'} class="text-lg font-bold">
		{missing.length ? 'Upload your required documents' : 'Documents awaiting verification'}
	</h2>
	<p class="mt-2 text-sm text-base-content/70">
		{missing.length
			? `The Registrar needs ${missing.map((item) => DOCUMENT_LABELS[item.kind]).join(', ')}. Upload every requested document before requesting final-semester enrollment.`
			: 'Your uploads are with the Registrar. All requested documents must be verified before final-semester enrollment.'}
	</p>
	<a
		class="btn mt-4 btn-primary btn-sm"
		href={`${resolve('/user/enrollment')}#required-documents`}
		onclick={() => dialog?.close()}
	>
		View required documents
	</a>
{/snippet}

{#if popup}
	<dialog bind:this={dialog} class="modal" aria-labelledby="document-popup-title">
		<div class="modal-box">
			{@render contents()}
			<form method="dialog" class="modal-action">
				<button class="btn btn-ghost btn-sm">Remind me later</button>
			</form>
		</div>
	</dialog>
{:else if documents.error}
	<div class="portal-panel border-warning/40 p-5" role="alert">
		Could not load document requirements. <a
			class="link text-primary"
			href={`${resolve('/user/enrollment')}#required-documents`}
		>
			Check required documents
		</a>
	</div>
{:else if outstanding.length}
	<section
		class="portal-panel border-warning/40 p-5 sm:p-6"
		aria-labelledby="document-notice-title"
	>
		{@render contents()}
	</section>
{/if}
