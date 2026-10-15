<script lang="ts">
	import { enrollStudent } from '#lib/actions/user.remote.js';
	import { getErrorMessage } from '#lib/errors.js';
	import SearchableSelect from '#lib/components/Dropdown/SearchableSelect.svelte';
	import { showError, showSuccess, showYesNo } from '#lib/components/Popup/Popup.svelte.js';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { BookOpen, GraduationCap, Plus, Trash2, UserPlus } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { levelOptions, semesterLabel } from '../curriculum/SubjectLayout.svelte';
	import type { PageData } from './[applicantId]/enroll/$types';

	let { data }: { data: PageData } = $props();
	type SubjectRow = { key: string; subjectId: string; units: number | undefined };
	let yearLevel = $state(
		untrack(() => Math.min(data.applicant.yearLevel, data.curriculum.yearLevels))
	);
	let semester = $state(1);
	let schoolYearStart = $state<number | undefined>(untrack(() => data.schoolYearStart));
	let section = $state('');

	function termRows(year: number, term: number): SubjectRow[] {
		return data.entries
			.filter((entry) => entry.yearLevel === year && entry.semester === term)
			.map((entry) => ({ key: entry.id, subjectId: entry.subjectId, units: entry.units }));
	}
	let rows = $state<SubjectRow[]>(untrack(() => termRows(yearLevel, semester)));
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
	function removeSubject(key: string) {
		if (!busy && !saved) rows = rows.filter((entry) => entry.key !== key);
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
					title: 'Enroll student?',
					message: `Enroll ${data.applicant.name} for ${schoolYearStart}–${Number(schoolYearStart) + 1}, year ${yearLevel}, ${semesterLabel(semester)}, section ${section.trim()}, with ${rows.length} subjects?`,
					yesText: 'Enroll Student',
					noText: 'Cancel'
				}))
			)
				return;
			const result = await enrollStudent({
				applicantId: data.applicant.id,
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
			if (result.invitationSent) showSuccess('Student enrolled successfully');
			else
				showError(
					'Student enrolled, but account setup email failed. Resend it from the student page.'
				);
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

<svelte:head><title>Enroll {data.applicant.name} | BPC Enrollment System</title></svelte:head>

<form class="mx-auto max-w-7xl space-y-6" onsubmit={save}>
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
			<section
				class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm"
				aria-labelledby="applicant-heading"
			>
				<div class="h-1.5 bg-primary" aria-hidden="true"></div>
				<div class="p-5 sm:p-6">
					<header class="mb-4 flex flex-wrap items-center justify-between gap-3">
						<h2 id="applicant-heading" class="font-bold">Applicant information</h2>
						<button
							type="submit"
							class="btn btn-primary btn-sm"
							disabled={busy || saved || !rows.length}
						>
							{#if busy}
								<span class="loading loading-sm loading-spinner" aria-hidden="true"></span>
							{:else}
								<UserPlus class="size-4" aria-hidden="true" />
							{/if}
							{busy ? 'Enrolling...' : 'Enroll Student'}
						</button>
					</header>
					<dl class="grid gap-4 text-sm sm:grid-cols-2">
						{#each [['Full name', data.applicant.name], ['Application ID', data.applicant.applicationId], ['Program', `${data.program.code} — ${data.program.name}`], ['Email', data.applicant.email], ['Contact number', data.applicant.contactNumber], ['Address', data.applicant.address]] as [label, value] (label)}
							<div>
								<dt class="text-xs text-base-content/50">{label}</dt>
								<dd class="mt-1 font-semibold wrap-break-word">{value}</dd>
							</div>
						{/each}
					</dl>
				</div>
			</section>
			<section
				class="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm sm:p-6"
				aria-labelledby="enrollment-heading"
			>
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
			<section
				class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm"
				aria-labelledby="subjects-heading"
			>
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
			class="space-y-4 rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm xl:sticky xl:top-6"
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
				An account setup link will be sent to {data.applicant.email} after enrollment.
			</p>
		</aside>
	</div>
</form>
