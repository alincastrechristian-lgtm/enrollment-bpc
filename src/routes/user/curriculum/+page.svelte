<script lang="ts">
	import { deleteCurriculum } from '#lib/actions/curriculum.remote.js';
	import CatalogPage from '#lib/components/Catalog/CatalogPage.svelte';
	import CatalogToolbar from '#lib/components/Catalog/CatalogToolbar.svelte';
	import Dropdown from '#lib/components/Dropdown/Dropdown.svelte';
	import {
		showError,
		showLoading,
		showSuccess,
		showYesNo
	} from '#lib/components/Popup/Popup.svelte.js';
	import { filterCurriculumSchema } from '#lib/schema.js';
	import { refreshAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Eye, Layers, Pencil, Plus, Settings, Trash2 } from '@lucide/svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let busy = $state(false);

	async function remove(record: (typeof data.records)[number]) {
		if (busy || !data.canManage) return;
		busy = true;
		try {
			if (
				!(await showYesNo({
					title: 'Delete curriculum?',
					message: `Delete ${record.name} and its subject entries?`,
					warning: true,
					yesText: 'Delete',
					noText: 'Cancel'
				}))
			)
				return;
			showLoading();
			await deleteCurriculum(record.id);
			await refreshAll();
			showSuccess('Curriculum deleted successfully');
		} catch (cause) {
			showError(cause instanceof Error ? cause.message : 'Failed to delete curriculum');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Curriculum | BPC Enrollment System</title></svelte:head>
<CatalogPage
	title="Curricula"
	description="Organize subjects and units for each program"
	total={data.total}
	itemLabel="curricula"
>
	{#snippet toolbar()}
		<CatalogToolbar
			search={data.search}
			status={data.status}
			filters={data.filters}
			filterSchema={filterCurriculumSchema}
			placeholder="Search by curriculum or program..."
			searchLabel="Search curricula"
			filterLabel="Publication status"
			statusOptions={[
				{ value: 'all', label: 'All statuses' },
				{ value: 'draft', label: 'Draft' },
				{ value: 'published', label: 'Published' }
			]}
		>
			{#if data.canManage}<a
					class="btn gap-2 btn-primary btn-sm"
					href={resolve('/user/curriculum/new')}
					><Plus class="size-4" aria-hidden="true" />New Curriculum</a
				>{/if}
		</CatalogToolbar>
	{/snippet}
	{#snippet header()}
		<tr
			class="border-b border-base-300 bg-base-200 text-[11px] font-extrabold tracking-wider text-base-content/60 uppercase"
		>
			<th class="py-4 pl-5">Curriculum</th><th>Program</th><th>Subjects</th><th>Units</th><th
				>Status</th
			><th class="pr-5 text-right">Actions</th>
		</tr>
	{/snippet}
	{#each data.records as row (row.id)}
		<tr class="border-b border-base-200 transition-colors last:border-0 hover:bg-base-200/80">
			<td class="py-4 pl-5"
				><div class="flex items-center gap-3">
					<div
						class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
					>
						<Layers class="size-5" aria-hidden="true" />
					</div>
					<a
						class="font-bold text-base-content hover:text-primary"
						href={resolve('/user/curriculum/[curriculumId]', { curriculumId: row.id })}
						>{row.name}</a
					>
				</div></td
			>
			<td
				><p class="text-sm font-semibold">{row.programCode}</p>
				<p class="mt-0.5 text-xs text-base-content/50">{row.programName}</p></td
			>
			<td class="text-sm font-semibold">{row.subjectCount}</td><td class="text-sm font-semibold"
				>{row.totalUnits}</td
			>
			<td
				><div class="flex flex-wrap gap-1.5">
					<span
						class={`badge border-none text-xs font-semibold ${row.publishedAt ? 'badge-success' : 'badge-warning'}`}
						>{row.publishedAt ? 'Published' : 'Draft'}</span
					>{#if !row.isActive}<span class="badge badge-ghost text-xs">Inactive</span>{/if}
				</div></td
			>
			<td class="pr-5"
				><div class="flex justify-end">
					<Dropdown id={`curriculum-${row.id}`} label={`Actions for ${row.name}`} disabled={busy}>
						{#snippet trigger()}<Settings class="size-4" aria-hidden="true" />{/snippet}
						<ul class="menu w-full p-0">
							<li>
								<a href={resolve('/user/curriculum/[curriculumId]', { curriculumId: row.id })}
									><Eye class="size-4" aria-hidden="true" />View</a
								>
							</li>
							{#if data.canManage}
								{#if !row.publishedAt}<li>
										<a
											href={resolve('/user/curriculum/[curriculumId]/edit', {
												curriculumId: row.id
											})}><Pencil class="size-4" aria-hidden="true" />Edit</a
										>
									</li>{/if}
								<li class="text-error">
									<button type="button" disabled={busy} onclick={() => remove(row)}
										><Trash2 class="size-4" aria-hidden="true" />Delete</button
									>
								</li>
							{/if}
						</ul>
					</Dropdown>
				</div></td
			>
		</tr>
	{:else}
		<tr
			><td colspan="6" class="py-12 text-center"
				><p class="font-semibold">No curricula found</p>
				<p class="mt-1 text-sm text-base-content/50">
					{data.search || Object.keys(data.filters).length || data.status !== 'all'
						? 'Try another search or filter.'
						: 'No curricula have been added yet.'}
				</p></td
			></tr
		>
	{/each}
</CatalogPage>
