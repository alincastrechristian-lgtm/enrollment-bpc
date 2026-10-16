<script lang="ts">
	import { enrollStudent } from '#lib/actions/user.remote.js';
	import { getErrorMessage } from '#lib/errors.js';
	import SearchableSelect from '#lib/components/Dropdown/SearchableSelect.svelte';
	import { showError, showSuccess, showYesNo } from '#lib/components/Popup/Popup.svelte.js';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		BookOpen,
		Check,
		Eye,
		GraduationCap,
		Plus,
		RotateCcw,
		Trash2,
		UserPlus,
		X
	} from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { levelOptions, semesterLabel } from '../curriculum/SubjectLayout.svelte';
	import type { PageData } from './[userId]/enroll/$types';

	let {
		data
	}: {
		data: NonNullable<PageData['plan']> &
			Pick<PageData, 'student' | 'schoolYearStart'> &
			Partial<Pick<PageData, 'gradeConcerns'>>;
	} = $props();
	type SubjectRow = { key: string; subjectId: string; units: number | undefined };
	let yearLevel = $state(
		untrack(() => Math.min(data.student.yearLevel ?? 1, data.curriculum.yearLevels))
	);
	let semester = $state(
		untrack(() => Math.min(data.student.semester ?? 1, data.curriculum.semesters))
	);
	let schoolYearStart = $state<number | undefined>(untrack(() => data.schoolYearStart));
	let section = $state(untrack(() => data.student.section ?? ''));
	let outstandingDialog: HTMLDialogElement;

	function termRows(year: number, term: number): SubjectRow[] {
		return data.entries
			.filter((entry) => entry.yearLevel === year && entry.semester === term)
			.map((entry) => ({ key: entry.id, subjectId: entry.subjectId, units: entry.units }));
	}
	let rows = $state<SubjectRow[]>(
		untrack(() =>
			data.restoredSubjects
				? data.restoredSubjects.map((entry) => ({
						key: crypto.randomUUID(),
						subjectId: entry.id,
						units: entry.units
					}))
				: termRows(yearLevel, semester)
		)
	);
	const outstandingSubjects = $derived(data.outstandingSubjects ?? []);
	const remainingSubjects = $derived(
		outstandingSubjects.filter((subject) => !rows.some((row) => row.subjectId === subject.id))
	);
	const termEntries = $derived(
		data.entries.filter((entry) => entry.yearLevel === yearLevel && entry.semester === semester)
	);
	const totalUnits = $derived(rows.reduce((sum, entry) => sum + (Number(entry.units) || 0), 0));
	const initial = untrack(() =>
		JSON.stringify({ yearLevel, semester, schoolYearStart, section, rows })
	);
	const dirty = $derived(
		JSON.stringify({ yearLevel, semester, schoolYearStart, section, rows }) !== initial
	);
	let busy = $state(false);
	let saved = $state(false);
	let message = $state('');
	let enrolledUserId = $state<string | null>(null);
	let confirmingDiscard = false;
	let discardAllowed = false;
	const hasGradeConcerns = $derived(
		!!(data.gradeConcerns?.failedCount || data.gradeConcerns?.incompleteCount)
	);
	const gradeWarning = $derived(
		hasGradeConcerns
			? `The current enrollment has ${data.gradeConcerns!.failedCount} failing and ${data.gradeConcerns!.incompleteCount} incomplete (INC) grades. Review the student's academic standing before continuing.`
			: ''
	);

	beforeNavigate(async ({ cancel, willUnload, to }) => {
		if (saved || discardAllowed || (!dirty && !busy)) return;
		cancel();
		if (busy || willUnload || confirmingDiscard || !to) return;
		confirmingDiscard = true;
		try {
			if (!(await showYesNo('Discard unsaved enrollment changes?'))) return;
			discardAllowed = true;
			await goto(to.url);
		} catch (cause) {
			showError(getErrorMessage(cause, 'Failed to navigate'));
		} finally {
			discardAllowed = false;
			confirmingDiscard = false;
		}
	});

	function addSubject() {
		if (!busy && !saved) rows.push({ key: crypto.randomUUID(), subjectId: '', units: 3 });
	}
	function addOutstandingSubject(
		subject: NonNullable<PageData['plan']>['outstandingSubjects'][number]
	) {
		if (busy || saved || rows.some((row) => row.subjectId === subject.id)) return;
		const matching = termEntries.find((entry) => entry.subjectId === subject.id);
		rows.push({
			key: crypto.randomUUID(),
			subjectId: subject.id,
			units: matching?.units ?? subject.units
		});
	}
	function removeSubject(key: string) {
		if (!busy && !saved) rows = rows.filter((entry) => entry.key !== key);
	}
	function addAllOutstandingSubjects() {
		if (busy || saved) return;
		for (const subject of remainingSubjects) addOutstandingSubject(subject);
	}
	async function useTermSubjects() {
		if (busy || saved) return;
		busy = true;
		try {
			if (
				dirty &&
				!(await showYesNo('Replace selected subjects with this term’s curriculum subjects?'))
			)
				return;
			rows = termRows(yearLevel, semester);
			message = '';
		} finally {
			busy = false;
		}
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy || saved) return;
		message = '';
		if (!section.trim() || !Number.isSafeInteger(schoolYearStart) || (schoolYearStart ?? 0) < 1) {
			message = 'Enter a section and a valid school year start.';
			return;
		}
		if (
			!rows.length ||
			rows.some(
				(entry) =>
					!entry.subjectId || !Number.isFinite(entry.units ?? NaN) || (entry.units ?? 0) <= 0
			)
		) {
			message = 'Select at least one subject and enter positive units for every subject.';
			return;
		}
		if (new Set(rows.map((entry) => entry.subjectId)).size !== rows.length) {
			message = 'Each subject can only appear once in an enrollment.';
			return;
		}
		busy = true;
		try {
			if (
				!(await showYesNo({
					title: hasGradeConcerns ? 'Enroll with grade concerns?' : 'Enroll student?',
					message: `${gradeWarning}${gradeWarning ? ' ' : ''}Enroll ${data.student.name} for ${schoolYearStart}–${Number(schoolYearStart) + 1}, year ${yearLevel}, ${semesterLabel(semester)}, section ${section.trim()}, with ${rows.length} subjects?`,
					warning: hasGradeConcerns,
					yesText: 'Enroll Student',
					noText: 'Cancel'
				}))
			)
				return;
			const result = await enrollStudent({
				userId: data.student.userId,
				programCode: data.program.code,
				curriculumId: data.curriculum.id,
				currentEnrollmentId: data.student.currentEnrollmentId,
				acknowledgeGradeConcerns: hasGradeConcerns,
				section: section.trim(),
				schoolYearStart: Number(schoolYearStart),
				yearLevel,
				semester,
				subjects: rows.map((entry) => ({ id: entry.subjectId, units: Number(entry.units) }))
			});
			// Enrollment has committed. Prevent resubmission even if navigation fails.
			saved = true;
			enrolledUserId = result.userId;
			await goto(resolve('/user/students/[userId]', { userId: result.userId }), {
				refreshAll: true
			});
			if (result.notificationSent) showSuccess('Student enrolled and confirmation email sent.');
			else
				showError({
					title: 'Student enrolled',
					message: 'Enrollment was saved, but the confirmation email could not be sent.'
				});
		} catch (cause) {
			message = saved
				? 'Student enrolled. Open the student record below to continue.'
				: getErrorMessage(cause, 'Failed to enroll student');
			showError({ title: saved ? 'Student enrolled' : 'Unable to enroll student', message });
		} finally {
			busy = false;
		}
	}
</script>

<form class="w-full space-y-6" onsubmit={save}>
	{#if hasGradeConcerns}
		<p class="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm" role="status">
			{gradeWarning}
		</p>
	{/if}
	{#if message}
		<p role="alert" class="rounded-xl border border-error/20 bg-error/10 p-4 text-sm text-error">
			{message}
		</p>
	{/if}
	{#if enrolledUserId}
		<a
			class="btn btn-primary"
			href={resolve('/user/students/[userId]', { userId: enrolledUserId })}
		>
			View student record
		</a>
	{/if}
	<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
		<div class="min-w-0 space-y-6">
			<section class="portal-panel overflow-hidden" aria-labelledby="student-heading">
				<div class="h-1 bg-primary" aria-hidden="true"></div>
				<div class="p-5 sm:p-6">
					<header class="mb-4 flex flex-wrap items-center justify-between gap-3">
						<h2 id="student-heading" class="font-bold">Student information</h2>
					</header>
					<dl class="grid gap-4 text-sm sm:grid-cols-2">
						{#each [['Full name', data.student.name], ['Student number', data.student.studentId], ['Program', `${data.program.code} — ${data.program.name}`], ['Email', data.student.email], ['Contact number', data.student.contactNumber], ['Address', data.student.address]] as [label, value] (label)}
							<div>
								<dt class="text-xs text-base-content/50">{label}</dt>
								<dd class="mt-1 font-semibold wrap-break-word">{value}</dd>
							</div>
						{/each}
					</dl>
				</div>
			</section>
			<section class="portal-panel p-5 shadow-sm sm:p-6" aria-labelledby="enrollment-heading">
				<h2 id="enrollment-heading" class="mb-4 flex items-center gap-2 font-bold">
					<GraduationCap class="size-5 text-primary" aria-hidden="true" />Enrollment details
				</h2>
				<fieldset disabled={busy || saved} class="grid gap-4 sm:grid-cols-2">
					<label class="space-y-2">
						<span class="text-sm font-semibold">School year start</span>
						<input
							aria-label="School year start"
							class="input w-full bg-base-200"
							type="number"
							min="1"
							step="1"
							required
							bind:value={schoolYearStart}
						/>
					</label>
					<label class="space-y-2">
						<span class="text-sm font-semibold">Section</span>
						<input
							aria-label="Section"
							class="input w-full bg-base-200"
							placeholder="e.g. A"
							required
							bind:value={section}
						/>
					</label>
					<label class="space-y-2">
						<span class="text-sm font-semibold">Year level</span>
						<select
							aria-label="Year level"
							class="select w-full bg-base-200"
							bind:value={yearLevel}
						>
							{#each levelOptions(data.curriculum.yearLevels) as year (year)}
								<option value={year}>Year {year}</option>
							{/each}
						</select>
					</label>
					<label class="space-y-2">
						<span class="text-sm font-semibold">Semester</span>
						<select aria-label="Semester" class="select w-full bg-base-200" bind:value={semester}>
							{#each levelOptions(data.curriculum.semesters) as term (term)}
								<option value={term}>{semesterLabel(term)}</option>
							{/each}
						</select>
					</label>
				</fieldset>
			</section>
			{#if outstandingSubjects.length}
				<section class="portal-panel p-5 shadow-sm" aria-labelledby="outstanding-subjects-heading">
					<div class="flex flex-wrap items-center justify-between gap-4">
						<div>
							<h2 id="outstanding-subjects-heading" class="flex items-center gap-2 font-bold">
								<RotateCcw class="size-5 text-primary" aria-hidden="true" />Failed / incomplete
								subjects
								<span class="badge badge-outline badge-sm">{outstandingSubjects.length}</span>
							</h2>
							<p class="mt-2 text-xs leading-relaxed text-base-content/60">
								Review previous failed or INC subjects and add them to this enrollment.
							</p>
						</div>
						<div class="flex flex-wrap gap-2">
							<button
								type="button"
								class="btn gap-2 border-base-300 btn-outline btn-sm"
								disabled={busy || saved}
								onclick={() => outstandingDialog.showModal()}
							>
								<Eye class="size-4" aria-hidden="true" />View failed / INC subjects
							</button>
							<button
								type="button"
								class="btn gap-2 border-base-300 btn-outline btn-sm"
								disabled={busy || saved || !remainingSubjects.length}
								onclick={addAllOutstandingSubjects}
							>
								<Plus class="size-4" aria-hidden="true" />{remainingSubjects.length
									? 'Add all to enrollment'
									: 'All subjects added'}
							</button>
						</div>
					</div>
					<p class="mt-3 text-xs text-base-content/50" role="status">
						{outstandingSubjects.length - remainingSubjects.length} of {outstandingSubjects.length} already
						selected.
					</p>
				</section>
			{/if}
			<section class="portal-panel overflow-hidden" aria-labelledby="subjects-heading">
				<div class="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 p-5">
					<h2 id="subjects-heading" class="flex items-center gap-2 font-bold">
						<BookOpen class="size-5 text-primary" aria-hidden="true" />Enrollment subjects
					</h2>
					<div class="flex flex-wrap gap-2">
						<button
							class="btn btn-outline btn-sm"
							type="button"
							disabled={busy || saved}
							onclick={useTermSubjects}
						>
							Use term subjects
						</button>
						<button
							class="btn btn-outline btn-sm"
							type="button"
							disabled={busy || saved}
							onclick={addSubject}
						>
							<Plus class="size-4" aria-hidden="true" />Add subject
						</button>
					</div>
				</div>
				<p class="px-5 pt-4 text-xs text-base-content/60">
					Subjects outside the selected year and semester count as extras. Units can be customized.
				</p>
				{#if rows.length}
					<fieldset disabled={busy || saved} class="min-w-0 overflow-x-auto">
						<table class="table w-full">
							<caption class="sr-only">Selected enrollment subjects</caption>
							<thead>
								<tr>
									<th>Subject</th>
									<th>Source</th>
									<th>Units</th>
									<th><span class="sr-only">Remove</span></th>
								</tr>
							</thead>
							<tbody>
								{#each rows as entry, index (entry.key)}
									{@const matching = termEntries.find((item) => item.subjectId === entry.subjectId)}
									<tr>
										<td class="min-w-64">
											<SearchableSelect
												id={`enrollment-subject-${entry.key}`}
												label={`Subject ${index + 1}`}
												bind:value={entry.subjectId}
												options={data.subjects.map((item) => {
													const snapshot = termEntries.find(
														(subject) => subject.subjectId === item.id
													);
													return {
														value: item.id,
														label: `${snapshot?.subjectCode ?? item.code} — ${snapshot?.subjectName ?? item.name}${item.isActive ? '' : ' (Inactive)'}`,
														disabled: rows.some(
															(row) => row.key !== entry.key && row.subjectId === item.id
														)
													};
												})}
												placeholder="Select a subject"
												searchLabel="Search subjects"
												required
												disabled={busy || saved}
											/>
										</td>
										<td>
											{#if entry.subjectId}
												<span
													class={`badge badge-sm ${matching ? 'badge-primary' : 'badge-outline'}`}
												>
													{matching ? 'Curriculum' : 'Extra'}
												</span>
											{:else}
												<span class="text-base-content/40">—</span>
											{/if}
										</td>
										<td>
											<input
												class="input w-24 bg-base-200 input-sm"
												type="number"
												min="0"
												step="any"
												required
												aria-label={`Units for subject ${index + 1}`}
												bind:value={entry.units}
											/>
										</td>
										<td>
											<button
												class="btn btn-square btn-ghost text-error btn-sm"
												type="button"
												aria-label={`Remove subject ${index + 1}`}
												onclick={() => removeSubject(entry.key)}
											>
												<Trash2 class="size-4" aria-hidden="true" />
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</fieldset>
				{:else}
					<p class="p-6 text-sm text-base-content/60">
						No subjects selected. Add a subject or use this term’s curriculum subjects.
					</p>
				{/if}
			</section>
		</div>
		<aside
			class="portal-panel space-y-4 p-5 shadow-sm xl:sticky xl:top-28"
			aria-labelledby="summary-heading"
		>
			<h2 id="summary-heading" class="font-bold">Enrollment summary</h2>
			<dl class="space-y-3 text-sm">
				<div>
					<dt class="text-xs text-base-content/50">Curriculum</dt>
					<dd class="mt-1 font-semibold">{data.curriculum.name}</dd>
				</div>
				<div>
					<dt class="text-xs text-base-content/50">School year</dt>
					<dd>{schoolYearStart ? `${schoolYearStart}–${schoolYearStart + 1}` : '—'}</dd>
				</div>
				<div class="flex justify-between">
					<dt>Subjects</dt>
					<dd class="font-semibold">{rows.length}</dd>
				</div>
				<div class="flex justify-between">
					<dt>Total units</dt>
					<dd class="font-semibold">{totalUnits}</dd>
				</div>
			</dl>
			<a
				class="link text-sm link-primary"
				href={resolve('/user/curriculum/[curriculumId]', { curriculumId: data.curriculum.id })}
			>
				View curriculum
			</a>
			<p class="border-t border-base-300 pt-4 text-xs text-base-content/60">
				An account setup link will be sent to {data.student.email} after enrollment.
			</p>
		</aside>
	</div>
	<footer
		class="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/15 bg-base-100/95 p-4 shadow-lg shadow-base-content/5 backdrop-blur-xl"
	>
		<div>
			<p class="text-sm font-semibold">
				{saved ? 'Enrollment saved' : 'Ready to review this enrollment?'}
			</p>
			<p class="mt-1 text-xs text-base-content/55">
				{rows.length} subjects · {totalUnits} units · Review your selection before confirming.
			</p>
		</div>
		<button type="submit" class="btn btn-primary btn-sm" disabled={busy || saved || !rows.length}>
			{#if busy}
				<span class="loading loading-sm loading-spinner" aria-hidden="true"></span>
			{:else}
				<UserPlus class="size-4" aria-hidden="true" />
			{/if}
			{busy ? 'Enrolling...' : 'Enroll Student'}
		</button>
	</footer>
</form>

<dialog
	bind:this={outstandingDialog}
	class="modal"
	aria-labelledby="outstanding-dialog-title"
	aria-describedby="outstanding-dialog-description"
>
	<div
		class="portal-panel modal-box flex max-h-[85dvh] max-w-3xl flex-col overflow-hidden p-0 shadow-xl"
	>
		<div class="h-1.5 shrink-0 bg-primary" aria-hidden="true"></div>
		<header
			class="flex items-start justify-between gap-4 border-b border-base-300 bg-base-200/40 p-5 sm:p-6"
		>
			<div>
				<h2 id="outstanding-dialog-title" class="text-xl font-bold">
					Failed and incomplete subjects
				</h2>
				<p id="outstanding-dialog-description" class="mt-2 text-sm text-base-content/60">
					Latest finalized results from enrollment history. Subjects passed on a later attempt are
					excluded.
				</p>
			</div>
			<button
				type="button"
				class="btn btn-square shrink-0 btn-ghost btn-sm"
				aria-label="Close subject history"
				onclick={() => outstandingDialog.close()}
			>
				<X class="size-5" aria-hidden="true" />
			</button>
		</header>
		<ul class="min-h-0 divide-y divide-base-300/60 overflow-y-auto">
			{#each outstandingSubjects as subject (subject.id)}
				{@const selected = rows.some((row) => row.subjectId === subject.id)}
				<li class="flex flex-wrap items-center justify-between gap-4 p-5 sm:px-6">
					<div class="min-w-0 flex-1">
						<p class="text-sm font-semibold wrap-break-word">{subject.name}</p>
						<p class="mt-1 text-xs text-base-content/55">
							<span class="font-mono">{subject.code}</span>
							&middot; {subject.units} units
						</p>
						<p class="mt-1 text-xs text-base-content/50">
							SY {subject.schoolYearStart}&ndash;{subject.schoolYearStart + 1} &middot; {semesterLabel(
								subject.semester
							)}
						</p>
						<span
							class={`mt-2 badge border-0 badge-sm ${subject.grade === null ? 'bg-warning/15 text-base-content' : 'bg-error/10 text-base-content'}`}
						>
							{subject.grade === null ? 'INC (Incomplete)' : `Failed (${subject.grade.toFixed(2)})`}
						</span>
					</div>
					<button
						type="button"
						class="btn gap-2 border-base-300 btn-outline btn-sm"
						disabled={busy || saved || selected}
						aria-label={selected
							? `${subject.code} already selected`
							: `Add ${subject.code} to enrollment`}
						onclick={() => addOutstandingSubject(subject)}
					>
						{#if selected}
							<Check class="size-4" aria-hidden="true" />Added
						{:else}
							<Plus class="size-4" aria-hidden="true" />Add to enrollment
						{/if}
					</button>
				</li>
			{/each}
		</ul>
		<footer class="flex shrink-0 justify-end border-t border-base-300 bg-base-200/30 p-4 sm:px-6">
			<button
				type="button"
				class="btn btn-primary btn-sm"
				onclick={() => outstandingDialog.close()}
			>
				Done
			</button>
		</footer>
	</div>
</dialog>
