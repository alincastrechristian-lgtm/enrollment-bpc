<script lang="ts">
	import { createProgram, deleteProgram, updateProgram } from '#lib/actions/program.remote.js';
	import { createSubject, deleteSubject, updateSubject } from '#lib/actions/subject.remote.js';
	import Dropdown from '#lib/components/Dropdown/Dropdown.svelte';
	import {
		showError,
		showLoading,
		showSuccess,
		showYesNo
	} from '#lib/components/Popup/Popup.svelte.js';
	import PopupCard from '#lib/components/Popup/PopupCard.svelte';
	import CatalogPage from './CatalogPage.svelte';
	import CatalogToolbar from './CatalogToolbar.svelte';
	import { refreshAll } from '$app/navigation';
	import { BookOpen, GraduationCap, Hash, Pencil, Plus, Settings, Trash2, X } from '@lucide/svelte';

	type Record = {
		id: string;
		code: string;
		name: string;
		description: string | null;
		isActive: boolean;
	};

	let {
		kind,
		records,
		total,
		search,
		status,
		canManage
	}: {
		kind: 'program' | 'subject';
		records: Record[];
		total: number;
		search: string;
		status: 'all' | 'active' | 'inactive';
		canManage: boolean;
	} = $props();

	const label = $derived(kind === 'program' ? 'Program' : 'Subject');
	const actions = {
		program: { create: createProgram, update: updateProgram, remove: deleteProgram },
		subject: { create: createSubject, update: updateSubject, remove: deleteSubject }
	};

	let dialog = $state<HTMLDialogElement>();
	let selected = $state<Record | null>(null);
	let busy = $state(false);
	const emptyDraft = () => ({ code: '', name: '', description: '', isActive: true });
	let draft = $state(emptyDraft());
	function open(record: Record | null = null) {
		if (busy || !canManage) return;
		selected = record;
		draft = record
			? {
					code: record.code,
					name: record.name,
					description: record.description ?? '',
					isActive: record.isActive
				}
			: emptyDraft();
		dialog?.showModal();
	}
	function close() {
		if (!busy) dialog?.close();
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !canManage) return;
		busy = true;
		showLoading();
		try {
			const payload = { ...draft, description: draft.description.trim() || null };
			if (selected) await actions[kind].update({ ...payload, id: selected.id });
			else await actions[kind].create(payload);
			dialog?.close();
			await refreshAll();
			showSuccess(`${label} ${selected ? 'updated' : 'created'} successfully`);
		} catch (err) {
			showError(err instanceof Error ? err.message : `Failed to save ${kind}`);
		} finally {
			busy = false;
		}
	}
	async function remove(record: Record) {
		if (busy || !canManage) return;
		busy = true;
		try {
			const confirmed = await showYesNo({
				title: `Delete ${kind}?`,
				message: `Delete ${record.name} (${record.code})?`,
				warning: true,
				yesText: 'Delete',
				noText: 'Cancel'
			});
			if (!confirmed) return;
			showLoading();
			await actions[kind].remove(record.id);
			await refreshAll();
			showSuccess(`${label} deleted successfully`);
		} catch (err) {
			showError(err instanceof Error ? err.message : `Failed to delete ${kind}`);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{label}s | BPC Enrollment System</title></svelte:head>

<CatalogPage
	title={`${label}s`}
	description={canManage
		? `Manage ${kind} records and availability`
		: `View ${kind} records and availability`}
	{total}
	itemLabel={`${kind}s`}
>
	{#snippet toolbar()}
		<CatalogToolbar
			{search}
			{status}
			placeholder={`Search by ${kind} name or code...`}
			searchLabel={`Search ${kind}s`}
			statusOptions={[
				{ value: 'all', label: 'All statuses' },
				{ value: 'active', label: 'Active' },
				{ value: 'inactive', label: 'Inactive' }
			]}
		>
			{#if canManage}
				<button
					type="button"
					disabled={busy}
					onclick={() => open()}
					class="btn gap-2 btn-primary btn-sm"
					><Plus class="size-4" aria-hidden="true" />New {label}</button
				>
			{/if}
		</CatalogToolbar>
	{/snippet}
	{#snippet header()}
		<tr
			class="border-b border-base-300 bg-base-200 text-[11px] font-extrabold tracking-wider text-base-content/60 uppercase"
		>
			<th class="py-4 pl-5">{label}</th><th>Code</th><th>Description</th><th
				class={canManage ? '' : 'pr-5'}>Status</th
			>
			{#if canManage}<th class="pr-5 text-right">Actions</th>{/if}
		</tr>
	{/snippet}
	{#each records as row (row.id)}
		<tr class="border-b border-base-200 transition-colors last:border-0 hover:bg-base-200/80">
			<td class="py-4 pl-5"
				><div class="flex items-center gap-3">
					<div
						class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
					>
						{#if kind === 'program'}<GraduationCap
								class="size-5"
								aria-hidden="true"
							/>{:else}<BookOpen class="size-5" aria-hidden="true" />{/if}
					</div>
					<p class="font-bold text-base-content">{row.name}</p>
				</div></td
			>
			<td class="font-mono text-xs font-semibold text-base-content/70">{row.code}</td>
			<td class="max-w-sm text-sm text-base-content/60"
				><p class="line-clamp-2 wrap-break-word whitespace-pre-line">
					{row.description || 'No description'}
				</p></td
			>
			<td
				><span
					class={`badge gap-1.5 border-none px-3 text-xs font-semibold ${row.isActive ? 'badge-success' : 'badge-ghost'}`}
					><span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>{row.isActive
						? 'Active'
						: 'Inactive'}</span
				></td
			>
			{#if canManage}<td class="pr-5"
					><div class="flex justify-end">
						<Dropdown id={`${kind}-${row.id}`} label={`Actions for ${row.name}`} disabled={busy}>
							{#snippet trigger()}<Settings class="size-4" aria-hidden="true" />{/snippet}
							<ul class="menu w-full p-0">
								<li>
									<button type="button" disabled={busy} onclick={() => open(row)}
										><Pencil class="size-4" aria-hidden="true" />Edit</button
									>
								</li>
								<li class="text-error">
									<button type="button" disabled={busy} onclick={() => remove(row)}
										><Trash2 class="size-4" aria-hidden="true" />Delete</button
									>
								</li>
							</ul>
						</Dropdown>
					</div></td
				>{/if}
		</tr>
	{:else}
		<tr
			><td colspan={canManage ? 5 : 4} class="py-12 text-center"
				><p class="font-semibold">No {kind}s found</p>
				<p class="mt-1 text-sm text-base-content/50">
					{search || status !== 'all'
						? 'Try another search or status filter.'
						: canManage
							? `Add your first ${kind} to get started.`
							: 'No records have been added yet.'}
				</p></td
			></tr
		>
	{/each}
</CatalogPage>

{#if canManage}
	<dialog
		bind:this={dialog}
		class="z-0"
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
{/if}
