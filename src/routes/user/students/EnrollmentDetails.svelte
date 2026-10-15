<script lang="ts">
	import { updateEnrollmentGrades } from '#lib/actions/grades.remote.js';
	import { showYesNo } from '#lib/components/Popup/Popup.svelte.js';
	import { beforeNavigate, goto } from '$app/navigation';
	import { BookOpen, LockKeyhole, Pencil, Save } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { semesterLabel } from '../curriculum/SubjectLayout.svelte';
	import type { PageData } from './[userId]/enrollments/[enrollmentId]/$types';

	let { data }: { data: PageData } = $props();
	let rows = $state(
		untrack(() =>
			data.enrollment.subjects.map((subject) => ({
				...subject,
				savedGrade: subject.grade
			}))
		)
	);
	let editing = $state(false);
	let busy = $state(false);
	let message = $state('');
	let success = $state('');
	let confirmingDiscard = false;
	let discardAllowed = false;
	const dirty = $derived(rows.some((row) => (row.grade ?? null) !== row.savedGrade));
	const changedRows = $derived(rows.filter((row) => (row.grade ?? null) !== row.savedGrade));
	const formatter = new Intl.DateTimeFormat('en-PH', {
		timeZone: 'Asia/Manila',
		dateStyle: 'medium'
	});

	beforeNavigate(async ({ cancel, willUnload, to }) => {
		if (discardAllowed || (!dirty && !busy)) return;
		cancel();
		if (busy || willUnload || confirmingDiscard || !to) return;
		confirmingDiscard = true;
		try {
			if (!(await showYesNo('Discard unsaved grade changes?'))) return;
			discardAllowed = true;
			await goto(to.url);
		} catch (cause) {
			message = cause instanceof Error ? cause.message : 'Failed to navigate.';
		} finally {
			discardAllowed = false;
			confirmingDiscard = false;
		}
	});

	async function cancelEditing() {
		if (busy || (dirty && !(await showYesNo('Discard unsaved grade changes?')))) return;
		for (const row of rows) row.grade = row.savedGrade;
		editing = false;
		message = '';
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !editing || !data.canEdit || !dirty) return;
		message = '';
		success = '';
		if (
			changedRows.some(
				(row) =>
					row.grade != null && (!Number.isFinite(row.grade) || row.grade < 1 || row.grade > 5)
			)
		) {
			message = 'Grades must be between 1 and 5, or blank for no grade.';
			return;
		}
		busy = true;
		try {
			const result = await updateEnrollmentGrades({
				userId: data.student.id,
				enrollmentId: data.enrollment.id,
				grades: changedRows.map((row) => ({
					id: row.id,
					grade: row.grade ?? null,
					originalGrade: row.savedGrade
				}))
			});
			for (const saved of result.grades) {
				const row = rows.find((subject) => subject.id === saved.id)!;
				row.savedGrade = saved.grade;
				row.grade = saved.grade;
			}
			editing = false;
			success = 'Grades saved successfully.';
		} catch (cause) {
			message = cause instanceof Error ? cause.message : 'Failed to save grades. Please try again.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Enrollment · {data.student.name} | BPC Enrollment System</title></svelte:head>

<form class="mx-auto max-w-7xl space-y-6" onsubmit={save}>
	<header class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
		<div class="h-1.5 bg-primary" aria-hidden="true"></div>
		<div class="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
			<div class="min-w-0">
				<h1 class="text-2xl font-bold wrap-break-word">{data.student.name}</h1>
				<p class="mt-1 font-mono text-sm text-base-content/60">{data.student.studentId}</p>
				<p class="mt-3 text-sm text-base-content/70">
					{data.enrollment.schoolYearStart}–{data.enrollment.schoolYearStart + 1} · {semesterLabel(
						data.enrollment.semester
					)} · Year {data.enrollment.yearLevel} · Section {data.enrollment.section}
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<span class:badge-primary={data.isCurrent} class="badge badge-outline">
					{data.isCurrent ? 'Current enrollment' : 'Historical enrollment'}
				</span>
				<span class="badge badge-outline capitalize">{data.enrollment.status}</span>
			</div>
		</div>
		<dl
			class="grid gap-5 border-t border-base-300 bg-base-200/40 p-5 text-sm sm:grid-cols-3 sm:p-6"
		>
			<div>
				<dt class="text-xs text-base-content/50">Program</dt>
				<dd class="mt-1 font-semibold">
					{data.enrollment.curriculum.program?.name ?? data.enrollment.curriculum.programCode}
				</dd>
			</div>
			<div>
				<dt class="text-xs text-base-content/50">Curriculum</dt>
				<dd class="mt-1 font-semibold">{data.enrollment.curriculum.name}</dd>
			</div>
			<div>
				<dt class="text-xs text-base-content/50">Recorded</dt>
				<dd class="mt-1 font-semibold">
					{data.enrollment.enrolledAt
						? formatter.format(data.enrollment.enrolledAt)
						: 'Not recorded'}
				</dd>
			</div>
		</dl>
	</header>

	{#if !data.canEdit}
		<p
			class="flex items-center gap-3 rounded-xl border border-base-300 bg-base-100 p-4 text-sm text-base-content/70"
		>
			<LockKeyhole class="size-5 shrink-0" aria-hidden="true" />This enrollment is read-only.
			Registrars can edit grades only for the student's current enrollment.
		</p>
	{/if}
	{#if message}
		<p role="alert" class="rounded-xl border border-error/20 bg-error/10 p-4 text-sm text-error">
			{message}
		</p>
	{/if}
	{#if success}
		<p role="status" class="rounded-xl border border-success/30 bg-success/10 p-4 text-sm">
			{success}
		</p>
	{/if}

	<section
		class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm"
		aria-labelledby="enrollment-subjects-heading"
	>
		<header
			class="flex flex-wrap items-center justify-between gap-4 border-b border-base-300 p-5 sm:p-6"
		>
			<div>
				<h2 id="enrollment-subjects-heading" class="flex items-center gap-2 font-bold">
					<BookOpen class="size-5 text-primary" aria-hidden="true" />Subjects and grades
				</h2>
				<p class="mt-1 text-sm text-base-content/60">
					{rows.length} subjects · {rows.reduce((sum, row) => sum + row.units, 0)} units
				</p>
			</div>
			{#if data.canEdit}
				<div class="flex flex-wrap gap-2">
					{#if editing}
						<button
							type="button"
							class="btn border-base-300 btn-outline btn-sm"
							disabled={busy}
							onclick={cancelEditing}
						>
							Cancel
						</button>
						<button type="submit" class="btn btn-primary btn-sm" disabled={busy || !dirty}>
							{#if busy}
								<span class="loading loading-sm loading-spinner" aria-hidden="true"></span>
							{:else}
								<Save class="size-4" aria-hidden="true" />
							{/if}
							{busy ? 'Saving...' : 'Save grades'}
						</button>
					{:else}
						<button
							type="button"
							class="btn btn-primary btn-sm"
							disabled={!rows.length}
							onclick={() => {
								editing = true;
								success = '';
								message = '';
							}}
						>
							<Pencil class="size-4" aria-hidden="true" />Edit grades
						</button>
					{/if}
				</div>
			{/if}
		</header>
		{#if editing}
			<p class="border-b border-base-300 bg-base-200/40 px-5 py-3 text-sm text-base-content/70">
				Enter a grade from 1 to 5. Decimals are allowed; leave blank for no grade.
			</p>
		{/if}
		{#if rows.length}
			<div class="overflow-x-auto">
				<table class="table w-full">
					<caption class="sr-only">Enrollment subjects and grades</caption>
					<thead>
						<tr>
							<th>Code</th>
							<th>Subject</th>
							<th>Source</th>
							<th>Units</th>
							<th>Grade</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as subject (subject.id)}
							<tr>
								<td class="font-mono text-xs">{subject.subjectCode}</td>
								<td class="min-w-48 font-semibold">{subject.subjectName}</td>
								<td>
									<span class="badge badge-outline badge-sm">
										{subject.source === 'curriculum' ? 'Curriculum' : 'Extra'}
									</span>
								</td>
								<td>{subject.units}</td>
								<td>
									{#if editing && data.canEdit}
										<input
											aria-label={`Grade for ${subject.subjectCode}`}
											class="input w-28 bg-base-200 input-sm"
											type="number"
											min="1"
											max="5"
											step="any"
											placeholder="No grade"
											disabled={busy}
											bind:value={subject.grade}
										/>
									{:else}
										{subject.savedGrade ?? 'No grade'}
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="p-5 text-sm text-base-content/60">No subjects recorded for this enrollment.</p>
		{/if}
	</section>
</form>
