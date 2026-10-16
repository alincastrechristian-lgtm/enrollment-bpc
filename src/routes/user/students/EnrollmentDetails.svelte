<script lang="ts">
	import { getErrorMessage } from '#lib/errors.js';
	import {
		finalizeEnrollmentGrades,
		sendEnrollmentMeetingRequest,
		updateEnrollmentGrades,
		verifyEnrollmentClearance
	} from '#lib/actions/grades.remote.js';
	import { showYesNo } from '#lib/components/Popup/Popup.svelte.js';
	import { getGradeConcerns } from '#lib/enrollment-grades.js';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		ArrowRight,
		BookOpen,
		Check,
		ClipboardCheck,
		LockKeyhole,
		Mail,
		Pencil,
		Save
	} from '@lucide/svelte';
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
	let finalizedHere = $state(false);
	let meetingSentHere = $state<Date | null>(null);
	const meetingSentAt = $derived(meetingSentHere ?? data.enrollment.meetingRequestSentAt);
	let clearanceVerifiedHere = $state(false);
	const clearanceVerified = $derived(clearanceVerifiedHere || data.enrollment.submittedClearance);
	const finalized = $derived(finalizedHere || data.enrollment.finalizedGrades);
	const canEdit = $derived(data.canEdit && (!finalized || data.canEditFinalized));
	const canFinalize = $derived(data.canFinalize && !finalized);
	const incompleteCount = $derived(rows.filter((row) => row.savedGrade === null).length);
	const gradeConcerns = $derived(
		getGradeConcerns(
			rows.map((row) => ({ grade: row.savedGrade })),
			finalized
		)
	);
	const hasGradeConcerns = $derived(!!(gradeConcerns.failedCount || gradeConcerns.incompleteCount));
	const gradeConcernSummary = $derived(
		[
			gradeConcerns.failedCount ? `${gradeConcerns.failedCount} failing` : '',
			gradeConcerns.incompleteCount ? `${gradeConcerns.incompleteCount} incomplete (INC)` : ''
		]
			.filter(Boolean)
			.join(' · ') || 'No failing or incomplete grades'
	);
	const savedGradesValid = $derived(
		rows.length > 0 &&
			rows.every(
				(row) =>
					row.savedGrade === null ||
					(Number.isFinite(row.savedGrade) && row.savedGrade >= 1 && row.savedGrade <= 5)
			)
	);
	const lockReason = $derived(
		finalized && !data.canEditFinalized
			? 'Grades are finalized. Only administrators can edit them.'
			: data.gradeLockReason
	);
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
			message = getErrorMessage(cause, 'Failed to navigate.');
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
		if (busy || !editing || !canEdit || !dirty) return;
		message = '';
		success = '';
		if (
			changedRows.some(
				(row) =>
					row.grade != null && (!Number.isFinite(row.grade) || row.grade < 1 || row.grade > 5)
			)
		) {
			message = finalized
				? 'Grades must be between 1 and 5, or blank for INC (Incomplete).'
				: 'Grades must be between 1 and 5, or blank for no grade.';
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
			message = getErrorMessage(cause, 'Failed to save grades. Please try again.');
		} finally {
			busy = false;
		}
	}

	async function requestMeeting() {
		if (busy || editing || dirty || !finalized || !hasGradeConcerns || meetingSentAt) return;
		busy = true;
		message = '';
		success = '';
		try {
			if (
				!(await showYesNo({
					title: 'Send meeting request?',
					message: `Send an email to ${data.student.name} at ${data.student.email} asking them to arrange a meeting with the Registrar's Office about failing or incomplete grades?`,
					yesText: 'Send meeting request',
					noText: 'Cancel'
				}))
			)
				return;
			const result = await sendEnrollmentMeetingRequest({
				userId: data.student.id,
				enrollmentId: data.enrollment.id
			});
			meetingSentHere = result.meetingRequestSentAt;
			success = 'Meeting request email sent successfully.';
		} catch (cause) {
			message = getErrorMessage(cause, 'Failed to send the meeting request. Please try again.');
		} finally {
			busy = false;
		}
	}

	async function verifyClearance() {
		if (busy || editing || dirty || !finalized || clearanceVerified) return;
		busy = true;
		message = '';
		success = '';
		try {
			if (
				!(await showYesNo({
					title: 'Verify clearance?',
					message: `Confirm that ${data.student.name} has submitted clearance for this enrollment. This will allow the student to be enrolled again.`,
					warning: true,
					yesText: 'Verify clearance',
					noText: 'Cancel'
				}))
			)
				return;
			await verifyEnrollmentClearance({
				userId: data.student.id,
				enrollmentId: data.enrollment.id
			});
			clearanceVerifiedHere = true;
			success = 'Clearance verified successfully.';
		} catch (cause) {
			message = getErrorMessage(cause, 'Failed to verify clearance. Please try again.');
		} finally {
			busy = false;
		}
	}

	async function finalize() {
		if (busy || editing || dirty || !canFinalize || !savedGradesValid) return;
		message = '';
		success = '';
		busy = true;
		try {
			if (
				!(await showYesNo({
					title: 'Finalize grades?',
					message: `Finalize all ${rows.length} subject grades for ${data.student.name}?${incompleteCount ? ` ${incompleteCount} ${incompleteCount === 1 ? 'subject has' : 'subjects have'} no grade and will be marked as INC (Incomplete).` : ''} Registrars will no longer be able to edit these grades. Administrators can still make corrections.`,
					warning: true,
					yesText: 'Finalize grades',
					noText: 'Cancel'
				}))
			)
				return;
			const result = await finalizeEnrollmentGrades({
				userId: data.student.id,
				enrollmentId: data.enrollment.id,
				grades: rows.map((row) => ({ id: row.id, grade: row.savedGrade }))
			});
			finalizedHere = true;
			success = result.notificationSent
				? 'Grades finalized and notification email sent.'
				: 'Grades finalized. The notification email could not be sent.';
		} catch (cause) {
			message = getErrorMessage(cause, 'Failed to finalize grades. Please try again.');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Enrollment · {data.student.name} | BPC Enrollment System</title></svelte:head>

<form class="mx-auto max-w-7xl space-y-6" onsubmit={save}>
	<header class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
		<div class="h-1.5 bg-primary" aria-hidden="true"></div>
		<div class="p-5 sm:p-6">
			<div class="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
				<span class="flex items-center gap-2 text-primary">
					<span class="size-1.5 rounded-full bg-primary" aria-hidden="true"></span>
					{data.isCurrent ? 'Current enrollment' : 'Historical enrollment'}
				</span>
				{#if data.enrollment.status !== 'enrolled'}
					<span class="badge badge-outline badge-sm capitalize">{data.enrollment.status}</span>
				{/if}
			</div>
			<div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
				<h1 class="text-2xl font-bold wrap-break-word">{data.student.name}</h1>
				<p class="font-mono text-xs text-base-content/50">{data.student.studentId}</p>
			</div>
			<p class="mt-3 text-sm text-base-content/65">
				{data.enrollment.schoolYearStart}–{data.enrollment.schoolYearStart + 1} · {semesterLabel(
					data.enrollment.semester
				)} · Year {data.enrollment.yearLevel} · Section {data.enrollment.section}
			</p>
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

	{#if !canEdit}
		<p
			class="flex items-center gap-3 rounded-xl border border-base-300 bg-base-100 p-4 text-sm text-base-content/70"
		>
			<LockKeyhole class="size-5 shrink-0" aria-hidden="true" />This enrollment is read-only.
			{lockReason ?? "Registrars can edit grades only for the student's current enrollment."}
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
		aria-labelledby="progress-heading"
	>
		<div
			class="flex flex-wrap items-center justify-between gap-2 border-b border-base-300/70 px-5 py-3.5 sm:px-6"
		>
			<h2
				id="progress-heading"
				class="text-xs font-semibold tracking-wider text-base-content/55 uppercase"
			>
				Enrollment progress
			</h2>
			<span class="flex items-center gap-1.5 text-xs font-medium text-base-content/65">
				{#if finalized}
					<Check class="size-3.5 text-success" aria-hidden="true" />Grades finalized
				{:else}
					Awaiting finalization
				{/if}
			</span>
		</div>
		<div class={`grid ${finalized && (hasGradeConcerns || meetingSentAt) ? 'md:grid-cols-2' : ''}`}>
			<div class="flex flex-wrap items-center justify-between gap-3 p-5 sm:px-6">
				<div class="flex items-start gap-3">
					<ClipboardCheck class="mt-0.5 size-4 shrink-0 text-base-content/45" aria-hidden="true" />
					<div>
						<h3 class="text-sm font-semibold">Clearance</h3>
						{#if !clearanceVerified}
							<p class="mt-1 text-xs text-base-content/55">
								{finalized
									? 'Verify submitted clearance to allow the next enrollment.'
									: 'Available after grade finalization.'}
							</p>
						{/if}
					</div>
				</div>
				{#if clearanceVerified}
					<span class="flex items-center gap-1.5 text-xs font-medium text-base-content/65">
						<Check class="size-3.5 text-success" aria-hidden="true" />Clearance verified
					</span>
				{:else}
					<button
						type="button"
						class="btn gap-2 border-base-300 btn-outline btn-sm"
						disabled={busy || editing || dirty || !finalized}
						onclick={verifyClearance}
					>
						Verify clearance
					</button>
				{/if}
			</div>
			{#if finalized && (hasGradeConcerns || meetingSentAt)}
				<div
					class="flex flex-wrap items-center justify-between gap-3 border-t border-base-300/60 p-5 sm:px-6 md:border-t-0 md:border-l"
				>
					<div class="flex min-w-0 flex-1 items-start gap-3">
						<Mail class="mt-0.5 size-4 shrink-0 text-base-content/45" aria-hidden="true" />
						<div>
							<h3 class="text-sm font-semibold">Academic follow-up</h3>
							<p class="mt-1 text-xs text-base-content/60">{gradeConcernSummary}</p>
							{#if meetingSentAt}
								<p class="mt-1 text-xs text-base-content/50">
									Request emailed {formatter.format(meetingSentAt)}
								</p>
							{/if}
						</div>
					</div>
					{#if meetingSentAt}
						<span class="flex items-center gap-1.5 text-xs font-medium text-base-content/65">
							<Check class="size-3.5 text-success" aria-hidden="true" />Meeting request sent
						</span>
					{:else}
						<button
							type="button"
							class="btn gap-2 border-base-300 btn-outline btn-sm"
							disabled={busy || editing || dirty}
							onclick={requestMeeting}
						>
							Send meeting request
						</button>
					{/if}
				</div>
			{/if}
		</div>
		{#if data.isCurrent && finalized && clearanceVerified}
			<div
				class="flex flex-wrap items-center justify-between gap-4 border-t border-base-300 bg-base-200/35 px-5 py-4 sm:px-6"
			>
				<div>
					<p class="text-sm font-semibold">Ready for the next term</p>
					<p class="mt-1 text-xs text-base-content/55">
						{hasGradeConcerns
							? 'Review grade concerns before enrolling.'
							: 'Grades and clearance are complete.'}
					</p>
				</div>
				<a
					class="btn gap-2 btn-primary btn-sm"
					href={resolve('/user/students/[userId]/enroll', { userId: data.student.id })}
				>
					Enroll for next term<ArrowRight class="size-4" aria-hidden="true" />
				</a>
			</div>
		{/if}
	</section>

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
			{#if canEdit}
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
							class="btn border-base-300 btn-outline btn-sm"
							disabled={busy || !rows.length}
							onclick={() => {
								editing = true;
								success = '';
								message = '';
							}}
						>
							<Pencil class="size-4" aria-hidden="true" />Edit grades
						</button>
						{#if canFinalize}
							<button
								type="button"
								class="btn btn-primary btn-sm"
								disabled={busy || !savedGradesValid}
								onclick={finalize}
							>
								{#if busy}
									<span class="loading loading-sm loading-spinner" aria-hidden="true"></span>
								{:else}
									<LockKeyhole class="size-4" aria-hidden="true" />
								{/if}
								{busy ? 'Finalizing...' : 'Finalize grades'}
							</button>
						{/if}
					{/if}
				</div>
			{/if}
		</header>
		{#if canFinalize && incompleteCount > 0}
			<p class="border-b border-base-300 bg-base-200/40 px-5 py-3 text-sm text-base-content/70">
				Blank grades will be marked as INC (Incomplete) when finalized.
			</p>
		{/if}
		{#if editing}
			<p class="border-b border-base-300 bg-base-200/40 px-5 py-3 text-sm text-base-content/70">
				{finalized
					? 'Administrators can correct finalized grades. Enter a grade from 1 to 5, or leave blank for INC (Incomplete).'
					: 'Enter a grade from 1 to 5. Decimals are allowed; leave blank for no grade.'}
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
									<span class="text-xs text-base-content/55">
										{subject.source === 'curriculum' ? 'Curriculum' : 'Extra'}
									</span>
								</td>
								<td>{subject.units}</td>
								<td>
									{#if editing && canEdit}
										<input
											aria-label={`Grade for ${subject.subjectCode}`}
											class="input w-28 bg-base-200 input-sm"
											type="number"
											min="1"
											max="5"
											step="any"
											placeholder={finalized ? 'INC' : 'No grade'}
											disabled={busy}
											bind:value={subject.grade}
										/>
									{:else}
										{subject.savedGrade ?? (finalized ? 'INC (Incomplete)' : 'No grade')}
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
