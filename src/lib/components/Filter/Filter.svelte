<script lang="ts">
	import { SlidersHorizontal, X } from '@lucide/svelte';
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

	function change(key: string, value: string) {
		values = { ...values, [key]: value };
		onchange();
	}
</script>

<button
	type="button"
	class="btn gap-2 border-base-300 bg-base-100 btn-outline btn-sm"
	popovertarget={`filters-${id}`}
	style={`anchor-name: --filters-${id}`}
>
	<SlidersHorizontal class="size-4" aria-hidden="true" />Filters
	{#if count}<span class="badge badge-sm badge-primary">{count}</span>{/if}
</button>
<div
	id={`filters-${id}`}
	popover="auto"
	style={`position-anchor: --filters-${id}; position-area: bottom span-left; margin-top: 0.5rem`}
	class="w-[min(36rem,calc(100vw-2rem))] rounded-2xl border border-base-300 bg-base-100 p-4 shadow-xl sm:p-5"
>
	<div class="mb-4 flex items-start justify-between gap-4">
		<div>
			<h3 class="font-semibold">Filter records</h3>
			<p class="mt-1 text-xs text-base-content/60">Results match all selected filters.</p>
		</div>
		<button
			type="button"
			class="btn btn-circle btn-ghost btn-sm"
			aria-label="Close filters"
			popovertarget={`filters-${id}`}
			popovertargetaction="hide"><X class="size-4" aria-hidden="true" /></button
		>
	</div>
	<div class="grid max-h-[60dvh] grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2">
		{#if children}{@render children()}{/if}
		{#each fields as field (field.key)}
			{#if field.type === 'number' || field.type === 'date'}
				<fieldset class="space-y-1.5 sm:col-span-2">
					<legend class="text-xs font-semibold">{field.label}</legend>
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
							<div class="min-w-0 space-y-1">
								<label for={`filter-${id}-${key}`} class="block text-xs text-base-content/60"
									>{label}</label
								>
								<input
									id={`filter-${id}-${key}`}
									name={`filter.${key}`}
									type={field.type}
									aria-label={`${field.label} ${label.toLowerCase()}`}
									class="input-bordered input w-full min-w-0 bg-base-200 input-sm"
									value={values[key] ?? ''}
									min={field.min}
									max={field.max}
									step={field.step}
									placeholder={field.type === 'number' ? label : undefined}
									oninput={(event) => change(key, event.currentTarget.value)}
								/>
							</div>
						{/each}
					</div>
				</fieldset>
			{:else}
				<div class="space-y-1.5">
					<label for={`filter-${id}-${field.key}`} class="block text-xs font-semibold"
						>{field.label}</label
					>
					{#if field.type === 'boolean' || field.type === 'enum'}
						<select
							id={`filter-${id}-${field.key}`}
							name={`filter.${field.key}`}
							class="select-bordered select w-full bg-base-200 select-sm"
							value={values[field.key] ?? ''}
							onchange={(event) => change(field.key, event.currentTarget.value)}
						>
							<option value="">Any</option>
							{#if field.type === 'boolean'}<option value="true">Yes</option><option value="false"
									>No</option
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
							class="input-bordered input w-full bg-base-200 input-sm"
							value={values[field.key] ?? ''}
							min={field.min}
							max={field.max}
							step={field.step}
							placeholder={field.type === 'text' ? 'Contains...' : undefined}
							oninput={(event) => change(field.key, event.currentTarget.value)}
						/>
					{/if}
				</div>
			{/if}
		{/each}
	</div>
	<button type="button" class="btn mt-4 w-full btn-ghost btn-sm" disabled={!count} onclick={onclear}
		>Clear filters</button
	>
</div>
