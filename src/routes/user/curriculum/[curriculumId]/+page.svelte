<script lang="ts">
	import { deleteCurriculum } from '#lib/actions/curriculum.remote.js';
	import {
		showError,
		showLoading,
		showSuccess,
		showYesNo
	} from '#lib/components/Popup/Popup.svelte.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Dropdown from '#lib/components/Dropdown/Dropdown.svelte';
	import {
		Archive,
		ArchiveRestore,
		CircleCheck,
		CircleMinus,
		BookOpen,
		CalendarDays,
		Layers,
		LockKeyhole,
		Pencil,
		Settings,
		Trash2
	} from '@lucide/svelte';
	import type { PageProps } from './$types';
	import SubjectLayout, { semesterLabel } from '../SubjectLayout.svelte';
	import { confirmCurriculumActivation, confirmCurriculumStateChange } from '../activation.js';
	let { data }: PageProps = $props();
	let busy = $state(false);
	async function changeState(action: 'archive' | 'restore' | 'deactivate') {
		if (busy || !data.canManage) return;
		busy = true;
		try {
			await confirmCurriculumStateChange(data.curriculum, action);
		} catch (cause) {
			showError(cause instanceof Error ? cause.message : 'Failed to change curriculum state');
		} finally {
			busy = false;
		}
	}
	async function activate() {
		if (busy || !data.canManage || data.curriculum.status === 'active') return;
		busy = true;
		try {
			await confirmCurriculumActivation(data.curriculum);
		} catch (cause) {
			showError(cause instanceof Error ? cause.message : 'Failed to activate curriculum');
		} finally {
			busy = false;
		}
	}
	let subjectLayout = $state<'all' | 'tabbed'>('all');
	let selectedYear = $state(1);
	let selectedSemester = $state(1);
	const groups = $derived.by(() => {
		const result: {
			yearLevel: number;
			semester: number;
			entries: typeof data.entries;
			units: number;
		}[] = [];
		for (const entry of data.entries) {
			let group = result.find(
				(item) => item.yearLevel === entry.yearLevel && item.semester === entry.semester
			);
			if (!group) {
				group = { yearLevel: entry.yearLevel, semester: entry.semester, entries: [], units: 0 };
				result.push(group);
			}
			group.entries.push(entry);
			group.units += entry.units;
		}
		return result;
	});
	const visibleGroups = $derived(
		groups.filter(
			(group) =>
				subjectLayout === 'all' ||
				(group.yearLevel === selectedYear && group.semester === selectedSemester)
		)
	);
	const totalUnits = $derived(data.entries.reduce((total, entry) => total + entry.units, 0));
	const dateFormatter = new Intl.DateTimeFormat('en-PH', {
		timeZone: 'Asia/Manila',
		dateStyle: 'medium'
	});
	async function remove() {
		if (busy || !data.canManage) return;
		busy = true;
		try {
			if (
				!(await showYesNo({
					title: 'Delete curriculum?',
					message: `Delete ${data.curriculum.name} and its subject entries?`,
					warning: true,
					yesText: 'Delete',
					noText: 'Cancel'
				}))
			)
				return;
			showLoading();
			await deleteCurriculum(data.curriculum.id);
			await goto(resolve('/user/curriculum'), { refreshAll: true });
			showSuccess('Curriculum deleted successfully');
		} catch (cause) {
			showError(cause instanceof Error ? cause.message : 'Failed to delete curriculum');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{data.curriculum.name} | Curriculum</title></svelte:head>
<section class="mx-auto max-w-7xl space-y-6">
	<article class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
		<div class="h-1.5 bg-primary" aria-hidden="true"></div>
		<div class="flex flex-col justify-between gap-5 p-5 sm:p-6 lg:flex-row lg:items-center">
			<div class="flex items-center gap-4">
				<span
					class="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"
					><Layers class="size-7" aria-hidden="true" /></span
				>
				<div class="min-w-0">
					<h1 class="text-2xl font-bold tracking-tight wrap-break-word">{data.curriculum.name}</h1>
					<p class="mt-1 text-sm text-base-content/60">
						{data.curriculum.programCode} — {data.curriculum.programName}
					</p>
					<div class="mt-3 flex flex-wrap gap-2">
						<span class="badge badge-ghost text-xs">{data.curriculum.yearLevels} years</span>
						<span class="badge badge-ghost text-xs">{data.curriculum.semesters} semesters</span>
						<span
							class={`badge border-none text-xs font-semibold ${data.curriculum.status === 'active' ? 'badge-success' : data.curriculum.status === 'draft' ? 'badge-warning' : 'badge-ghost'}`}
							>{data.curriculum.status === 'active'
								? 'Active'
								: data.curriculum.status === 'draft'
									? 'Draft'
									: data.curriculum.status === 'inactive'
										? 'Inactive'
										: 'Archived'}</span
						>
					</div>
				</div>
			</div>
			{#if data.canManage}<div class="flex flex-wrap gap-2">
					{#if data.curriculum.status !== 'active'}<button
							type="button"
							disabled={busy || !data.entries.length}
							class="btn btn-primary btn-sm"
							onclick={activate}><CircleCheck class="size-4" aria-hidden="true" />Activate</button
						>{/if}
					{#if data.curriculum.status === 'draft'}<a
							href={resolve('/user/curriculum/[curriculumId]/edit', {
								curriculumId: data.curriculum.id
							})}
							class="btn gap-2 btn-primary btn-sm"
							><Pencil class="size-4" aria-hidden="true" />Edit curriculum</a
						>{/if}<button
						type="button"
						disabled={busy || data.curriculum.status === 'active'}
						class="btn gap-2 btn-ghost text-error btn-sm"
						onclick={remove}><Trash2 class="size-4" aria-hidden="true" />Delete</button
					>
					<Dropdown id="curriculum-state-actions" label="Curriculum actions" disabled={busy}>
						{#snippet trigger()}<Settings class="size-4" aria-hidden="true" />{/snippet}
						<ul class="menu w-full p-0">
							{#if data.curriculum.status === 'active'}<li>
									<button type="button" disabled={busy} onclick={() => changeState('deactivate')}
										><CircleMinus class="size-4" aria-hidden="true" />Deactivate</button
									>
								</li>{/if}
							{#if data.curriculum.status === 'archived'}<li>
									<button type="button" disabled={busy} onclick={() => changeState('restore')}
										><ArchiveRestore class="size-4" aria-hidden="true" />Unarchive</button
									>
								</li>
							{:else}<li>
									<button type="button" disabled={busy} onclick={() => changeState('archive')}
										><Archive class="size-4" aria-hidden="true" />Archive</button
									>
								</li>{/if}
						</ul>
					</Dropdown>
				</div>{/if}
		</div>
		<div class="grid grid-cols-3 divide-x divide-base-300 border-t border-base-300 bg-base-200/40">
			<div class="p-4 sm:px-6">
				<p class="text-xs text-base-content/50">Subjects</p>
				<p class="mt-1 text-xl font-bold">{data.entries.length}</p>
			</div>
			<div class="p-4 sm:px-6">
				<p class="text-xs text-base-content/50">Total units</p>
				<p class="mt-1 text-xl font-bold">{totalUnits}</p>
			</div>
			<div class="p-4 sm:px-6">
				<p class="text-xs text-base-content/50">Semester groups</p>
				<p class="mt-1 text-xl font-bold">{groups.length}</p>
			</div>
		</div>
	</article>
	{#if data.curriculum.publishedAt}<div
			class="flex items-start gap-3 rounded-xl border border-base-300 bg-base-100 p-4 text-sm text-base-content/60"
		>
			<LockKeyhole class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
			<p>
				Published on {dateFormatter.format(data.curriculum.publishedAt)}. This curriculum is
				read-only.
			</p>
		</div>{:else if data.curriculum.status === 'archived'}<div
			class="rounded-xl border border-base-300 bg-base-100 p-4 text-sm text-base-content/60"
		>
			This draft is archived. Unarchive it to edit.
		</div>{/if}
	<section
		class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm"
		aria-label="Curriculum subjects"
	>
		<SubjectLayout
			yearLevels={data.curriculum.yearLevels}
			semesters={data.curriculum.semesters}
			bind:layout={subjectLayout}
			bind:year={selectedYear}
			bind:semester={selectedSemester}
		>
			<div class="space-y-5 p-5">
				{#each visibleGroups as group (`${group.yearLevel}-${group.semester}`)}
					<article class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
						<div class="flex items-center justify-between gap-3 border-b border-base-300 p-5">
							<div class="flex items-center gap-3">
								<CalendarDays class="size-5 text-primary" aria-hidden="true" />
								<div>
									<h2 class="font-bold">
										Year {group.yearLevel} · {semesterLabel(group.semester)}
									</h2>
									<p class="mt-0.5 text-xs text-base-content/50">{group.entries.length} subjects</p>
								</div>
							</div>
							<span class="badge badge-ghost text-xs font-semibold">{group.units} units</span>
						</div>
						<div class="overflow-x-auto">
							<table class="table w-full">
								<thead
									><tr class="bg-base-200 text-xs text-base-content/55"
										><th class="py-3 pl-5">Code</th><th>Subject</th><th class="pr-5 text-right"
											>Units</th
										></tr
									></thead
								><tbody
									>{#each group.entries as entry (entry.id)}<tr
											class="border-b border-base-200 last:border-0"
											><td class="py-4 pl-5 font-mono text-xs font-semibold">{entry.subjectCode}</td
											><td class="text-sm font-semibold">{entry.subjectName}</td><td
												class="pr-5 text-right font-semibold">{entry.units}</td
											></tr
										>{/each}</tbody
								>
							</table>
						</div>
					</article>
				{:else}<div class="rounded-2xl border border-base-300 bg-base-100 py-12 text-center">
						<BookOpen class="mx-auto mb-3 size-8 text-base-content/25" aria-hidden="true" />
						<h2 class="font-semibold">
							{subjectLayout === 'tabbed'
								? 'No subjects in this term'
								: 'No subjects in this curriculum'}
						</h2>
						<p class="mt-1 text-sm text-base-content/50">
							{data.canManage && data.curriculum.status === 'draft'
								? 'Edit this draft to add subjects.'
								: 'No subjects have been added yet.'}
						</p>
					</div>{/each}
			</div>
		</SubjectLayout>
	</section>
</section>
