<script lang="ts">
	import { getErrorMessage } from '#lib/errors.js';
	import { createSubject, updateSubject } from '#lib/actions/subject.remote.js';
	import { showError, showLoading, showSuccess } from '#lib/components/Popup/Popup.svelte.js';
	import PopupCard from '#lib/components/Popup/PopupCard.svelte';
	import type { Subject } from '#lib/schema.js';
	import { refreshAll } from '$app/navigation';
	import { Hash, Pencil, Plus, X } from '@lucide/svelte';

	let {
		busy = $bindable(false),
		oncreated
	}: {
		busy?: boolean;
		oncreated?: (subject: Subject) => void;
	} = $props();

	let dialog: HTMLDialogElement;
	let selectedSubject = $state<Subject | null>(null);
	const emptyDraft = () => ({
		code: '',
		name: '',
		description: '',
		isActive: true
	});
	let draft = $state(emptyDraft());
	export function open(record: Subject | null = null) {
		if (busy) return;
		selectedSubject = record;
		draft = record
			? {
					code: record.code,
					name: record.name,
					description: record.description ?? '',
					isActive: record.isActive
				}
			: emptyDraft();
		dialog.showModal();
	}
	function close() {
		if (!busy) dialog.close();
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		let saved = false;
		try {
			showLoading();
			const payload = { ...draft, description: draft.description.trim() || null };
			let created: Subject | undefined;
			if (selectedSubject) await updateSubject({ ...payload, id: selectedSubject.id });
			else created = await createSubject(payload);
			saved = true;
			dialog.close();
			if (created) oncreated?.(created);
			await refreshAll();
			showSuccess(`Subject ${selectedSubject ? 'updated' : 'created'} successfully`);
		} catch (err) {
			showError(
				saved
					? 'Subject saved, but the page could not refresh. Reload to see the latest catalog.'
					: getErrorMessage(err, 'Failed to save subject')
			);
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="fixed inset-0 z-0 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 backdrop:bg-transparent"
	aria-labelledby="subject-form-title"
	aria-describedby="subject-form-description"
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
>
	<PopupCard onClose={close} class="max-w-xl">
		<form class="portal-dialog-form" onsubmit={save}>
			<div class="portal-dialog-header">
				<div class="portal-dialog-icon bg-primary/10 text-primary">
					{#if selectedSubject}
						<Pencil class="size-6" aria-hidden="true" />
					{:else}
						<Plus class="size-6" aria-hidden="true" />
					{/if}
				</div>
				<div class="min-w-0 flex-1">
					<h2 id="subject-form-title" class="portal-dialog-title">
						{selectedSubject ? 'Edit' : 'New'}
						Subject
					</h2>
					<p id="subject-form-description" class="portal-dialog-description">
						{selectedSubject ? 'Update details and availability.' : 'Add a subject to the catalog.'}
					</p>
				</div>
				<button
					type="button"
					disabled={busy}
					onclick={close}
					class="btn btn-square shrink-0 btn-ghost btn-sm"
					aria-label="Close subject form"
				>
					<X class="size-4" aria-hidden="true" />
				</button>
			</div>
			<div class="portal-dialog-body">
				<fieldset disabled={busy} class="min-w-0 space-y-5">
					<div class="space-y-2">
						<label for="subject-name" class="text-sm font-semibold">Name</label>
						<input
							id="subject-name"
							class="input-bordered input w-full bg-base-200 text-sm"
							bind:value={draft.name}
							minlength="2"
							required
							placeholder="Subject name"
						/>
					</div>
					<div class="space-y-2">
						<label for="subject-code" class="text-sm font-semibold">Code</label>
						<div class="input-bordered input flex w-full items-center gap-3 bg-base-200">
							<Hash class="size-4 shrink-0 text-base-content/50" aria-hidden="true" />
							<input
								id="subject-code"
								class="min-w-0 grow text-sm"
								bind:value={draft.code}
								required
								placeholder="e.g. CS101"
							/>
						</div>
					</div>
					<div class="space-y-2">
						<label for="subject-description" class="text-sm font-semibold">
							Description <span class="font-normal text-base-content/50">(optional)</span>
						</label>
						<textarea
							id="subject-description"
							class="textarea-bordered textarea w-full bg-base-200 text-sm"
							rows="3"
							bind:value={draft.description}
							placeholder="Describe this subject"></textarea>
					</div>

					<label
						class="flex cursor-pointer items-start gap-3 rounded-xl border border-base-300 bg-base-200 p-4"
					>
						<input
							type="checkbox"
							class="checkbox checkbox-sm checkbox-primary"
							bind:checked={draft.isActive}
						/>
						<span>
							<span class="block text-sm font-semibold">Active</span>
							<span class="mt-1 block text-xs text-base-content/50">
								Keep this subject available for use.
							</span>
						</span>
					</label>
				</fieldset>
			</div>
			<div class="portal-dialog-footer">
				<button
					type="button"
					class="btn border-base-300 btn-outline"
					disabled={busy}
					onclick={close}
				>
					Cancel
				</button>
				<button type="submit" class="btn btn-primary" disabled={busy}>
					{#if busy}
						<span class="loading loading-sm loading-spinner" aria-hidden="true"></span>
					{/if}
					{busy ? 'Saving...' : selectedSubject ? 'Save changes' : 'Create Subject'}
				</button>
			</div>
		</form>
	</PopupCard>
</dialog>
