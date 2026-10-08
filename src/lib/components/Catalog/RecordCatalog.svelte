<script lang="ts">
	import { deleteProgram } from '#lib/actions/program.remote.js';
	import { deleteSubject } from '#lib/actions/subject.remote.js';
	import Dropdown from '#lib/components/Dropdown/Dropdown.svelte';
	import {
		showError,
		showLoading,
		showSuccess,
		showYesNo
	} from '#lib/components/Popup/Popup.svelte.js';
	import CatalogRecordDialog, { type CatalogRecord } from './CatalogRecordDialog.svelte';
	import CatalogPage from './CatalogPage.svelte';
	import CatalogToolbar from './CatalogToolbar.svelte';
	import { filterProgramSchema, filterSubjectSchema } from '#lib/schema.js';
	import type { FilterValues } from '../Filter/fields.js';
	import { refreshAll } from '$app/navigation';
	import { BookOpen, GraduationCap, Pencil, Plus, Settings, Trash2 } from '@lucide/svelte';

	let {
		kind,
		records,
		total,
		search,
		filters,
		canManage
	}: {
		kind: 'program' | 'subject';
		records: CatalogRecord[];
		total: number;
		search: string;
		filters: FilterValues;
		canManage: boolean;
	} = $props();

	const label = $derived(kind === 'program' ? 'Program' : 'Subject');
	const removeActions = { program: deleteProgram, subject: deleteSubject };
	let recordDialog = $state<CatalogRecordDialog>();
	let busy = $state(false);
	function open(record: CatalogRecord | null = null) {
		if (busy || !canManage) return;
		recordDialog?.open(record);
	}

	async function remove(record: CatalogRecord) {
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
			await removeActions[kind](record.id);
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
			{filters}
			placeholder={`Search by ${kind} name or code...`}
			searchLabel={`Search ${kind}s`}
			filterSchema={kind === 'program' ? filterProgramSchema : filterSubjectSchema}
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
					{search || Object.keys(filters).length > 0
						? 'Try another search or filter.'
						: canManage
							? `Add your first ${kind} to get started.`
							: 'No records have been added yet.'}
				</p></td
			></tr
		>
	{/each}
</CatalogPage>

{#if canManage}
	<CatalogRecordDialog bind:this={recordDialog} {kind} bind:busy />
{/if}
