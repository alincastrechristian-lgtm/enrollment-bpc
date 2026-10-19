<script lang="ts">
	import { getErrorMessage } from '#lib/errors.js';
	import { createSubject, updateSubject } from '#lib/actions/subject.remote.js';
	import { showError, showLoading, showSuccess } from '#lib/components/Popup/Popup.svelte.js';
	import PopupCard from '#lib/components/Popup/PopupCard.svelte';
	import SearchableSelect from '#lib/components/Dropdown/SearchableSelect.svelte';
	import type { Subject } from '#lib/schema.js';
	import { refreshAll } from '$app/navigation';
	import { Hash, Pencil, Plus, X } from '@lucide/svelte';

	let {
		busy = $bindable(false),
		oncreated,
		subjects = []
	}: {
		busy?: boolean;
		oncreated?: (subject: Subject) => void;
		subjects?: Pick<Subject, 'id' | 'code' | 'name'>[];
	} = $props();

	let dialog: HTMLDialogElement;
	let selectedSubject = $state<Subject | null>(null);
	let prerequisiteSelection = $state('');
	const emptyDraft = () => ({
		code: '',
		name: '',
		description: '',
		isActive: true,
		prerequisiteIds: [] as string[]
	});
	let draft = $state(emptyDraft());
	export function open(record: Subject | null = null, prerequisiteIds: string[] = []) {
		if (busy) return;
		selectedSubject = record;
		prerequisiteSelection = '';
		draft = record
			? {
					code: record.code,
					name: record.name,
					description: record.description ?? '',
					isActive: record.isActive,
					prerequisiteIds: [...prerequisiteIds]
				}
			: emptyDraft();
		dialog.showModal();
	}
	function close() {
		if (!busy) dialog.close();
	}
	function addPrerequisite(id: string) {
		if (busy || id === selectedSubject?.id || draft.prerequisiteIds.includes(id)) return;
		draft.prerequisiteIds.push(id);
		prerequisiteSelection = '';
	}
	function removePrerequisite(id: string) {
		if (!busy) draft.prerequisiteIds = draft.prerequisiteIds.filter((entry) => entry !== id);
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
	class="fixed inset-0 z-0 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0"
	aria-labelledby="subject-form-title"
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
>
	<PopupCard onClose={close} class="max-w-xl">
		<form class="flex max-h-[85dvh] flex-col overflow-hidden rounded-box" onsubmit={save}>
			<div class="flex shrink-0 items-start gap-4 border-b border-base-300 p-6">
				<div
					class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
				>
					{#if selectedSubject}
						<Pencil class="size-6" aria-hidden="true" />
					{:else}
						<Plus class="size-6" aria-hidden="true" />
					{/if}
				</div>
				<div class="min-w-0 flex-1">
					<h2 id="subject-form-title" class="text-lg font-semibold">
						{selectedSubject ? 'Edit' : 'New'}
						Subject
					</h2>
					<p class="mt-1 text-sm text-base-content/60">
						{selectedSubject ? 'Update details and availability.' : 'Add a subject to the catalog.'}
					</p>
				</div>
				<button
					type="button"
					disabled={busy}
					onclick={close}
					class="btn btn-circle btn-ghost btn-sm"
					aria-label="Close subject form"
				>
					<X class="size-4" aria-hidden="true" />
				</button>
			</div>
			<div class="min-h-0 flex-1 overflow-y-auto">
				<fieldset disabled={busy} class="min-w-0 space-y-5 p-6">
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

					<fieldset class="space-y-2">
						<legend class="text-sm font-semibold">Prerequisite subjects</legend>
						<p class="text-xs text-base-content/60">
							Students must pass every selected subject in an earlier term, with finalized grades.
							Applies across all curricula.
						</p>
						{#if draft.prerequisiteIds.length}
							<ul
								class="flex max-h-36 flex-wrap gap-2 overflow-y-auto"
								aria-label="Selected prerequisite subjects"
							>
								{#each draft.prerequisiteIds as id (id)}
									{@const entry = subjects.find((subject) => subject.id === id)}
									<li
										class="flex max-w-full items-start gap-1 rounded-lg border border-primary/20 bg-primary/10 py-1 pr-1 pl-3 text-xs text-primary"
									>
										<span class="min-w-0 py-1 wrap-break-word">
											{entry?.code ?? id} — {entry?.name ?? 'Subject unavailable'}
										</span>
										<button
											type="button"
											class="btn btn-square size-6 min-h-6 shrink-0 btn-ghost"
											aria-label={`Remove ${entry?.code ?? id}`}
											onclick={() => removePrerequisite(id)}
											disabled={busy}
										>
											<X class="size-3.5" aria-hidden="true" />
										</button>
									</li>
								{/each}
							</ul>
						{/if}
						<SearchableSelect
							id="subject-prerequisite"
							label="Add prerequisite subject"
							bind:value={prerequisiteSelection}
							options={subjects
								.filter(
									(entry) =>
										entry.id !== selectedSubject?.id && !draft.prerequisiteIds.includes(entry.id)
								)
								.map((entry) => ({ value: entry.id, label: `${entry.code} — ${entry.name}` }))}
							placeholder="Search and add a prerequisite..."
							searchLabel="Search prerequisite subjects"
							onchange={addPrerequisite}
							disabled={busy}
						/>
					</fieldset>

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
			<div class="flex shrink-0 gap-2 border-t border-base-300 bg-base-200 p-6">
				<button
					type="button"
					class="btn flex-1 border-base-300 btn-outline"
					disabled={busy}
					onclick={close}
				>
					Cancel
				</button>
				<button type="submit" class="btn flex-1 btn-primary" disabled={busy}>
					{#if busy}
						<span class="loading loading-sm loading-spinner" aria-hidden="true"></span>
					{/if}
					{busy ? 'Saving...' : selectedSubject ? 'Save changes' : 'Create Subject'}
				</button>
			</div>
		</form>
	</PopupCard>
</dialog>
