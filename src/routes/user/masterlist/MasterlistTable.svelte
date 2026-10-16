<script lang="ts">
	import { resolve } from '$app/paths';
	import Table from '#lib/components/Table/Table.svelte';
	import { getErrorMessage } from '#lib/errors.js';
	import { ArrowUpRight } from '@lucide/svelte';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let students = $state(untrack(() => data.students));
	let total = $state(untrack(() => data.total));
	let nextPage = $state(untrack(() => data.nextPage));
	let loading = $state(false);
	let loadError = $state('');
	let sentinel: HTMLDivElement;
	const controller = new AbortController();

	async function loadMore() {
		if (loading || nextPage === null) return;
		loading = true;
		loadError = '';
		const url = new SvelteURL(resolve('/user/masterlist/rows'), window.location.origin);
		// Pin even the default term so later batches cannot drift into a newer term.
		for (const [key, value] of Object.entries(data.filters)) {
			if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
		}
		url.searchParams.set('page', String(nextPage));
		try {
			const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
			if (!response.ok) {
				loadError =
					response.status === 401
						? 'Your session expired. Sign in again to continue.'
						: response.status === 403
							? 'You no longer have permission to view the masterlist.'
							: 'Could not load more students. Please try again.';
				return;
			}
			const result: Pick<PageData, 'students' | 'total' | 'nextPage'> = await response.json();
			if (controller.signal.aborted) return;
			const existing = new Set(students.map((student) => student.enrollmentId));
			students = [
				...students,
				...result.students.filter((student) => !existing.has(student.enrollmentId))
			];
			total = Math.max(result.total, students.length);
			nextPage = result.nextPage;
		} catch (cause) {
			if (!controller.signal.aborted)
				loadError = getErrorMessage(cause, 'Could not load more students. Please try again.');
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (typeof IntersectionObserver === 'undefined') return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (!loadError && entries.some((entry) => entry.isIntersecting)) void loadMore();
			},
			{ rootMargin: '400px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});
	onDestroy(() => controller.abort());
</script>

{#snippet lazyFooter()}
	<div bind:this={sentinel} class="flex w-full flex-col gap-3" aria-busy={loading}>
		<div class="flex flex-wrap items-center justify-between gap-3">
			<p class="text-xs font-medium text-base-content/60" role="status" aria-live="polite">
				Showing <span class="font-bold text-base-content/80">
					{students.length ? 1 : 0}&ndash;{students.length}
				</span>
				of
				<span class="font-bold text-base-content/80">{total}</span>
				students
			</p>
			{#if nextPage !== null}
				<button
					type="button"
					class="btn gap-2 btn-outline btn-sm"
					disabled={loading}
					onclick={() => void loadMore()}
				>
					{#if loading}
						<span class="loading loading-xs loading-spinner" aria-hidden="true"></span>
					{/if}
					{loading ? 'Loading students...' : loadError ? 'Retry' : 'Load more'}
				</button>
			{:else if total > 0}
				<p class="text-xs text-base-content/50">All matching students loaded</p>
			{/if}
		</div>
		{#if loadError}
			<p role="alert" class="text-sm text-error">{loadError}</p>
		{/if}
	</div>
{/snippet}

<Table title="Student masterlist" {total} itemLabel="students" footer={lazyFooter}>
	{#snippet header()}
		<tr
			class="border-b border-base-300 bg-base-200 text-[11px] font-extrabold tracking-wider text-base-content/60 uppercase"
		>
			<th class="py-4 pl-5">Student</th>
			<th>Student number</th>
			<th>Program</th>
			<th>Year level</th>
			<th>Section</th>
			<th>Status</th>
			<th class="pr-5 text-right">Enrollment</th>
		</tr>
	{/snippet}
	{#each students as student (student.enrollmentId)}
		<tr class="border-b border-base-200 transition-colors last:border-0 hover:bg-base-200/80">
			<td class="py-4 pl-5">
				<a
					href={resolve('/user/students/[userId]', { userId: student.userId })}
					class="font-semibold hover:text-primary hover:underline"
				>
					{student.name}
				</a>
				<p class="mt-1 text-xs text-base-content/50">{student.email}</p>
			</td>
			<td class="font-mono text-xs">{student.studentId}</td>
			<td class="min-w-48">
				<p class="font-semibold">{student.programCode}</p>
				<p class="mt-1 text-xs text-base-content/50">{student.programName}</p>
			</td>
			<td>Year {student.yearLevel}</td>
			<td>{student.section}</td>
			<td>
				<span
					class={`badge badge-sm ${student.status === 'completed' ? 'badge-success' : 'badge-soft badge-primary'}`}
				>
					{student.status === 'completed' ? 'Completed' : 'Enrolled'}
				</span>
			</td>
			<td class="pr-5 text-right">
				<a
					href={resolve('/user/students/[userId]/enrollments/[enrollmentId]', {
						userId: student.userId,
						enrollmentId: student.enrollmentId
					})}
					class="btn gap-1.5 btn-ghost btn-sm"
					aria-label={`View enrollment for ${student.name}`}
				>
					View<ArrowUpRight class="size-4" aria-hidden="true" />
				</a>
			</td>
		</tr>
	{/each}
</Table>
