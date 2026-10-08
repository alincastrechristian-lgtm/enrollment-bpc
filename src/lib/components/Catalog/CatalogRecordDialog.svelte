<script module lang="ts">
	export type CatalogRecord = {
		id: string;
		code: string;
		name: string;
		description: string | null;
		isActive: boolean;
	};
</script>

<script lang="ts">
	import { createProgram, updateProgram } from '#lib/actions/program.remote.js';
	import { createSubject, updateSubject } from '#lib/actions/subject.remote.js';
	import { showError, showLoading, showSuccess } from '#lib/components/Popup/Popup.svelte.js';
	import PopupCard from '#lib/components/Popup/PopupCard.svelte';
	import { refreshAll } from '$app/navigation';
	import { Hash, Pencil, Plus, X } from '@lucide/svelte';

	let {
		kind,
		busy = $bindable(false),
		oncreated
	}: {
		kind: 'program' | 'subject';
		busy?: boolean;
		oncreated?: (record: CatalogRecord) => void;
	} = $props();

	const label = $derived(kind === 'program' ? 'Program' : 'Subject');
	const actions = {
		program: { create: createProgram, update: updateProgram },
		subject: { create: createSubject, update: updateSubject }
	};
	let dialog: HTMLDialogElement;
	let selected = $state<CatalogRecord | null>(null);
	const emptyDraft = () => ({ code: '', name: '', description: '', isActive: true });
	let draft = $state(emptyDraft());

	export function open(record: CatalogRecord | null = null) {
		if (busy) return;
		selected = record;
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
		showLoading();
		let saved = false;
		try {
			const payload = { ...draft, description: draft.description.trim() || null };
			let created: CatalogRecord | undefined;
			if (selected) await actions[kind].update({ ...payload, id: selected.id });
			else created = await actions[kind].create(payload);
			saved = true;
			dialog.close();
			if (created) oncreated?.(created);
			await refreshAll();
			showSuccess(`${label} ${selected ? 'updated' : 'created'} successfully`);
		} catch (err) {
			showError(
				saved
					? `${label} saved, but the page could not refresh. Reload to see the latest catalog.`
					: err instanceof Error
						? err.message
						: `Failed to save ${kind}`
			);
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="fixed inset-0 z-0 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0"
	aria-labelledby={`${kind}-form-title`}
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
>
	<PopupCard onClose={close} class="max-w-xl">
		<form class="flex max-h-[85dvh] flex-col overflow-hidden rounded-box" onsubmit={save}>
			<div class="flex items-start gap-4 border-b border-base-300 p-6">
				<div
					class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
				>
					{#if selected}<Pencil class="size-6" aria-hidden="true" />{:else}<Plus
							class="size-6"
							aria-hidden="true"
						/>{/if}
				</div>
				<div class="min-w-0 flex-1">
					<h2 id={`${kind}-form-title`} class="text-lg font-semibold">
						{selected ? 'Edit' : 'New'}
						{label}
					</h2>
					<p class="mt-1 text-sm text-base-content/60">
						{selected ? 'Update details and availability.' : `Add a ${kind} to the catalog.`}
					</p>
				</div>
				<button
					type="button"
					disabled={busy}
					onclick={close}
					class="btn btn-circle btn-ghost btn-sm"
					aria-label={`Close ${kind} form`}><X class="size-4" aria-hidden="true" /></button
				>
			</div>
			<fieldset disabled={busy} class="min-w-0 space-y-5 overflow-y-auto p-6">
				<div class="space-y-2">
					<label for={`${kind}-name`} class="text-sm font-semibold">Name</label><input
						id={`${kind}-name`}
						class="input-bordered input w-full bg-base-200 text-sm"
						bind:value={draft.name}
						minlength="2"
						required
						placeholder={`${label} name`}
					/>
				</div>
				<div class="space-y-2">
					<label for={`${kind}-code`} class="text-sm font-semibold">Code</label>
					<div class="input-bordered input flex w-full items-center gap-3 bg-base-200">
						<Hash class="size-4 shrink-0 text-base-content/50" aria-hidden="true" /><input
							id={`${kind}-code`}
							class="min-w-0 grow text-sm"
							bind:value={draft.code}
							required
							placeholder={kind === 'program' ? 'e.g. BSIS' : 'e.g. CS101'}
						/>
					</div>
				</div>
				<div class="space-y-2">
					<label for={`${kind}-description`} class="text-sm font-semibold"
						>Description <span class="font-normal text-base-content/50">(optional)</span></label
					><textarea
						id={`${kind}-description`}
						class="textarea-bordered textarea w-full bg-base-200 text-sm"
						rows="3"
						bind:value={draft.description}
						placeholder={`Describe this ${kind}`}></textarea>
				</div>
				<label
					class="flex cursor-pointer items-start gap-3 rounded-xl border border-base-300 bg-base-200 p-4"
					><input
						type="checkbox"
						class="checkbox checkbox-sm checkbox-primary"
						bind:checked={draft.isActive}
					/><span
						><span class="block text-sm font-semibold">Active</span><span
							class="mt-1 block text-xs text-base-content/50"
							>Keep this {kind} available for use.</span
						></span
					></label
				>
			</fieldset>
			<div class="flex gap-2 border-t border-base-300 bg-base-200/40 p-6">
				<button
					type="button"
					class="btn flex-1 border-base-300 btn-outline"
					disabled={busy}
					onclick={close}>Cancel</button
				><button type="submit" class="btn flex-1 btn-primary" disabled={busy}
					>{#if busy}<span class="loading loading-sm loading-spinner" aria-hidden="true"
						></span>{/if}{busy
						? 'Saving...'
						: selected
							? 'Save changes'
							: `Create ${label}`}</button
				>
			</div>
		</form>
	</PopupCard>
</dialog>
