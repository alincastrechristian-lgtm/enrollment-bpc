<script lang="ts">
	import EnrollmentEditor from './EnrollmentEditor.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getErrorMessage } from '#lib/errors.js';
	import { showError, showYesNo } from '#lib/components/Popup/Popup.svelte.js';
	import { BookOpen, Eye, LockKeyhole } from '@lucide/svelte';
	import type { PageData } from './[userId]/enroll/$types';
	let { data }: { data: PageData } = $props();
	let loadingProgram = $state(false);
	async function chooseProgram(event: Event) {
		const select = event.currentTarget as HTMLSelectElement;
		if (loadingProgram || select.value === data.programCode) return;
		const destination =
			(data.editing
				? resolve('/user/students/[userId]/enrollments/[enrollmentId]/edit', {
						userId: data.student.userId,
						enrollmentId: data.editing.enrollmentId
					})
				: resolve('/user/students/[userId]/enroll', { userId: data.student.userId })) +
			'?' +
			new URLSearchParams({ programCode: select.value });
		loadingProgram = true;
		try {
			if (
				data.editing &&
				!(await showYesNo({
					title: 'Change enrollment program?',
					message:
						'The selected subjects will be replaced with the curriculum of the new program. Matching subjects keep their saved grades when you save. Removing graded subjects requires a separate confirmation. Changes are saved only after you review and confirm.',
					warning: true,
					yesText: 'Change program',
					noText: 'Cancel'
				}))
			)
				return;
			await goto(destination);
		} catch (cause) {
			showError(getErrorMessage(cause, 'Failed to load curriculum. Please try again.'));
		} finally {
			// A canceled draft-discard prompt must restore the original selection.
			select.value = data.programCode;
			loadingProgram = false;
		}
	}
</script>

<svelte:head>
	<title>
		{data.editing ? 'Edit enrollment for' : 'Enroll'}
		{data.student.name} | BPC Enrollment System
	</title>
</svelte:head>
<div class="w-full space-y-6">
	{#if data.enrollmentLockReason}
		<section
			class="flex min-h-[60vh] w-full items-center justify-center px-4 py-12 sm:px-6"
			aria-labelledby="enrollment-blocked-title"
		>
			<div class="portal-panel w-full max-w-xl overflow-hidden">
				<div class="h-1 bg-primary" aria-hidden="true"></div>
				<div class="p-6 text-center sm:p-10">
					<div
						class="mx-auto mb-6 grid size-20 place-items-center rounded-2xl bg-primary/10 text-primary"
					>
						<LockKeyhole class="size-9" aria-hidden="true" />
					</div>
					<p class="mb-3 text-xs font-bold tracking-widest text-base-content/50 uppercase">
						Enrollment on hold
					</p>
					<h1 id="enrollment-blocked-title" class="text-2xl font-black tracking-tight sm:text-3xl">
						Complete current enrollment
					</h1>
					<p class="mt-4 text-sm leading-relaxed break-words text-base-content/70 sm:text-base">
						{data.enrollmentLockReason}
					</p>
					<div class="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
						<a
							class="btn gap-2 btn-primary"
							href={resolve('/user/students/[userId]/enrollments/[enrollmentId]', {
								userId: data.student.userId,
								enrollmentId: data.student.currentEnrollmentId!
							})}
						>
							<Eye class="size-4" aria-hidden="true" />View current enrollment
						</a>
					</div>
				</div>
				<div
					class="border-t border-base-300 bg-base-200/50 px-6 py-4 text-center text-xs leading-relaxed break-words text-base-content/60"
				>
					<span class="font-semibold text-base-content/80">{data.student.name}</span>
					<span class="mx-1" aria-hidden="true">·</span>
					<span class="font-mono">{data.student.studentId}</span>
				</div>
			</div>
		</section>
	{:else}
		{#if data.restoringDropped}
			<p
				class="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-base-content/70"
				role="status"
			>
				Restoring the dropped enrollment’s term, section, and subjects. Review the details before
				enrolling again.
			</p>
		{/if}
		<section class="portal-panel overflow-hidden">
			<div class="h-1 bg-primary" aria-hidden="true"></div>
			<div class="space-y-2 p-5 sm:p-6">
				<label class="block space-y-2">
					<span class="text-sm font-bold">Program for this enrollment</span>
					<select
						class="select w-full bg-base-200"
						name="programCode"
						value={data.programCode}
						onchange={chooseProgram}
						disabled={loadingProgram || !data.programs.length}
						required
					>
						<option value="" disabled>Choose a program</option>
						{#each data.programs as program (program.code)}
							<option value={program.code}>{program.code} — {program.name}</option>
						{/each}
					</select>
				</label>
				{#if loadingProgram}
					<p class="flex items-center gap-2 text-xs text-base-content/60" role="status">
						<span class="loading loading-xs loading-spinner" aria-hidden="true"></span>
						Loading curriculum…
					</p>
				{/if}
			</div>
		</section>
		{#if data.plan}
			{#key `${data.student.userId}:${data.student.currentEnrollmentId ?? ''}:${data.plan.curriculum.id}:${data.editing?.enrollmentId ?? ''}:${data.editing?.revision ?? ''}`}
				<EnrollmentEditor
					data={{
						...data.plan,
						student: data.student,
						schoolYearStart: data.schoolYearStart,
						gradeConcerns: data.gradeConcerns,
						editing: data.editing
					}}
				/>
			{/key}
		{:else}
			<div class="portal-panel p-10 text-center">
				<BookOpen class="mx-auto mb-4 size-10 text-primary/40" aria-hidden="true" />
				<h1 class="text-xl font-bold">Choose a program to enroll {data.student.name}</h1>
				<p class="mt-3 text-sm text-base-content/60">
					Select a program to load its active curriculum, then review the year, semester, section,
					and subjects. The student account is already saved.
				</p>
				{#if !data.programs.length}
					<p class="mt-3 text-sm text-base-content/60">
						Ask an administrator to add an active program first.
					</p>
				{/if}
			</div>
		{/if}
	{/if}
</div>
