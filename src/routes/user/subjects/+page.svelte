<script lang="ts">
	import { deleteSubject } from '#lib/actions/subject.remote.js';
	import CatalogPage from '#lib/components/Catalog/CatalogPage.svelte';
	import CatalogToolbar from '#lib/components/Catalog/CatalogToolbar.svelte';
	import Dropdown from '#lib/components/Dropdown/Dropdown.svelte';
	import {
		showError,
		showLoading,
		showSuccess,
		showYesNo
	} from '#lib/components/Popup/Popup.svelte.js';
	import { filterSubjectSchema, type Subject } from '#lib/schema.js';
	import { refreshAll } from '$app/navigation';

	import { BookOpen, Pencil, Plus, Settings, Trash2 } from '@lucide/svelte';
	import type { PageProps } from './$types';
	import SubjectDialog from './SubjectDialog.svelte';

	let { data }: PageProps = $props();
	const subjects = $derived(data.records);
	let subjectDialog = $state<SubjectDialog>();
	let busy = $state(false);

	function open(subject: Subject | null = null) {
		if (busy || !data.canManage) return;
		subjectDialog?.open(subject);
	}

	async function remove(subject: Subject) {
		if (busy || !data.canManage) return;
		busy = true;
		try {
			const confirmed = await showYesNo({
				title: 'Delete subject?',
				message: `Delete ${subject.name} (${subject.code})?`,
				warning: true,
				yesText: 'Delete',
				noText: 'Cancel'
			});
			if (!confirmed) return;
			showLoading();
			await deleteSubject(subject.id);
			await refreshAll();
			showSuccess('Subject deleted successfully');
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Failed to delete subject');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Subjects | BPC Enrollment System</title></svelte:head>

<CatalogPage
	title="Subjects"
	description={data.canManage
		? 'Manage subject records and availability'
		: 'View subject records and availability'}
	total={data.total}
	itemLabel="subjects"
>
	{#snippet toolbar()}
		<CatalogToolbar
			search={data.search}
			filters={data.filters}
			placeholder="Search by subject name or code..."
			searchLabel="Search subjects"
			filterSchema={filterSubjectSchema}
		>
			{#if data.canManage}
				<button
					type="button"
					disabled={busy}
					onclick={() => open()}
					class="btn gap-2 btn-primary btn-sm"
				>
					<Plus class="size-4" aria-hidden="true" />
					New Subject
				</button>
			{/if}
		</CatalogToolbar>
	{/snippet}
	{#snippet header()}
		<tr
			class="border-b border-base-300 bg-base-200 text-[11px] font-extrabold tracking-wider text-base-content/60 uppercase"
		>
			<th class="py-4 pl-5">Subject</th>
			<th>Code</th>
			<th>Description</th>
			<th class={data.canManage ? '' : 'pr-5'}>Status</th>
			{#if data.canManage}
				<th class="pr-5 text-right">Actions</th>
			{/if}
		</tr>
	{/snippet}
	{#each subjects as subject (subject.id)}
		<tr class="border-b border-base-200 transition-colors last:border-0 hover:bg-base-200/80">
			<!-- Subject -->
			<td class="py-4 pl-5">
				<div class="flex items-center gap-3">
					<div
						class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
					>
						<BookOpen class="size-5" aria-hidden="true" />
					</div>
					<p class="font-bold text-base-content">{subject.name}</p>
				</div>
			</td>

			<!-- Code -->
			<td class="font-mono text-xs font-semibold text-base-content/70">{subject.code}</td>

			<!-- Description -->
			<td class="max-w-sm text-sm text-base-content/60">
				<p class="line-clamp-2 wrap-break-word whitespace-pre-line">
					{subject.description || 'No description'}
				</p>
			</td>

			<!-- Status -->
			<td>
				<span
					class={`badge gap-1.5 border-none px-3 text-xs font-semibold ${subject.isActive ? 'badge-success' : 'badge-ghost'}`}
				>
					<span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
					{subject.isActive ? 'Active' : 'Inactive'}
				</span>
			</td>

			<!-- Actions -->
			{#if data.canManage}
				<td class="pr-5">
					<div class="flex justify-end">
						<Dropdown
							id={`subject-${subject.id}`}
							label={`Actions for ${subject.name}`}
							disabled={busy}
						>
							{#snippet trigger()}
								<Settings class="size-4" aria-hidden="true" />
							{/snippet}
							<ul class="menu w-full p-0">
								<li>
									<button type="button" disabled={busy} onclick={() => open(subject)}>
										<Pencil class="size-4" aria-hidden="true" />Edit
									</button>
								</li>
								<li class="text-error">
									<button type="button" disabled={busy} onclick={() => remove(subject)}>
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
			<td colspan={data.canManage ? 5 : 4} class="py-12 text-center">
				<p class="font-semibold">No subjects found</p>
				<p class="mt-1 text-sm text-base-content/50">
					{data.search || Object.keys(data.filters).length > 0
						? 'Try another search or filter.'
						: data.canManage
							? `Add your first subject to get started.`
							: 'No records have been added yet.'}
				</p>
			</td>
		</tr>
	{/each}
</CatalogPage>

{#if data.canManage}
	<SubjectDialog bind:this={subjectDialog} bind:busy />
{/if}
