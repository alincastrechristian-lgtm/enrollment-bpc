<script module lang="ts">
	const ordinalRules = new Intl.PluralRules('en', { type: 'ordinal' });
	export function semesterLabel(semester: number) {
		const category = ordinalRules.select(semester);
		const suffix =
			category === 'one' ? 'st' : category === 'two' ? 'nd' : category === 'few' ? 'rd' : 'th';
		return `${semester}${suffix} Semester`;
	}
	export function levelOptions(count: number | undefined) {
		return Array.from(
			{ length: Number.isSafeInteger(count) && (count ?? 0) > 0 ? (count ?? 0) : 0 },
			(_, index) => index + 1
		);
	}
</script>

<script lang="ts">
	import { List, PanelsTopLeft } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	let {
		yearLevels,
		regularSemesters,
		layout = $bindable('all'),
		year = $bindable(1),
		semester = $bindable(1),
		disabled = false,
		heading,
		actions,
		children
	}: {
		yearLevels: number | undefined;
		regularSemesters: number | undefined;
		layout?: 'all' | 'tabbed';
		year?: number;
		semester?: number;
		disabled?: boolean;
		heading?: Snippet;
		actions?: Snippet;
		children: Snippet;
	} = $props();
	const uid = $props.id();
	const years = $derived(levelOptions(yearLevels));
	const terms = $derived(levelOptions(regularSemesters));

	$effect(() => {
		if (years.length && !years.includes(year)) year = 1;
		if (terms.length && !terms.includes(semester)) semester = 1;
	});
	function tabKeydown(event: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		const list = (event.currentTarget as HTMLElement).closest('[role="tablist"]');
		const tabs = [
			...(list?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)') ?? [])
		];
		if (!tabs.length) return;
		const current = tabs.indexOf(event.currentTarget as HTMLButtonElement);
		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? tabs.length - 1
					: (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
		tabs[next].click();
		tabs[next].focus();
	}
</script>

<div class="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 p-5">
	{#if heading}{@render heading()}{/if}
	<div class="flex flex-wrap items-center gap-2">
		<div class="join" role="group" aria-label="Subject layout">
			<button
				type="button"
				class={`btn join-item gap-2 btn-sm ${layout === 'all' ? 'btn-primary' : 'border-base-300 bg-base-100'}`}
				{disabled}
				aria-pressed={layout === 'all'}
				onclick={() => {
					layout = 'all';
				}}><List class="size-4" aria-hidden="true" />All subjects</button
			>
			<button
				type="button"
				class={`btn join-item gap-2 btn-sm ${layout === 'tabbed' ? 'btn-primary' : 'border-base-300 bg-base-100'}`}
				{disabled}
				aria-pressed={layout === 'tabbed'}
				onclick={() => {
					layout = 'tabbed';
				}}><PanelsTopLeft class="size-4" aria-hidden="true" />Tabbed</button
			>
		</div>
		{#if actions}{@render actions()}{/if}
	</div>
</div>
{#if layout === 'tabbed'}
	<div class="space-y-4 border-b border-base-300 bg-base-200/30 p-5">
		<div role="tablist" aria-label="Subject year" class="flex gap-1 overflow-x-auto pb-1">
			{#each years as option (option)}
				<button
					type="button"
					role="tab"
					id={`${uid}-year-${option}`}
					aria-controls={`${uid}-panel`}
					aria-selected={year === option}
					tabindex={year === option ? 0 : -1}
					{disabled}
					onkeydown={tabKeydown}
					onclick={() => {
						year = option;
					}}
					class={`btn shrink-0 border-none btn-sm ${year === option ? 'bg-primary/10 text-primary' : 'btn-ghost text-base-content/60'}`}
					>Year {option}</button
				>
			{/each}
		</div>
		<div role="tablist" aria-label="Subject semester" class="flex gap-1 overflow-x-auto pb-1">
			{#each terms as option (option)}
				<button
					type="button"
					role="tab"
					id={`${uid}-semester-${option}`}
					aria-controls={`${uid}-panel`}
					aria-selected={semester === option}
					tabindex={semester === option ? 0 : -1}
					{disabled}
					onkeydown={tabKeydown}
					onclick={() => {
						semester = option;
					}}
					class={`btn shrink-0 border-none btn-sm ${semester === option ? 'bg-primary/10 text-primary' : 'btn-ghost text-base-content/60'}`}
					>{semesterLabel(option)}</button
				>
			{/each}
		</div>
	</div>
{/if}
{#if layout === 'tabbed'}
	<div
		id={`${uid}-panel`}
		role="tabpanel"
		aria-labelledby={`${uid}-year-${year} ${uid}-semester-${semester}`}
		tabindex="0"
	>
		{@render children()}
	</div>
{:else}
	<div id={`${uid}-panel`} role="region" aria-label="All subjects">
		{@render children()}
	</div>
{/if}
