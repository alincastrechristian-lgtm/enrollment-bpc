<script module lang="ts">
	import type { curriculum, enrollment, enrollmentSubject, program } from '#lib/schema.js';

	export type EnrollmentHistoryEntry = Pick<
		typeof enrollment.$inferSelect,
		| 'id'
		| 'schoolYearStart'
		| 'semester'
		| 'yearLevel'
		| 'section'
		| 'status'
		| 'finalizedGrades'
		| 'enrolledAt'
	> & {
		curriculum: Pick<typeof curriculum.$inferSelect, 'name' | 'programCode'> & {
			program: Pick<typeof program.$inferSelect, 'code' | 'name'> | null;
		};
		subjects: Pick<
			typeof enrollmentSubject.$inferSelect,
			'id' | 'subjectCode' | 'subjectName' | 'source' | 'units' | 'grade'
		>[];
	};
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import { BookOpen, Eye, RotateCcw } from '@lucide/svelte';
	import { semesterLabel } from '../../routes/user/curriculum/SubjectLayout.svelte';

	let {
		enrollments,
		currentEnrollmentId,
		studentUserId
	}: {
		enrollments: EnrollmentHistoryEntry[];
		currentEnrollmentId?: string | null;
		studentUserId?: string;
	} = $props();
	let historyFilters = $state({ schoolYear: '', semester: '', status: '', programCode: '' });
	const schoolYears = $derived(
		[...new Set(enrollments.map((entry) => entry.schoolYearStart))].sort((a, b) => b - a)
	);
	const semesters = $derived(
		[...new Set(enrollments.map((entry) => entry.semester))].sort((a, b) => a - b)
	);
	const statuses = $derived([...new Set(enrollments.map((entry) => entry.status))].sort());
	const programs = $derived(
		[
			...new Map(
				enrollments.map(
					(entry) => [entry.curriculum.programCode, entry.curriculum.program] as const
				)
			)
		]
			.map(([code, program]) => ({ code, label: program ? `${code} — ${program.name}` : code }))
			.sort((a, b) => a.code.localeCompare(b.code))
	);
	const hasHistoryFilters = $derived(
		Boolean(
			historyFilters.schoolYear ||
			historyFilters.semester ||
			historyFilters.status ||
			historyFilters.programCode
		)
	);
	const filteredEnrollments = $derived(
		enrollments.filter(
			(entry) =>
				(!historyFilters.schoolYear ||
					entry.schoolYearStart === Number(historyFilters.schoolYear)) &&
				(!historyFilters.semester || entry.semester === Number(historyFilters.semester)) &&
				(!historyFilters.status || entry.status === historyFilters.status) &&
				(!historyFilters.programCode || entry.curriculum.programCode === historyFilters.programCode)
		)
	);
	function clearHistoryFilters() {
		historyFilters = { schoolYear: '', semester: '', status: '', programCode: '' };
	}
	const formatter = new Intl.DateTimeFormat('en-PH', {
		timeZone: 'Asia/Manila',
		dateStyle: 'medium'
	});
	const date = (value: Date | null | undefined) =>
		value ? formatter.format(value) : 'Not recorded';
</script>

<section class="space-y-4" aria-labelledby="history-heading">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 id="history-heading" class="flex items-center gap-2 text-lg font-bold">
			<BookOpen class="size-5 text-primary" aria-hidden="true" />Enrollment history
		</h2>
		{#if enrollments.length}
			<button
				type="button"
				class="btn border-base-300 btn-outline btn-sm"
				disabled={!hasHistoryFilters}
				onclick={clearHistoryFilters}
			>
				<RotateCcw class="size-4" aria-hidden="true" />Clear filters
			</button>
		{/if}
	</div>
	{#if enrollments.length}
		<fieldset
			class="grid gap-4 rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
		>
			<legend class="sr-only">Filter enrollment history</legend>
			<label class="space-y-2">
				<span class="text-sm font-semibold">School year</span>
				<select
					aria-label="School year"
					class="select w-full bg-base-200"
					bind:value={historyFilters.schoolYear}
				>
					<option value="">All school years</option>
					{#each schoolYears as year (year)}
						<option value={String(year)}>{year}–{year + 1}</option>
					{/each}
				</select>
			</label>
			<label class="space-y-2">
				<span class="text-sm font-semibold">Semester</span>
				<select
					aria-label="Semester"
					class="select w-full bg-base-200"
					bind:value={historyFilters.semester}
				>
					<option value="">All semesters</option>
					{#each semesters as semester (semester)}
						<option value={String(semester)}>{semesterLabel(semester)}</option>
					{/each}
				</select>
			</label>
			<label class="space-y-2">
				<span class="text-sm font-semibold">Enrollment status</span>
				<select
					aria-label="Enrollment status"
					class="select w-full bg-base-200"
					bind:value={historyFilters.status}
				>
					<option value="">All statuses</option>
					{#each statuses as status (status)}
						<option value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
					{/each}
				</select>
			</label>
			<label class="space-y-2">
				<span class="text-sm font-semibold">Program</span>
				<select
					aria-label="Program"
					class="select w-full bg-base-200"
					bind:value={historyFilters.programCode}
				>
					<option value="">All programs</option>
					{#each programs as program (program.code)}
						<option value={program.code}>{program.label}</option>
					{/each}
				</select>
			</label>
		</fieldset>
		<p class="text-sm text-base-content/60" role="status">
			Showing {filteredEnrollments.length} of {enrollments.length} enrollments
		</p>
	{/if}
	{#each filteredEnrollments as entry (entry.id)}
		<article
			class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm"
			aria-labelledby={`enrollment-${entry.id}`}
		>
			<div class="flex flex-wrap items-start justify-between gap-3 border-b border-base-300 p-5">
				<div>
					<h3 id={`enrollment-${entry.id}`} class="font-bold">
						{entry.schoolYearStart}–{entry.schoolYearStart + 1} · {semesterLabel(entry.semester)}
					</h3>
					<p class="mt-1 text-sm text-base-content/60">
						Year {entry.yearLevel} · Section {entry.section} · {entry.curriculum.program?.code} · {entry
							.curriculum.name}
					</p>
					<p class="mt-1 text-xs text-base-content/50">
						Recorded {date(entry.enrolledAt)} · {entry.subjects.length} subjects · {entry.subjects.reduce(
							(sum, subject) => sum + subject.units,
							0
						)} units
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					{#if entry.id === currentEnrollmentId}
						<span class="badge badge-primary">Current</span>
					{/if}
					{#if entry.status !== 'enrolled'}
						<span class="badge badge-outline capitalize">{entry.status}</span>
					{/if}
					{#if entry.finalizedGrades}
						<span class="badge badge-success">Grades finalized</span>
					{/if}
					{#if studentUserId}
						<a
							class="btn border-base-300 btn-outline btn-sm"
							href={resolve('/user/students/[userId]/enrollments/[enrollmentId]', {
								userId: studentUserId,
								enrollmentId: entry.id
							})}
						>
							<Eye class="size-4" aria-hidden="true" />View
						</a>
					{/if}
				</div>
			</div>
			{#if entry.subjects.length}
				<div class="overflow-x-auto">
					<table class="table w-full min-w-160 table-fixed">
						<caption class="sr-only">
							Subjects for school year {entry.schoolYearStart}–{entry.schoolYearStart + 1}, semester {entry.semester}
						</caption>
						<colgroup>
							<col class="w-[14%]" />
							<col class="w-[42%]" />
							<col class="w-[18%]" />
							<col class="w-[10%]" />
							<col class="w-[16%]" />
						</colgroup>
						<thead class="bg-base-200/50">
							<tr>
								<th scope="col" class="py-4 pl-5 sm:pl-6">Code</th>
								<th scope="col" class="py-4">Subject</th>
								<th scope="col" class="py-4 text-center">Source</th>
								<th scope="col" class="py-4 text-center">Units</th>
								<th scope="col" class="py-4 pr-5 text-center sm:pr-6">Grade</th>
							</tr>
						</thead>
						<tbody>
							{#each entry.subjects as subject (subject.id)}
								<tr>
									<td class="py-4 pl-5 font-mono text-xs wrap-break-word sm:pl-6">
										{subject.subjectCode}
									</td>
									<td class="py-4 font-semibold wrap-break-word">{subject.subjectName}</td>
									<td class="py-4 text-center">
										<span class="badge badge-outline badge-sm">
											{subject.source === 'curriculum' ? 'Curriculum' : 'Extra'}
										</span>
									</td>
									<td class="py-4 text-center tabular-nums">{subject.units}</td>
									<td class="py-4 pr-5 text-center font-semibold tabular-nums sm:pr-6">
										{subject.grade ?? (entry.finalizedGrades ? 'INC (Incomplete)' : '-')}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="p-5 text-sm text-base-content/60">No subjects recorded for this enrollment.</p>
			{/if}
		</article>
	{:else}
		<p class="rounded-2xl border border-base-300 bg-base-100 p-6 text-sm text-base-content/60">
			{enrollments.length
				? 'No enrollments match these filters. Try another selection or clear filters.'
				: 'No enrollment records yet.'}
		</p>
	{/each}
</section>
