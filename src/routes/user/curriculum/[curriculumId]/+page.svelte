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
	import { BookOpen, CalendarDays, Layers, LockKeyhole, Pencil, Trash2 } from '@lucide/svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let busy = $state(false);
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
						<span
							class={`badge border-none text-xs font-semibold ${data.curriculum.publishedAt ? 'badge-success' : 'badge-warning'}`}
							>{data.curriculum.publishedAt ? 'Published' : 'Draft'}</span
						>{#if !data.curriculum.isActive}<span class="badge badge-ghost text-xs">Inactive</span
							>{/if}
					</div>
				</div>
			</div>
			{#if data.canManage}<div class="flex flex-wrap gap-2">
					{#if !data.curriculum.publishedAt}<a
							href={resolve('/user/curriculum/[curriculumId]/edit', {
								curriculumId: data.curriculum.id
							})}
							class="btn gap-2 btn-primary btn-sm"
							><Pencil class="size-4" aria-hidden="true" />Edit curriculum</a
						>{/if}<button
						type="button"
						disabled={busy}
						class="btn gap-2 btn-ghost text-error btn-sm"
						onclick={remove}><Trash2 class="size-4" aria-hidden="true" />Delete</button
					>
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
		</div>{/if}
	{#each groups as group (`${group.yearLevel}-${group.semester}`)}
		<article class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
			<div class="flex items-center justify-between gap-3 border-b border-base-300 p-5">
				<div class="flex items-center gap-3">
					<CalendarDays class="size-5 text-primary" aria-hidden="true" />
					<div>
						<h2 class="font-bold">
							Year {group.yearLevel} · {group.semester === 3
								? 'Summer'
								: `Semester ${group.semester}`}
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
							><th class="py-3 pl-5">Code</th><th>Subject</th><th class="pr-5 text-right">Units</th
							></tr
						></thead
					><tbody
						>{#each group.entries as entry (entry.id)}<tr
								class="border-b border-base-200 last:border-0"
								><td class="py-4 pl-5 font-mono text-xs font-semibold">{entry.subjectCode}</td><td
									class="text-sm font-semibold">{entry.subjectName}</td
								><td class="pr-5 text-right font-semibold">{entry.units}</td></tr
							>{/each}</tbody
					>
				</table>
			</div>
		</article>
	{:else}<div class="rounded-2xl border border-base-300 bg-base-100 py-12 text-center">
			<BookOpen class="mx-auto mb-3 size-8 text-base-content/25" aria-hidden="true" />
			<h2 class="font-semibold">No subjects in this curriculum</h2>
			<p class="mt-1 text-sm text-base-content/50">
				{data.canManage && !data.curriculum.publishedAt
					? 'Edit this draft to add subjects.'
					: 'No subjects have been added yet.'}
			</p>
		</div>{/each}
</section>
