<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Search } from '@lucide/svelte';
	import { onDestroy, untrack, type Snippet } from 'svelte';

	let {
		search,
		status,
		placeholder,
		searchLabel,
		filterLabel = 'Status filter',
		statusOptions,
		children
	}: {
		search: string;
		status: string;
		placeholder: string;
		searchLabel: string;
		filterLabel?: string;
		statusOptions: { value: string; label: string }[];
		children: Snippet;
	} = $props();

	let query = $state(untrack(() => search));
	let selectedStatus = $state(untrack(() => status));
	let error = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let inFlight: string | undefined;
	let composing = false;

	function cancelPending() {
		clearTimeout(timer);
		timer = undefined;
	}

	// Sync browser navigation without overwriting edits made during a slow search.
	$effect(() => {
		const current = { search, status, href: page.url.href };
		untrack(() => {
			if (!timer && !inFlight) {
				query = current.search;
				selectedStatus = current.status;
			}
		});
	});

	beforeNavigate(({ to }) => {
		if (to?.url.href !== inFlight) {
			cancelPending();
			inFlight = undefined;
		}
	});
	onDestroy(() => {
		cancelPending();
		inFlight = undefined;
	});

	async function apply() {
		cancelPending();
		if (composing) return;
		const trimmed = query.trim();
		if (!inFlight && trimmed === search && selectedStatus === status) return;
		const url = new URL(page.url.href);
		if (trimmed) url.searchParams.set('q', trimmed);
		else url.searchParams.delete('q');
		if (selectedStatus !== 'all') url.searchParams.set('status', selectedStatus);
		else url.searchParams.delete('status');
		url.searchParams.delete('page');
		if (inFlight === url.href) return;
		inFlight = url.href;
		error = '';
		try {
			await goto(url, { reset: false, replace: true });
		} catch {
			if (inFlight === url.href) error = 'Could not update results. Press Enter to retry.';
		} finally {
			if (inFlight === url.href) inFlight = undefined;
		}
	}

	function schedule() {
		cancelPending();
		error = '';
		if (!composing) timer = setTimeout(() => void apply(), 400);
	}
</script>

<form
	method="GET"
	class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
	onsubmit={(event) => {
		event.preventDefault();
		void apply();
	}}
>
	<label class="input-bordered input flex w-full min-w-0 items-center gap-3 bg-base-200 lg:flex-1">
		<Search class="size-4 shrink-0 text-base-content/50" aria-hidden="true" />
		<input
			name="q"
			type="search"
			bind:value={query}
			{placeholder}
			aria-label={searchLabel}
			class="min-w-0 grow text-sm"
			oninput={schedule}
			oncompositionstart={() => {
				composing = true;
				cancelPending();
			}}
			oncompositionend={() => {
				composing = false;
				schedule();
			}}
		/>
	</label>
	<div class="flex flex-wrap items-center gap-2 lg:shrink-0">
		<select
			name="status"
			bind:value={selectedStatus}
			aria-label={filterLabel}
			class="select-bordered select w-auto bg-base-200 select-sm"
			onchange={schedule}
		>
			{#each statusOptions as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
		{@render children()}
	</div>
</form>
{#if error}<p role="alert" class="mt-2 text-sm text-error">{error}</p>{/if}
