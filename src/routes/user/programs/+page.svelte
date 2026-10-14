<script lang="ts">
	import { deleteProgram } from '#lib/actions/program.remote.js';
	import CatalogPage from '#lib/components/Catalog/CatalogPage.svelte';
	import CatalogToolbar from '#lib/components/Catalog/CatalogToolbar.svelte';
	import Dropdown from '#lib/components/Dropdown/Dropdown.svelte';
	import {
		showError,
		showLoading,
		showSuccess,
		showYesNo
	} from '#lib/components/Popup/Popup.svelte.js';
	import { filterProgramSchema, type Program } from '#lib/schema.js';
	import { refreshAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { GraduationCap, Pencil, Plus, Settings, Trash2 } from '@lucide/svelte';
	import type { PageProps } from './$types';
	import ProgramDialog from './ProgramDialog.svelte';

	let { data }: PageProps = $props();
	const programs = $derived(data.records);
	let programDialog = $state<ProgramDialog>();
	let busy = $state(false);

	function open(program: Program | null = null) {
		if (busy || !data.canManage) return;
		programDialog?.open(program);
	}

	async function remove(program: Program) {
		if (busy || !data.canManage) return;
		busy = true;
		try {
			const confirmed = await showYesNo({
				title: 'Delete program?',
				message: `Delete ${program.name} (${program.code})?`,
				warning: true,
				yesText: 'Delete',
				noText: 'Cancel'
			});
			if (!confirmed) return;
			showLoading();
			await deleteProgram(program.id);
			await refreshAll();
			showSuccess('Program deleted successfully');
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Failed to delete program');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Programs | BPC Enrollment System</title></svelte:head>

<CatalogPage
	title="Programs"
	description={data.canManage
		? 'Manage program records and availability'
		: 'View program records and availability'}
	total={data.total}
	itemLabel="programs"
>
	{#snippet toolbar()}
		<CatalogToolbar
			search={data.search}
			filters={data.filters}
			placeholder="Search by program name or code..."
			searchLabel="Search programs"
			filterSchema={filterProgramSchema}
		>
			{#if data.canManage}
				<button
					type="button"
					disabled={busy}
					onclick={() => open()}
					class="btn gap-2 btn-primary btn-sm"
				>
					<Plus class="size-4" aria-hidden="true" />
					New Program
				</button>
			{/if}
		</CatalogToolbar>
	{/snippet}
	{#snippet header()}
		<tr
			class="border-b border-base-300 bg-base-200 text-[11px] font-extrabold tracking-wider text-base-content/60 uppercase"
		>
			<th class="py-4 pl-5">Program</th>
			<th>Code</th>
			<th>Description</th>
			<th>Curriculum</th>
			<th class={data.canManage ? '' : 'pr-5'}>Status</th>
			{#if data.canManage}
				<th class="pr-5 text-right">Actions</th>
			{/if}
		</tr>
	{/snippet}
	{#each programs as program (program.id)}
		<tr class="border-b border-base-200 transition-colors last:border-0 hover:bg-base-200/80">
			<!-- Program -->
			<td class="py-4 pl-5">
				<div class="flex items-center gap-3">
					<div
						class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
					>
						<GraduationCap class="size-5" aria-hidden="true" />
					</div>
					<p class="font-bold text-base-content">{program.name}</p>
				</div>
			</td>

			<!-- Code -->
			<td class="font-mono text-xs font-semibold text-base-content/70">{program.code}</td>

			<!-- Description -->
			<td class="max-w-sm text-sm text-base-content/60">
				<p class="line-clamp-2 wrap-break-word whitespace-pre-line">
					{program.description || 'No description'}
				</p>
			</td>

			<!-- Curriculum -->
			<td>
				{#if program.activeCurriculum}
					<a
						class="link text-sm font-semibold link-primary"
						href={resolve('/user/curriculum/[curriculumId]', {
							curriculumId: program.activeCurriculum.id
						})}
					>
						{program.activeCurriculum.name}
					</a>
				{:else}
					<span class="text-xs text-base-content/50">No active curriculum</span>
				{/if}
			</td>

			<!-- Status -->
			<td>
				<span
					class={`badge gap-1.5 border-none px-3 text-xs font-semibold ${program.isActive ? 'badge-success' : 'badge-ghost'}`}
				>
					<span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
					{program.isActive ? 'Active' : 'Inactive'}
				</span>
			</td>

			<!-- Actions -->
			{#if data.canManage}
				<td class="pr-5">
					<div class="flex justify-end">
						<Dropdown
							id={`program-${program.id}`}
							label={`Actions for ${program.name}`}
							disabled={busy}
						>
							{#snippet trigger()}
								<Settings class="size-4" aria-hidden="true" />
							{/snippet}
							<ul class="menu w-full p-0">
								<li>
									<button type="button" disabled={busy} onclick={() => open(program)}>
										<Pencil class="size-4" aria-hidden="true" />Edit
									</button>
								</li>
								<li class="text-error">
									<button type="button" disabled={busy} onclick={() => remove(program)}>
										<Trash2 class="size-4" aria-hidden="true" />Delete
									</button>
								</li>
							</ul>
						</Dropdown>
					</div>
				</td>
			{/if}
		</tr>
	{:else}
		<tr>
			<td colspan={data.canManage ? 6 : 5} class="py-12 text-center">
				<p class="font-semibold">No programs found</p>
				<p class="mt-1 text-sm text-base-content/50">
					{data.search || Object.keys(data.filters).length > 0
						? 'Try another search or filter.'
						: data.canManage
							? `Add your first program to get started.`
							: 'No records have been added yet.'}
				</p>
			</td>
		</tr>
	{/each}
</CatalogPage>

{#if data.canManage}
	<ProgramDialog bind:this={programDialog} curricula={data.curricula} bind:busy />
{/if}
