<script lang="ts">
	import { beforeNavigate, goto, refreshAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import SearchableSelect from '#lib/components/Dropdown/SearchableSelect.svelte';
	import { getErrorMessage } from '#lib/errors.js';
	import { reportTypes } from '#lib/reports.js';
	import {
		ArrowUpRight,
		CheckCheck,
		Download,
		FileCheck2,
		FileText,
		Printer,
		RotateCcw,
		SearchX,
		Users,
		UserRoundMinus
	} from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { semesterLabel } from '../curriculum/SubjectLayout.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let programCode = $derived(data.filters.programCode);
	let generating = $state(false);
	let reportError = $state('');
	let form: HTMLFormElement;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let requestId = 0;
	const programOptions = $derived([
		{ value: '', label: 'All programs' },
		...data.options.programs.map((item) => ({
			value: item.code,
			label: `${item.code} — ${item.name}`
		}))
	]);
	const scope = $derived(
		[
			`${data.filters.schoolYearStart}–${data.filters.schoolYearStart + 1}`,
			semesterLabel(data.filters.semester),
			data.filters.programCode || 'All programs',
			data.filters.yearLevel ? `Year ${data.filters.yearLevel}` : 'All year levels',
			data.filters.section ? `Section ${data.filters.section}` : 'All sections'
		].join(' · ')
	);
	const generated = $derived(
		new Intl.DateTimeFormat('en-PH', {
			timeZone: 'Asia/Manila',
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(data.generatedAt)
	);
	const csvHref = $derived.by(() => {
		const parameters = new SvelteURLSearchParams({ report: data.kind });
		for (const [key, value] of Object.entries(data.filters))
			if (value !== undefined && value !== '') parameters.set(key, String(value));
		return `${resolve('/user/reports/export')}?${parameters}`;
	});
	const cards = $derived([
		{
			label: 'Distinct students in scope',
			value: data.overview.students,
			icon: Users,
			tone: 'text-primary',
			background: 'bg-primary/10'
		},
		{
			label: 'Enrolled records',
			value: data.overview.enrolled,
			icon: FileText,
			tone: 'text-info',
			background: 'bg-info/10'
		},
		{
			label: 'Completed records',
			value: data.overview.completed,
			icon: CheckCheck,
			tone: 'text-success',
			background: 'bg-success/10'
		},
		{
			label: 'Dropped records',
			value: data.overview.dropped,
			icon: UserRoundMinus,
			tone: 'text-error',
			background: 'bg-error/10'
		}
	]);
	const statusColumns = [
		'Grade',
		'Outcome',
		'Grade release',
		'Grades',
		'Clearance',
		'Follow-up',
		'Next-term enrollment'
	];
	const badgeClasses: Record<string, string> = {
		Passed: 'badge-success badge-soft',
		Ready: 'badge-success badge-soft',
		Finalized: 'badge-success badge-soft',
		Verified: 'badge-success badge-soft',
		Completed: 'badge-success badge-soft',
		Failed: 'badge-error badge-soft',
		INC: 'badge-warning badge-soft',
		Incomplete: 'badge-warning badge-soft',
		Draft: 'badge-warning badge-soft',
		'Not finalized': 'badge-warning badge-soft',
		'Not verified': 'badge-warning badge-soft',
		'Requirements pending': 'badge-warning badge-soft',
		Requested: 'badge-info badge-soft',
		'Not requested': 'badge-warning badge-soft'
	};
	function schedule() {
		clearTimeout(timer);
		const id = ++requestId;
		const parameters = new SvelteURLSearchParams();
		// Capture changes before an earlier request can update the form.
		for (const [key, value] of new FormData(form))
			if (typeof value === 'string' && value.trim()) parameters.set(key, value.trim());
		if (programCode) parameters.set('programCode', programCode);
		else parameters.delete('programCode');
		generating = true;
		reportError = '';
		timer = setTimeout(() => void generate(parameters, id), 150);
	}

	async function generate(parameters: SvelteURLSearchParams, id: number) {
		const destination = `${resolve('/user/reports')}?${parameters}`;
		try {
			if (destination === page.url.pathname + page.url.search) await refreshAll();
			else await goto(destination, { reset: false, replace: true });
		} catch (cause) {
			if (id === requestId)
				reportError = getErrorMessage(cause, 'Could not update the report. Please try again.');
		} finally {
			if (id === requestId) generating = false;
		}
	}

	beforeNavigate(() => clearTimeout(timer));
	onDestroy(() => {
		clearTimeout(timer);
		requestId++;
	});
</script>

<svelte:head><title>Reports | BPC Enrollment Portal</title></svelte:head>

<section class="reports-page w-full space-y-5" aria-label="Academic reports">
	<form
		method="GET"
		action={resolve('/user/reports')}
		bind:this={form}
		onchange={(event) => {
			if (event.target instanceof HTMLSelectElement) schedule();
		}}
		onsubmit={(event) => {
			event.preventDefault();
			schedule();
		}}
		class="report-controls portal-panel space-y-5 p-4 sm:p-5"
		aria-label="Report filters"
		aria-busy={generating}
	>
		<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr]">
			<label class="space-y-2 text-sm font-semibold">
				<span>Report type</span>
				<select
					name="report"
					aria-label="Report type"
					value={data.kind}
					class="select w-full bg-base-200"
				>
					{#each reportTypes as report (report.value)}
						<option value={report.value}>{report.label}</option>
					{/each}
				</select>
			</label>
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
		<div class="grid gap-4 border-t border-base-300 pt-4 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr]">
			<div class="min-w-0 space-y-2">
				<label for="report-program" class="text-sm font-semibold">Program</label>
				<input type="hidden" name="programCode" value={programCode} />
				<SearchableSelect
					id="report-program"
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
					{#each data.options.yearLevels as year (year)}
						<option value={String(year)}>Year {year}</option>
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
		<div
			class="flex flex-col gap-3 border-t border-base-300 pt-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<p class="text-xs leading-relaxed text-base-content/55" role="status" aria-live="polite">
				{#if generating}
					<span class="loading mr-1 loading-xs loading-spinner" aria-hidden="true"></span>
					Updating report...
				{:else}
					Reports update automatically when filters change.
				{/if}
			</p>
			<div class="flex gap-2">
				<a
					href={resolve('/user/reports')}
					class="btn gap-2 btn-ghost btn-sm"
					onclick={(event) => {
						clearTimeout(timer);
						requestId++;
						generating = false;
						event.currentTarget.closest('form')?.reset();
						programCode = '';
						reportError = '';
					}}
				>
					<RotateCcw class="size-4" aria-hidden="true" />Reset
				</a>
			</div>
		</div>
		{#if reportError}
			<div class="flex flex-wrap items-center gap-3">
				<p role="alert" class="text-sm text-error">{reportError}</p>
				<button type="button" class="btn btn-ghost btn-sm" onclick={schedule}>Retry</button>
			</div>
		{/if}
	</form>

	<div class="report-controls grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		{#each cards as card (card.label)}
			<div class="portal-panel flex items-center gap-4 p-5">
				<span
					class={`grid size-11 shrink-0 place-items-center rounded-xl ${card.background} ${card.tone}`}
				>
					<card.icon class="size-5" aria-hidden="true" />
				</span>
				<div>
					<p class="text-2xl font-bold tabular-nums">{card.value.toLocaleString()}</p>
					<p class="mt-1 text-xs text-base-content/55">{card.label}</p>
				</div>
			</div>
		{/each}
	</div>

	<div class="report-panel portal-panel overflow-hidden">
		<div
			class="flex flex-wrap items-start justify-between gap-4 border-b border-base-300 p-5 sm:p-6"
		>
			<div class="min-w-0">
				<p class="print-brand mb-2 hidden text-xs font-bold uppercase">BPC Enrollment Portal</p>
				<h2 class="flex items-center gap-2 text-lg font-bold">
					<FileCheck2 class="size-5 text-primary" aria-hidden="true" />{data.title}
				</h2>
				<p class="mt-2 text-sm text-base-content/65">{scope}</p>
				<p class="mt-2 text-xs leading-relaxed text-base-content/50">{data.description}</p>
				<p class="mt-2 text-xs text-base-content/45">Generated {generated} (Asia/Manila)</p>
			</div>
			<div class="report-controls flex flex-wrap gap-2">
				<a
					href={generating ? undefined : csvHref}
					aria-disabled={generating}
					tabindex={generating ? -1 : undefined}
					download
					data-sveltekit-reload
					class="btn gap-2 btn-outline btn-sm"
					class:pointer-events-none={generating}
					class:opacity-50={generating}
				>
					<Download class="size-4" aria-hidden="true" />Download CSV
				</a>
				<button
					type="button"
					disabled={generating}
					onclick={() => window.print()}
					class="btn gap-2 btn-primary btn-sm"
				>
					<Printer class="size-4" aria-hidden="true" />Print / PDF
				</button>
			</div>
		</div>
		{#if data.rows.length}
			<div class="report-table overflow-x-auto">
				<table class="table w-full text-sm">
					<caption class="sr-only">{data.title} — {scope}</caption>
					<thead>
						<tr
							class="border-b border-base-300 bg-base-200 text-[11px] font-bold tracking-wider text-base-content/60 uppercase"
						>
							{#each data.columns as column (column)}
								<th class="px-5 py-4 whitespace-nowrap">{column}</th>
							{/each}
							<th class="report-controls px-5 py-4 text-right">
								{data.kind === 'summary' ? 'Roster' : 'Record'}
							</th>
						</tr>
					</thead>
					<tbody>
						{#each data.rows as row (row.id)}
							<tr class="border-b border-base-200 last:border-0 hover:bg-base-200/40">
								{#each row.cells as cell, index (index)}
									<td
										class={`px-5 py-4 ${typeof cell === 'number' ? 'tabular-nums' : ''} ${index === 0 && data.kind !== 'summary' ? 'font-mono text-xs whitespace-nowrap' : ''}`}
									>
										{#if statusColumns.includes(data.columns[index]) && badgeClasses[String(cell)]}
											<span
												class={`badge badge-sm whitespace-nowrap ${badgeClasses[String(cell)]}`}
											>
												{cell}
											</span>
										{:else}
											{cell}
										{/if}
									</td>
								{/each}
								{#if data.kind === 'summary'}
									<td class="report-controls px-5 py-4 text-right">
										<a
											href={`${resolve('/user/masterlist')}?${new SvelteURLSearchParams({ schoolYearStart: String(data.filters.schoolYearStart), semester: String(data.filters.semester), programCode: String(row.cells[0]), yearLevel: String(row.cells[1]), section: String(row.cells[2]) })}`}
											class="btn gap-1 btn-ghost whitespace-nowrap btn-sm"
										>
											View roster<ArrowUpRight class="size-3.5" aria-hidden="true" />
										</a>
									</td>
								{:else if row.userId && row.enrollmentId}
									<td class="report-controls px-5 py-4 text-right">
										<a
											href={resolve('/user/students/[userId]/enrollments/[enrollmentId]', {
												userId: row.userId,
												enrollmentId: row.enrollmentId
											})}
											class="btn gap-1 btn-ghost btn-sm"
											aria-label={`View enrollment for ${row.cells[1]}`}
										>
											View<ArrowUpRight class="size-3.5" aria-hidden="true" />
										</a>
									</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="px-6 py-16 text-center" role="status">
				<SearchX class="mx-auto size-9 text-primary/50" aria-hidden="true" />
				<h3 class="mt-4 font-semibold">No matching records</h3>
				<p class="mt-2 text-sm text-base-content/55">
					Choose another term or widen the program, year level, and section filters.
				</p>
			</div>
		{/if}
		<div
			class="border-t border-base-300 bg-base-200/40 px-5 py-4 text-xs leading-relaxed text-base-content/55"
		>
			<span class="font-semibold text-base-content/75">
				{data.rows.length.toLocaleString()}
				{data.kind === 'summary'
					? 'class groups'
					: data.kind === 'grades'
						? 'subject attempts'
						: 'enrollment records'}
			</span>
			. Enrollment counts include dropped attempts; student counts are distinct within scope. Grade outcomes
			use finalized grades: 1.00–3.00 passes, above 3.00 fails, and blank finalized grades are INC.
		</div>
	</div>
</section>

<style>
	@media print {
		@page {
			size: A4 landscape;
			margin: 12mm;
		}
		:global(body:has(.reports-page)) {
			background: white !important;
			color: black !important;
		}
		:global(.portal-shell:has(.reports-page)) {
			display: block !important;
			background: white !important;
		}
		:global(.drawer-content:has(.reports-page)) {
			min-height: 0 !important;
		}
		:global(.portal-shell:has(.reports-page) .drawer-side),
		:global(.drawer-content:has(.reports-page) > header),
		:global(.portal-shell:has(.reports-page) a[href='#workspace-content']) {
			display: none !important;
		}
		:global(#workspace-content:has(.reports-page)) {
			padding: 0 !important;
		}
		.reports-page {
			color: black;
		}
		.report-controls {
			display: none !important;
		}
		.print-brand {
			display: block;
		}
		.report-panel {
			border: 0;
			box-shadow: none;
			overflow: visible;
			background: white;
		}
		.report-panel :global(*) {
			color: black !important;
			background-color: transparent !important;
			box-shadow: none !important;
		}
		.report-table {
			overflow: visible;
		}
		table {
			font-size: 9px;
			width: 100%;
		}
		thead {
			display: table-header-group;
		}
		tr {
			break-inside: avoid;
		}
		th,
		td {
			padding: 5px !important;
			color: black !important;
			overflow-wrap: anywhere;
		}
		.badge {
			border: 0;
			padding: 0;
			background: transparent;
			color: black;
			font-size: inherit;
		}
	}
</style>
