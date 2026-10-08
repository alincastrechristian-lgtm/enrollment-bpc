<script lang="ts">
	import {
		CalendarDays,
		ChevronDown,
		Hash,
		ListFilter,
		RotateCcw,
		SlidersHorizontal,
		TextSearch,
		X
	} from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { filterFields, filterKeys, type FilterSchema, type FilterValues } from './fields.js';

	let {
		schema,
		values = $bindable(),
		onchange,
		onclear,
		children,
		extraCount = 0
	}: {
		schema?: FilterSchema;
		values: FilterValues;
		onchange: () => void;
		onclear: () => void;
		children?: Snippet;
		extraCount?: number;
	} = $props();
	const id = $props.id();
	const fields = $derived(schema ? filterFields(schema) : []);
	const count = $derived(
		fields.filter((field) => filterKeys(field).some((key) => values[key]?.trim())).length +
			extraCount
	);

	const groups = $derived(
		[
			{
				label: 'Details',
				icon: TextSearch,
				fields: fields.filter((field) => field.type === 'text' || field.type === 'enum')
			},
			{
				label: 'Ranges',
				icon: CalendarDays,
				fields: fields.filter((field) => field.type === 'date' || field.type === 'number')
			},
			{
				label: 'Options',
				icon: ListFilter,
				fields: fields.filter((field) => field.type === 'boolean')
			}
		].filter((group) => group.fields.length || (group.label === 'Details' && children))
	);

	function change(key: string, value: string) {
		values = { ...values, [key]: value };
		onchange();
	}
</script>

<button
	type="button"
	class={`btn gap-2 rounded-xl border btn-sm ${count ? 'border-primary/25 bg-primary/10 text-primary hover:bg-primary/15' : 'border-base-300 bg-base-100 text-base-content/70 hover:bg-base-200'}`}
	popovertarget={`filters-${id}`}
	style={`anchor-name: --filters-${id}`}
>
	<SlidersHorizontal class="size-4" aria-hidden="true" />Filters
	{#if count}<span
			class="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-content"
			>{count}</span
		>{/if}
	<ChevronDown class="size-3.5 opacity-60" aria-hidden="true" />
</button>
<div
	id={`filters-${id}`}
	popover="auto"
	role="dialog"
	aria-labelledby={`filters-title-${id}`}
	style={`position-anchor: --filters-${id}`}
	class="filter-panel w-[min(38rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-base-300 bg-base-100 text-base-content shadow-2xl"
>
	<div class="flex items-start gap-3 border-b border-base-300 bg-base-200/40 px-5 py-4">
		<div
			class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/10 text-primary"
		>
			<SlidersHorizontal class="size-5" aria-hidden="true" />
		</div>
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-2">
				<h3 id={`filters-title-${id}`} class="text-sm font-bold">Filter records</h3>
				{#if count}<span
						class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
						>{count} selected</span
					>{/if}
			</div>
			<p class="mt-1 text-xs text-base-content/55">Results match all selected filters.</p>
		</div>
		<button
			type="button"
			class="btn btn-square shrink-0 rounded-lg btn-ghost text-base-content/50 btn-sm"
			aria-label="Close filters"
			popovertarget={`filters-${id}`}
			popovertargetaction="hide"><X class="size-4" aria-hidden="true" /></button
		>
	</div>
	<div class="max-h-[55dvh] space-y-5 overflow-y-auto overscroll-contain p-5">
		{#each groups as group (group.label)}
			<section class="space-y-3" aria-labelledby={`filter-group-${id}-${group.label}`}>
				<div class="flex items-center gap-2 text-base-content/50">
					<group.icon class="size-3.5" aria-hidden="true" />
					<h4
						id={`filter-group-${id}-${group.label}`}
						class="text-[10px] font-bold tracking-widest uppercase"
					>
						{group.label}
					</h4>
					<div class="h-px flex-1 bg-base-300/70"></div>
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{#if group.label === 'Details' && children}{@render children()}{/if}
					{#each group.fields as field (field.key)}
						{@const active = filterKeys(field).some((key) => values[key]?.trim())}
						{#if field.type === 'number' || field.type === 'date'}
							<fieldset
								class={`min-w-0 rounded-xl border p-3.5 transition-colors sm:col-span-2 ${active ? 'border-primary/25 bg-primary/5' : 'border-base-300/80 bg-base-200/30'}`}
							>
								<legend class="flex items-center gap-2 px-1 text-xs font-semibold">
									{#if field.type === 'date'}<CalendarDays
											class="size-3.5 text-base-content/45"
											aria-hidden="true"
										/>{:else}<Hash class="size-3.5 text-base-content/45" aria-hidden="true" />{/if}
									{field.label}
								</legend>
								<div class="grid grid-cols-2 gap-3">
									{#each ['min', 'max'] as bound (bound)}
										{@const key = `${field.key}.${bound}`}
										{@const label =
											field.type === 'date'
												? bound === 'min'
													? 'Start date'
													: 'End date'
												: bound === 'min'
													? 'Minimum'
													: 'Maximum'}
										<div class="min-w-0 space-y-1.5">
											<label
												for={`filter-${id}-${key}`}
												class="block text-[11px] text-base-content/55">{label}</label
											>
											<input
												id={`filter-${id}-${key}`}
												name={`filter.${key}`}
												type={field.type}
												aria-label={`${field.label} ${label.toLowerCase()}`}
												class="input h-10 w-full min-w-0 rounded-lg border-base-300 bg-base-100 text-sm shadow-none focus:border-primary/50 focus:outline-primary/15"
												value={values[key] ?? ''}
												min={field.min}
												max={field.max}
												step={field.step}
												placeholder={field.type === 'number' ? 'No limit' : undefined}
												oninput={(event) => change(key, event.currentTarget.value)}
											/>
										</div>
									{/each}
								</div>
							</fieldset>
						{:else}
							<div
								class={`min-w-0 space-y-2 rounded-xl border p-3.5 transition-colors ${active ? 'border-primary/25 bg-primary/5' : 'border-base-300/80 bg-base-200/30'}`}
							>
								<label
									for={`filter-${id}-${field.key}`}
									class="flex items-center justify-between gap-2 text-xs font-semibold"
								>
									{field.label}{#if active}<span
											class="size-1.5 shrink-0 rounded-full bg-primary"
											aria-hidden="true"
										></span>{/if}
								</label>
								{#if field.type === 'boolean' || field.type === 'enum'}
									<select
										id={`filter-${id}-${field.key}`}
										name={`filter.${field.key}`}
										class="select h-10 w-full rounded-lg border-base-300 bg-base-100 text-sm shadow-none focus:border-primary/50 focus:outline-primary/15"
										value={values[field.key] ?? ''}
										onchange={(event) => change(field.key, event.currentTarget.value)}
									>
										<option value="">Any</option>
										{#if field.type === 'boolean'}<option value="true">Yes</option><option
												value="false">No</option
											>
										{:else}{#each field.options ?? [] as option (option)}<option value={option}
													>{option}</option
												>{/each}{/if}
									</select>
								{:else}
									<input
										id={`filter-${id}-${field.key}`}
										name={`filter.${field.key}`}
										type={field.type}
										class="input h-10 w-full rounded-lg border-base-300 bg-base-100 text-sm shadow-none focus:border-primary/50 focus:outline-primary/15"
										value={values[field.key] ?? ''}
										placeholder="Contains..."
										oninput={(event) => change(field.key, event.currentTarget.value)}
									/>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			</section>
		{/each}
	</div>
	<div
		class="flex items-center justify-between gap-3 border-t border-base-300 bg-base-200/40 px-5 py-3"
	>
		<button
			type="button"
			class="btn gap-2 rounded-lg btn-ghost text-base-content/60 btn-sm"
			disabled={!count}
			onclick={onclear}
		>
			<RotateCcw class="size-3.5" aria-hidden="true" />Clear filters
		</button>
		<div class="flex items-center gap-3">
			<span class="hidden text-[11px] text-base-content/50 sm:inline"
				>Changes apply automatically</span
			>
			<button
				type="button"
				class="btn rounded-lg btn-primary btn-sm"
				popovertarget={`filters-${id}`}
				popovertargetaction="hide">Done</button
			>
		</div>
	</div>
</div>

<style>
	.filter-panel {
		position-area: bottom span-left;
		position-try-fallbacks: flip-block, flip-inline;
		margin: 0.65rem 0 0;
	}
	.filter-panel:popover-open {
		animation: filter-enter 160ms ease-out;
	}
	@keyframes filter-enter {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	@media (max-width: 639px) {
		.filter-panel {
			position: fixed;
			position-anchor: auto !important;
			position-area: none;
			inset: auto 1rem 1rem;
			width: auto;
			margin: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.filter-panel:popover-open {
			animation: none;
		}
	}
</style>
