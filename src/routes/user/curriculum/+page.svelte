<script lang="ts">
	import { getErrorMessage } from '#lib/errors.js';
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
	import {
		Archive,
		ArchiveRestore,
		CircleCheck,
		CircleMinus,
		BookOpen,
		Eye,
		Layers,
		Pencil,
		Plus,
		Ellipsis,
		Trash2
	} from '@lucide/svelte';
	import { confirmCurriculumActivation, confirmCurriculumStateChange } from './activation.js';
	import type { PageProps } from './$types';
	import CurriculumDetails from './CurriculumDetails.svelte';
	let { data }: PageProps = $props();
	let busy = $state(false);
	async function changeState(
		record: (typeof data.records)[number],
		action: 'archive' | 'restore' | 'deactivate'
	) {
		if (busy || !data.canManage) return;
		busy = true;
		try {
			await confirmCurriculumStateChange(record, action);
		} catch (cause) {
			showError(getErrorMessage(cause, 'Failed to change curriculum state'));
		} finally {
			busy = false;
		}
	}
	async function activate(record: (typeof data.records)[number]) {
		if (busy || !data.canManage || record.status === 'active') return;
		busy = true;
		try {
			await confirmCurriculumActivation(record);
		} catch (cause) {
			showError(getErrorMessage(cause, 'Failed to activate curriculum'));
		} finally {
			busy = false;
		}
	}

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
			showError(getErrorMessage(cause, 'Failed to delete curriculum'));
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	{#if !data.studentCurriculum}
		<title>Curriculum | BPC Enrollment System</title>
	{/if}
</svelte:head>
{#if data.isStudent}
	{#if data.studentCurriculum}
		<CurriculumDetails data={{ ...data.studentCurriculum, canManage: false, isStudent: true }} />
	{:else}
		<section
			class="portal-panel mx-auto max-w-3xl overflow-hidden"
			aria-labelledby="student-curriculum-title"
		>
			<div class="h-1 bg-primary" aria-hidden="true"></div>
			<div class="p-8 text-center sm:p-12">
				<div
					class="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary"
				>
					<BookOpen class="size-8" aria-hidden="true" />
				</div>
				<h1 id="student-curriculum-title" class="text-2xl font-bold tracking-tight">
					No curriculum assigned
				</h1>
				<p class="mx-auto mt-3 max-w-md text-sm leading-relaxed text-base-content/60">
					Your curriculum will appear here once you have a current enrollment. Contact the
					Registrar's Office if you need help with your enrollment.
				</p>
				<a href={resolve('/user/enrollment')} class="btn mt-6 btn-primary btn-sm">
					View enrollment
				</a>
			</div>
		</section>
	{/if}
{:else}
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
				filterLabel="Curriculum status"
				statusOptions={[
					{ value: 'all', label: 'All statuses' },
					{ value: 'draft', label: 'Draft' },
					{ value: 'active', label: 'Active' },
					{ value: 'inactive', label: 'Inactive' },
					{ value: 'archived', label: 'Archived' }
				]}
			>
				{#if data.canManage}
					<a class="btn gap-2 btn-primary btn-sm" href={resolve('/user/curriculum/new')}>
						<Plus class="size-4" aria-hidden="true" />New Curriculum
					</a>
				{/if}
			</CatalogToolbar>
		{/snippet}
		{#snippet header()}
			<tr
				class="border-b border-base-300 bg-base-200 text-[11px] font-extrabold tracking-wider text-base-content/60 uppercase"
			>
				<th class="py-4 pl-5">Curriculum</th>
				<th>Program</th>
				<th>Subjects</th>
				<th>Units</th>
				<th>Status</th>
				<th class="pr-5 text-right">Actions</th>
			</tr>
		{/snippet}
		{#each data.records as row (row.id)}
			<tr class="border-b border-base-200 transition-colors last:border-0 hover:bg-base-200/80">
				<td class="py-4 pl-5">
					<div class="flex items-center gap-3">
						<div
							class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
						>
							<Layers class="size-5" aria-hidden="true" />
						</div>
						<a
							class="font-bold text-base-content hover:text-primary"
							href={resolve('/user/curriculum/[curriculumId]', { curriculumId: row.id })}
						>
							{row.name}
						</a>
					</div>
				</td>
				<td>
					<p class="text-sm font-semibold">{row.programCode}</p>
					<p class="mt-0.5 text-xs text-base-content/50">{row.programName}</p>
				</td>
				<td class="text-sm font-semibold">{row.subjectCount}</td>
				<td class="text-sm font-semibold">{row.totalUnits}</td>
				<td>
					<div class="flex flex-wrap gap-1.5">
						<span
							class={`badge border-none text-xs font-semibold ${row.status === 'active' ? 'badge-success' : row.status === 'draft' ? 'badge-warning' : 'badge-ghost'}`}
						>
							{row.status === 'active'
								? 'Active'
								: row.status === 'draft'
									? 'Draft'
									: row.status === 'inactive'
										? 'Inactive'
										: 'Archived'}
						</span>
					</div>
				</td>
				<td class="pr-5">
					<div class="flex justify-end">
						<Dropdown id={`curriculum-${row.id}`} label={`Actions for ${row.name}`} disabled={busy}>
							{#snippet trigger()}
								<Ellipsis class="size-4" aria-hidden="true" />
							{/snippet}
							<ul class="menu w-full p-0">
								<li>
									<a href={resolve('/user/curriculum/[curriculumId]', { curriculumId: row.id })}>
										<Eye class="size-4" aria-hidden="true" />View
									</a>
								</li>
								{#if data.canManage}
									{#if row.status !== 'active'}
										<li>
											<button
												type="button"
												disabled={busy || !row.subjectCount}
												onclick={() => activate(row)}
											>
												<CircleCheck class="size-4" aria-hidden="true" />Activate
											</button>
										</li>
									{/if}
									{#if row.status === 'active'}
										<li>
											<button
												type="button"
												disabled={busy}
												onclick={() => changeState(row, 'deactivate')}
											>
												<CircleMinus class="size-4" aria-hidden="true" />Deactivate
											</button>
										</li>
									{/if}
									{#if row.status === 'archived'}
										<li>
											<button
												type="button"
												disabled={busy}
												onclick={() => changeState(row, 'restore')}
											>
												<ArchiveRestore class="size-4" aria-hidden="true" />Unarchive
											</button>
										</li>
									{:else}
										<li>
											<button
												type="button"
												disabled={busy}
												onclick={() => changeState(row, 'archive')}
											>
												<Archive class="size-4" aria-hidden="true" />Archive
											</button>
										</li>
									{/if}
									{#if row.status === 'draft'}
										<li>
											<a
												href={resolve('/user/curriculum/[curriculumId]/edit', {
													curriculumId: row.id
												})}
											>
												<Pencil class="size-4" aria-hidden="true" />Edit
											</a>
										</li>
									{/if}
									<li class="text-error">
										<button
											type="button"
											disabled={busy || row.status === 'active'}
											onclick={() => remove(row)}
										>
											<Trash2 class="size-4" aria-hidden="true" />Delete
										</button>
									</li>
								{/if}
							</ul>
						</Dropdown>
					</div>
				</td>
			</tr>
		{:else}
			<tr>
				<td colspan="6" class="py-12 text-center">
					<p class="font-semibold">No curricula found</p>
					<p class="mt-1 text-sm text-base-content/50">
						{data.search || Object.keys(data.filters).length || data.status !== 'all'
							? 'Try another search or filter.'
							: 'No curricula have been added yet.'}
					</p>
				</td>
			</tr>
		{/each}
	</CatalogPage>
{/if}
