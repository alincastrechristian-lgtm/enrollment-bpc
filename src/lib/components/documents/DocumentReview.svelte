<script lang="ts">
	import {
		getStudentDocumentReview,
		requestDocuments,
		reviewDocument
	} from '#lib/actions/documents.remote.js';
	import {
		DOCUMENT_KINDS,
		DOCUMENT_LABELS,
		DOCUMENT_STATUS_LABELS,
		type DocumentKind
	} from '#lib/documents.js';
	import { getErrorMessage } from '#lib/errors.js';
	import { showYesNo } from '#lib/components/Popup/Popup.svelte.js';
	import { resolve } from '$app/paths';
	let { userId }: { userId: string } = $props();
	const documents = $derived(getStudentDocumentReview(userId));
	let selected = $state<DocumentKind[]>([]);
	let reasons = $state<Record<string, string>>({});
	let busy = $state(false);
	let message = $state('');
	async function request() {
		if (
			busy ||
			!documents.current?.canRequest ||
			!documents.current.enrollmentId ||
			!selected.length
		)
			return;
		busy = true;
		message = '';
		try {
			await requestDocuments({
				userId,
				enrollmentId: documents.current.enrollmentId,
				kinds: selected
			});
			selected = [];
			message = 'Documents requested. Student notified.';
		} catch (cause) {
			message = getErrorMessage(cause, 'Could not request documents.');
		} finally {
			busy = false;
		}
	}
	async function review(id: string, revision: number, decision: 'verified' | 'rejected') {
		if (busy) return;
		busy = true;
		message = '';
		try {
			if (
				decision === 'verified' &&
				!(await showYesNo('Confirm you reviewed this document and it is valid?'))
			)
				return;
			await reviewDocument({
				id,
				revision,
				decision,
				...(decision === 'rejected' ? { reason: reasons[id]?.trim() ?? '' } : {})
			});
			message =
				decision === 'verified' ? 'Document verified.' : 'Replacement requested. Student notified.';
		} catch (cause) {
			message = getErrorMessage(cause, 'Could not review document.');
		} finally {
			busy = false;
		}
	}
</script>

<section
	id="required-documents"
	class="portal-panel p-5 sm:p-6"
	aria-labelledby="document-review-title"
>
	<h2 id="document-review-title" class="text-lg font-bold">Required documents</h2>
	<p class="mt-2 text-sm text-base-content/65">
		Request documents in the first semester of the student’s final year. Every selected document
		must be uploaded before requesting final-semester enrollment and verified before enrollment.
	</p>
	{#if message}
		<p role="status" class="mt-4 text-sm">{message}</p>
	{/if}
	{#if documents.error}
		<p role="alert" class="mt-3 text-sm text-error">Could not load documents.</p>
		<button class="btn mt-3 btn-outline btn-sm" onclick={() => documents.refresh().catch(() => {})}>
			Retry
		</button>
	{:else if documents.current}
		{#if documents.current.canRequest}
			<form
				class="mt-4 rounded-xl bg-base-200/50 p-4"
				onsubmit={(event) => {
					event.preventDefault();
					void request();
				}}
			>
				<fieldset disabled={busy}>
					<legend class="text-sm font-semibold">Choose required documents</legend>
					<div class="mt-3 flex flex-wrap gap-4">
						{#each DOCUMENT_KINDS as kind (kind)}
							{@const requested = documents.current.items.some((item) => item.kind === kind)}
							<label class="flex items-center gap-2 text-sm">
								<input
									class="checkbox checkbox-sm checkbox-primary"
									type="checkbox"
									value={kind}
									bind:group={selected}
									disabled={requested}
								/>
								{DOCUMENT_LABELS[kind]}{requested ? ' (requested)' : ''}
							</label>
						{/each}
					</div>
					<button class="btn mt-4 btn-primary btn-sm" disabled={busy || !selected.length}>
						Request documents
					</button>
				</fieldset>
			</form>
		{:else}
			<p class="mt-3 text-xs text-base-content/55">
				New requests are available only in the first semester of the final year. Existing requests
				can still be reviewed.
			</p>
		{/if}
		<div class="mt-4 space-y-3">
			{#each documents.current.items as item (item.id)}
				<article class="rounded-xl border border-base-300 p-4">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<h3 class="font-semibold">{DOCUMENT_LABELS[item.kind]}</h3>
						<span class="badge badge-outline badge-sm">{DOCUMENT_STATUS_LABELS[item.status]}</span>
					</div>
					{#if item.hasFile}
						<a
							class="mt-3 block truncate text-sm text-primary underline"
							href={resolve('/user/document-files/[id]', { id: item.id })}
						>
							Download {item.filename}
						</a>
					{/if}
					{#if item.rejectionReason}
						<p class="mt-2 text-sm">Correction requested: {item.rejectionReason}</p>
					{/if}
					{#if item.status === 'uploaded'}
						<div class="mt-4 space-y-3">
							<button
								class="btn btn-sm btn-success"
								disabled={busy}
								onclick={() => review(item.id, item.revision, 'verified')}
							>
								Verify document
							</button>
							<label class="block text-xs font-semibold" for={`reason-${item.id}`}>
								Reason for requesting another copy
							</label>
							<textarea
								id={`reason-${item.id}`}
								class="textarea-bordered textarea w-full"
								bind:value={reasons[item.id]}
								maxlength="1000"
								placeholder="Explain what needs to be corrected"
								disabled={busy}></textarea>
							<button
								class="btn btn-outline btn-error btn-sm"
								disabled={busy || (reasons[item.id]?.trim().length ?? 0) < 5}
								onclick={() => review(item.id, item.revision, 'rejected')}
							>
								Request another copy
							</button>
						</div>
					{:else if item.status === 'verified'}
						<p class="mt-2 text-xs text-base-content/60">Verified by {item.reviewerName}.</p>
					{/if}
				</article>
			{:else}
				<p class="text-sm text-base-content/60">No documents requested.</p>
			{/each}
		</div>
	{:else}
		<p role="status" class="mt-3 text-sm">Loading documents…</p>
	{/if}
</section>
