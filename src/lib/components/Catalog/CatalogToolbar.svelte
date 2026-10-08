<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Search } from '@lucide/svelte';
	import { onDestroy, untrack, type Snippet } from 'svelte';
	import Filter from '../Filter/Filter.svelte';
	import {
		filterFields,
		filterKeys,
		parseFieldFilter,
		type FilterSchema,
		type FilterValues
	} from '../Filter/fields.js';

	let {
		search,
		status = 'all',
		placeholder,
		searchLabel,
		filterLabel = 'Status filter',
		statusOptions,
		filterSchema,
		filters = {},
		children
	}: {
		search: string;
		status?: string;
		placeholder: string;
		searchLabel: string;
		filterLabel?: string;
		statusOptions?: { value: string; label: string }[];
		filterSchema?: FilterSchema;
		filters?: FilterValues;
		children: Snippet;
	} = $props();

	let query = $state(untrack(() => search));
	let selectedStatus = $state(untrack(() => status));
	let selectedFilters = $state<FilterValues>(untrack(() => ({ ...filters })));
	const fields = $derived(filterSchema ? filterFields(filterSchema) : []);
	const keys = $derived(fields.flatMap(filterKeys));
	let error = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let inFlight: string | undefined;
	let composing = false;
	const id = $props.id();

	function cancelPending() {
		clearTimeout(timer);
		timer = undefined;
	}

	// Sync browser navigation without overwriting edits made during a slow search.
	$effect(() => {
		const current = { search, status, filters, href: page.url.href };
		untrack(() => {
			if (!timer && !inFlight) {
				query = current.search;
				selectedStatus = current.status;
				selectedFilters = { ...current.filters };
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
		for (const field of fields) {
			const result = filterSchema
				? parseFieldFilter(filterSchema, field, selectedFilters)
				: undefined;
			if (result && !result.success) {
				error = result.error;
				return;
			}
		}
		if (
			!inFlight &&
			trimmed === search &&
			(!statusOptions || selectedStatus === status) &&
			keys.every((key) => (selectedFilters[key]?.trim() ?? '') === (filters[key] ?? ''))
		)
			return;
		const url = new URL(page.url.href);
		if (trimmed) url.searchParams.set('q', trimmed);
		else url.searchParams.delete('q');
		if (statusOptions && selectedStatus !== 'all') url.searchParams.set('status', selectedStatus);
		else url.searchParams.delete('status');
		for (const { key, type } of fields) {
			if (type === 'number' || type === 'date') url.searchParams.delete(`filter.${key}`);
		}
		for (const key of keys) {
			const value = selectedFilters[key]?.trim();
			if (value) url.searchParams.set(`filter.${key}`, value);
			else url.searchParams.delete(`filter.${key}`);
		}
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
			onkeydown={(event) => {
				if (event.key === 'Enter' && !event.isComposing) {
					event.preventDefault();
					void apply();
				}
			}}
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
		<Filter
			schema={filterSchema}
			bind:values={selectedFilters}
			onchange={schedule}
			extraCount={statusOptions && selectedStatus !== 'all' ? 1 : 0}
			onclear={() => {
				selectedFilters = {};
				selectedStatus = 'all';
				schedule();
			}}
		>
			{#if statusOptions}
				<div
					class={`min-w-0 space-y-2 rounded-xl border p-3.5 transition-colors ${selectedStatus !== 'all' ? 'border-primary/25 bg-primary/5' : 'border-base-300/80 bg-base-200/30'}`}
				>
					<label for={`status-${id}`} class="block text-xs font-semibold">{filterLabel}</label>
					<select
						id={`status-${id}`}
						name="status"
						bind:value={selectedStatus}
						aria-label={filterLabel}
						class="select h-10 w-full rounded-lg border-base-300 bg-base-100 text-sm shadow-none focus:border-primary/50 focus:outline-primary/15"
						onchange={schedule}
					>
						{#each statusOptions as option (option.value)}<option value={option.value}
								>{option.label}</option
							>{/each}
					</select>
				</div>
			{/if}
		</Filter>
		{@render children()}
	</div>
</form>
{#if error}<p role="alert" class="mt-2 text-sm text-error">{error}</p>{/if}
