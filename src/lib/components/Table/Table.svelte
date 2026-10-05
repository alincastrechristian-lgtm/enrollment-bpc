<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Minus, Plus } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { MAX_ITEMS_PER_PAGE } from './TableValues';

	let {
		title,
		description,
		total,
		itemLabel = 'records',
		children,
		header
	}: {
		title: string;
		description?: string;
		total: number;
		itemLabel?: string;
		children: Snippet;
		header: Snippet;
	} = $props();

	const instanceId = $props.id();
	let targetPage = $state<number | undefined>();

	let currentPage = $derived.by(() => {
		const value = Number(page.url.searchParams.get('page'));

		return Number.isInteger(value) && value > 0 ? value : 1;
	});
	let totalPages = $derived(total / MAX_ITEMS_PER_PAGE);

	const pageCount = $derived(Math.max(1, Math.floor(totalPages)));
	const activePage = $derived(Math.min(pageCount, Math.max(1, Math.floor(currentPage))));
	const validTargetPage = $derived(
		targetPage !== undefined &&
			Number.isInteger(targetPage) &&
			targetPage >= 1 &&
			targetPage <= pageCount
	);

	function onChangePage(pageNumber: number) {
		if (pageNumber < 1 || pageNumber > pageCount) return;
		targetPage = undefined;

		const url = new URL(page.url.href);
		url.searchParams.set('page', String(pageNumber));

		goto(url, {
			reset: false,
			replace: true
		});
	}

	function stepPage(amount: number) {
		targetPage = Math.min(pageCount, Math.max(1, (targetPage ?? activePage) + amount));
	}

	function goToPage(event: SubmitEvent) {
		event.preventDefault();
		if (!validTargetPage || targetPage === undefined || !onChangePage) return;
		(event.currentTarget as HTMLFormElement).closest<HTMLElement>('[popover]')?.hidePopover();
		onChangePage(targetPage);
	}

	function focusPageInput(event: ToggleEvent) {
		if (event.newState !== 'open') return;
		const input = (event.currentTarget as HTMLElement).querySelector('input');
		input?.focus();
		input?.select();
	}
	const pages = $derived.by(() => {
		const visiblePages =
			pageCount <= 5
				? Array.from({ length: pageCount }, (_, index) => index + 1)
				: [...new Set([1, 2, activePage, pageCount - 1, pageCount])].sort((a, b) => a - b);

		return visiblePages.flatMap((page, index): (number | '...')[] =>
			index > 0 && page - visiblePages[index - 1] > 1 ? ['...', page] : [page]
		);
	});
</script>

<div class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-base-300 px-5 py-4">
		<div>
			<h2 class="font-bold text-base-content">{title}</h2>

			{#if description}
				<p class="mt-0.5 text-xs text-base-content/50">
					{description}
				</p>
			{/if}
		</div>

		{#if total !== undefined}
			<span class="badge badge-ghost font-semibold text-base-content/60">
				{total} records
			</span>
		{/if}
	</div>

	<!-- Table -->
	<div class="overflow-x-auto">
		<table class="table w-full">
			<thead>
				{@render header()}
			</thead>

			<tbody>
				{@render children()}
			</tbody>
		</table>
	</div>

	<!-- Footer -->
	<div
		class="flex flex-col gap-3 border-t border-base-300 bg-base-200/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
	>
		<p class="text-xs font-medium text-base-content/60">
			Showing
			<span class="font-bold text-base-content/80">1–{total ?? 0}</span>
			of
			<span class="font-bold text-base-content/80">{total ?? 0}</span>
			{itemLabel}
		</p>

		<nav class="join" aria-label="Table pagination">
			<button
				type="button"
				class="btn join-item btn-sm"
				aria-label="Previous page"
				disabled={activePage <= 1}
				onclick={() => onChangePage(activePage - 1)}>«</button
			>
			{#each pages as page, index (index)}
				{#if page === '...'}
					<button
						type="button"
						class="btn join-item btn-sm"
						aria-label="Go to page"
						popovertarget={`table-page-${instanceId}-${index}`}
						style={`anchor-name: --table-page-${instanceId}-${index}`}
						onclick={() => (targetPage = activePage)}>...</button
					>
					<div
						id={`table-page-${instanceId}-${index}`}
						popover="auto"
						style={`position-anchor: --table-page-${instanceId}-${index}; position-area: top; margin-bottom: 0.5rem`}
						class="dropdown dropdown-top w-60 rounded-box border border-base-300 bg-base-100 p-3 shadow-lg"
						ontoggle={focusPageInput}
					>
						<form class="space-y-3" onsubmit={goToPage}>
							<label for={`table-page-input-${instanceId}-${index}`} class="text-sm font-semibold">
								Go to page
							</label>
							<div class="join flex">
								<button
									type="button"
									class="btn join-item btn-sm"
									aria-label="Decrease page"
									disabled={targetPage !== undefined && targetPage <= 1}
									onclick={() => stepPage(-1)}><Minus class="size-4" aria-hidden="true" /></button
								>
								<input
									id={`table-page-input-${instanceId}-${index}`}
									type="number"
									class="input join-item min-w-0 flex-1 text-center input-sm"
									min="1"
									max={pageCount}
									step="1"
									required
									bind:value={targetPage}
								/>
								<button
									type="button"
									class="btn join-item btn-sm"
									aria-label="Increase page"
									disabled={targetPage !== undefined && targetPage >= pageCount}
									onclick={() => stepPage(1)}><Plus class="size-4" aria-hidden="true" /></button
								>
							</div>
							<button
								type="submit"
								class="btn w-full btn-primary btn-sm"
								disabled={!validTargetPage || !onChangePage}>Go</button
							>
						</form>
					</div>
				{:else}
					<button
						type="button"
						class={`btn join-item btn-sm ${page === activePage ? 'bg-primary text-primary-content hover:bg-primary/80' : ''}`}
						aria-label={`Page ${page}`}
						aria-current={page === activePage ? 'page' : undefined}
						onclick={() => onChangePage(page)}>{page}</button
					>
				{/if}
			{/each}
			<button
				type="button"
				class="btn join-item btn-sm"
				aria-label="Next page"
				disabled={activePage >= pageCount}
				onclick={() => onChangePage(activePage + 1)}>»</button
			>
		</nav>
	</div>
</div>
