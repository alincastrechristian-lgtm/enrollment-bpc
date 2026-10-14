<script module lang="ts">
	export type CurriculumOption = {
		id: string;
		programCode: string;
		name: string;
		publishedAt: Date | null;
		status: 'draft' | 'active' | 'inactive' | 'archived';
	};
</script>

<script lang="ts">
	import { createProgram, updateProgram } from '#lib/actions/program.remote.js';
	import SearchableSelect from '#lib/components/Dropdown/SearchableSelect.svelte';
	import {
		showError,
		showLoading,
		showSuccess,
		showYesNo
	} from '#lib/components/Popup/Popup.svelte.js';
	import PopupCard from '#lib/components/Popup/PopupCard.svelte';
	import type { Program } from '#lib/schema.js';
	import { refreshAll } from '$app/navigation';
	import { Hash, Pencil, Plus, X } from '@lucide/svelte';

	let {
		curricula = [],
		busy = $bindable(false),
		oncreated
	}: {
		curricula?: CurriculumOption[];
		busy?: boolean;
		oncreated?: (program: Program) => void;
	} = $props();

	let dialog: HTMLDialogElement;
	let selectedProgram = $state<Program | null>(null);
	const emptyDraft = () => ({ code: '', name: '', description: '', isActive: true });
	let draft = $state(emptyDraft());
	let activeCurriculumId = $state('');
	const programCurricula = $derived(
		curricula.filter((record) => record.programCode === selectedProgram?.code)
	);

	export function open(record: Program | null = null) {
		if (busy) return;
		selectedProgram = record;
		activeCurriculumId = record?.activeCurriculumId ?? '';
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
			const selectionChanged =
				selectedProgram !== null &&
				activeCurriculumId !== (selectedProgram.activeCurriculumId ?? '');
			if (selectionChanged) {
				const chosen = programCurricula.find((record) => record.id === activeCurriculumId);
				if (activeCurriculumId && !chosen)
					throw new Error('Select a curriculum belonging to this program.');
				if (
					!(await showYesNo({
						title: 'Change active curriculum?',
						message: chosen
							? `Activate ${chosen.name} for ${draft.code}? ${chosen.publishedAt === null ? 'This publishes the curriculum and locks editing. ' : ''}The previous active curriculum will be archived. Existing enrollment assignments stay unchanged.`
							: `Remove the active curriculum for ${draft.code}? The program will have no active curriculum. Existing enrollment assignments stay unchanged.`,
						warning: true,
						yesText: 'Save changes',
						noText: 'Cancel'
					}))
				)
					return;
			}
			showLoading();
			const payload = { ...draft, description: draft.description.trim() || null };
			let created: Program | undefined;
			if (selectedProgram) {
				await updateProgram({
					...payload,
					id: selectedProgram.id,
					...(selectionChanged ? { activeCurriculumId: activeCurriculumId || null } : {})
				});
			} else created = await createProgram(payload);
			saved = true;
			dialog.close();
			if (created) oncreated?.(created);
			await refreshAll();
			showSuccess(`Program ${selectedProgram ? 'updated' : 'created'} successfully`);
		} catch (err) {
			showError(
				saved
					? 'Program saved, but the page could not refresh. Reload to see the latest catalog.'
					: err instanceof Error
						? err.message
						: 'Failed to save program'
			);
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="fixed inset-0 z-0 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0"
	aria-labelledby="program-form-title"
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
					{#if selectedProgram}
						<Pencil class="size-6" aria-hidden="true" />
					{:else}
						<Plus class="size-6" aria-hidden="true" />
					{/if}
				</div>
				<div class="min-w-0 flex-1">
					<h2 id="program-form-title" class="text-lg font-semibold">
						{selectedProgram ? 'Edit' : 'New'}
						Program
					</h2>
					<p class="mt-1 text-sm text-base-content/60">
						{selectedProgram ? 'Update details and availability.' : 'Add a program to the catalog.'}
					</p>
				</div>
				<button
					type="button"
					disabled={busy}
					onclick={close}
					class="btn btn-circle btn-ghost btn-sm"
					aria-label="Close program form"
				>
					<X class="size-4" aria-hidden="true" />
				</button>
			</div>
			<fieldset disabled={busy} class="min-w-0 space-y-5 overflow-y-auto p-6">
				<div class="space-y-2">
					<label for="program-name" class="text-sm font-semibold">Name</label>
					<input
						id="program-name"
						class="input-bordered input w-full bg-base-200 text-sm"
						bind:value={draft.name}
						minlength="2"
						required
						placeholder="Program name"
					/>
				</div>
				<div class="space-y-2">
					<label for="program-code" class="text-sm font-semibold">Code</label>
					<div class="input-bordered input flex w-full items-center gap-3 bg-base-200">
						<Hash class="size-4 shrink-0 text-base-content/50" aria-hidden="true" />
						<input
							id="program-code"
							class="min-w-0 grow text-sm"
							bind:value={draft.code}
							required
							placeholder="e.g. BSIS"
						/>
					</div>
				</div>
				<div class="space-y-2">
					<label for="program-description" class="text-sm font-semibold">
						Description <span class="font-normal text-base-content/50">(optional)</span>
					</label>
					<textarea
						id="program-description"
						class="textarea-bordered textarea w-full bg-base-200 text-sm"
						rows="3"
						bind:value={draft.description}
						placeholder="Describe this program"></textarea>
				</div>
				{#if selectedProgram}
					<div class="space-y-2">
						<label for="program-active-curriculum" class="text-sm font-semibold">
							Active curriculum
						</label>
						<SearchableSelect
							id="program-active-curriculum"
							label="Active curriculum"
							bind:value={activeCurriculumId}
							options={[
								{ value: '', label: 'None' },
								...programCurricula.map((record) => ({
									value: record.id,
									label: `${record.name} (${record.status.charAt(0).toUpperCase() + record.status.slice(1)})`
								}))
							]}
							placeholder="Select a curriculum"
							searchLabel="Search curricula"
							disabled={busy}
						/>
						<p class="text-xs text-base-content/50">
							Choose a curriculum for this program, or None to leave it without an active
							curriculum.
						</p>
					</div>
				{/if}
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
							Keep this program available for use.
						</span>
					</span>
				</label>
			</fieldset>
			<div class="flex gap-2 border-t border-base-300 bg-base-200/40 p-6">
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
					{busy ? 'Saving...' : selectedProgram ? 'Save changes' : 'Create Program'}
				</button>
			</div>
		</form>
	</PopupCard>
</dialog>
