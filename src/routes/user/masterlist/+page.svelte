<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import MasterlistTable from './MasterlistTable.svelte';
	import SearchableSelect from '#lib/components/Dropdown/SearchableSelect.svelte';
	import { getErrorMessage } from '#lib/errors.js';
	import { CalendarDays, Download, RotateCcw, Users } from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { semesterLabel } from '../curriculum/SubjectLayout.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let programCode = $derived(data.filters.programCode);
	let applying = $state(false);
	let filterError = $state('');
	let form: HTMLFormElement;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let requestId = 0;
	let pending = $state(false);
	const csvHref = $derived.by(() => {
		const parameters = new SvelteURLSearchParams();
		for (const [key, value] of Object.entries(data.filters)) {
			if (value !== undefined && value !== '') parameters.set(key, String(value));
		}
		return `${resolve('/user/masterlist/export')}?${parameters}`;
	});
	const programOptions = $derived([
		{ value: '', label: 'All programs' },
		...data.options.programs.map((item) => ({
			value: item.code,
			label: item.code + ' - ' + item.name
		}))
	]);

	function schedule() {
		clearTimeout(timer);
		pending = true;
		filterError = '';
		const id = ++requestId;
		// Capture this selection before an earlier navigation can update the form.
		const parameters = new SvelteURLSearchParams();
		for (const [key, value] of new FormData(form)) {
			if (typeof value === 'string' && value.trim()) parameters.set(key, value.trim());
		}
		if (programCode) parameters.set('programCode', programCode);
		else parameters.delete('programCode');
		timer = setTimeout(() => void apply(parameters, id), 150);
	}

	async function apply(parameters: SvelteURLSearchParams, id: number) {
		applying = true;
		try {
			await goto(resolve('/user/masterlist') + '?' + parameters, { reset: false, replace: true });
		} catch (cause) {
			if (id === requestId)
				filterError = getErrorMessage(cause, 'Could not load the masterlist. Please try again.');
		} finally {
			if (id === requestId) {
				applying = false;
				pending = false;
			}
		}
	}

	beforeNavigate(() => clearTimeout(timer));
	onDestroy(() => {
		clearTimeout(timer);
		requestId++;
	});
</script>

<svelte:head><title>Student masterlist | BPC Enrollment Portal</title></svelte:head>

<section class="w-full space-y-5" aria-label="Student masterlist">
	<div class="portal-panel p-4 sm:p-5">
		<form
			method="GET"
			action={resolve('/user/masterlist')}
			bind:this={form}
			onchange={(event) => {
				if (event.target instanceof HTMLSelectElement) schedule();
			}}
			onsubmit={(event) => {
				event.preventDefault();
				schedule();
			}}
			class="space-y-5"
			aria-label="Masterlist filters"
			aria-busy={applying}
		>
			<div class="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
				<fieldset class="min-w-0 space-y-3">
					<legend
						class="mb-3 flex items-center gap-2 text-xs font-bold tracking-wider text-base-content/55 uppercase"
					>
						<CalendarDays class="size-4 text-primary" aria-hidden="true" />Academic term
					</legend>
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="space-y-2 text-sm font-semibold">
							<span>School year</span>
							<select
								name="schoolYearStart"
								aria-label="School year"
								value={String(data.filters.schoolYearStart)}
								class="select w-full bg-base-200"
							>
								{#each data.options.schoolYears as year (year)}
									<option value={String(year)}>{year}–{year + 1}</option>
								{/each}
							</select>
						</label>
						<label class="space-y-2 text-sm font-semibold">
							<span>Semester</span>
							<select
								name="semester"
								aria-label="Semester"
								value={String(data.filters.semester)}
								class="select w-full bg-base-200"
							>
								{#each data.options.semesters as semester (semester)}
									<option value={String(semester)}>{semesterLabel(semester)}</option>
								{/each}
							</select>
						</label>
					</div>
				</fieldset>
				<fieldset class="min-w-0 space-y-3 lg:border-l lg:border-base-300 lg:pl-5">
					<legend
						class="mb-3 flex items-center gap-2 text-xs font-bold tracking-wider text-base-content/55 uppercase"
					>
						<Users class="size-4 text-primary" aria-hidden="true" />Class group
					</legend>
					<div class="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
						<div class="min-w-0 space-y-2">
							<label for="masterlist-program" class="text-sm font-semibold">Program</label>
							<input type="hidden" name="programCode" value={programCode} />
							<SearchableSelect
								id="masterlist-program"
								label="Program"
								bind:value={programCode}
								onchange={(value) => {
									programCode = value;
									schedule();
								}}
								options={programOptions}
								placeholder="All programs"
								searchLabel="Search programs"
							/>
						</div>
						<label class="space-y-2 text-sm font-semibold">
							<span>Year level</span>
							<select
								name="yearLevel"
								aria-label="Year level"
								value={data.filters.yearLevel ? String(data.filters.yearLevel) : ''}
								class="select w-full bg-base-200"
							>
								<option value="">All levels</option>
								{#each data.options.yearLevels as level (level)}
									<option value={String(level)}>Year {level}</option>
								{/each}
							</select>
						</label>
						<label class="space-y-2 text-sm font-semibold">
							<span>Section</span>
							<select
								name="section"
								aria-label="Section"
								value={data.filters.section}
								class="select w-full bg-base-200"
							>
								<option value="">All sections</option>
								{#each data.options.sections as section (section)}
									<option value={section}>{section}</option>
								{/each}
							</select>
						</label>
					</div>
				</fieldset>
			</div>
			<div class="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-4">
				<p class="text-xs leading-relaxed text-base-content/55" role="status" aria-live="polite">
					{#if applying}
						<span class="loading mr-1 loading-xs loading-spinner" aria-hidden="true"></span>
						Updating masterlist...
					{:else}
						Filters update automatically. More students load as you scroll.
					{/if}
				</p>
				<div class="flex flex-wrap items-center gap-2">
					<a
						href={resolve('/user/masterlist')}
						class="btn gap-2 btn-ghost btn-sm"
						aria-label="Reset masterlist filters"
						onclick={(event) => {
							clearTimeout(timer);
							requestId++;
							applying = false;
							pending = false;
							event.currentTarget.closest('form')?.reset();
							programCode = '';
							filterError = '';
						}}
					>
						<RotateCcw class="size-4" aria-hidden="true" />Reset filters
					</a>
					<a
						href={pending || applying || filterError ? undefined : csvHref}
						aria-disabled={pending || applying || !!filterError}
						tabindex={pending || applying || filterError ? -1 : undefined}
						class="btn gap-2 btn-primary btn-sm"
						class:pointer-events-none={pending || applying || !!filterError}
						class:opacity-50={pending || applying || !!filterError}
						download
						data-sveltekit-reload
					>
						<Download class="size-4" aria-hidden="true" />Download CSV
					</a>
				</div>
			</div>
			{#if filterError}
				<div class="flex flex-wrap items-center gap-3">
					<p role="alert" class="text-sm text-error">{filterError}</p>
					<button type="button" class="btn btn-ghost btn-sm" onclick={schedule}>Retry</button>
				</div>
			{/if}
		</form>
		<p class="mt-4 text-xs leading-relaxed text-base-content/55">
			Showing {data.filters.schoolYearStart}–{data.filters.schoolYearStart + 1} · {semesterLabel(
				data.filters.semester
			)}. Includes enrolled and completed records; excludes dropped enrollments.
		</p>
	</div>
	{#key data}
		<MasterlistTable {data} />
	{/key}
</section>
