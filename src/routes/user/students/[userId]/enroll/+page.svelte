<script lang="ts">
	import EnrollmentEditor from '../../EnrollmentEditor.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getErrorMessage } from '#lib/errors.js';
	import { showError } from '#lib/components/Popup/Popup.svelte.js';
	import { BookOpen } from '@lucide/svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	async function chooseProgram(event: SubmitEvent) {
		event.preventDefault();
		const values = new FormData(event.currentTarget as HTMLFormElement);
		const destination =
			resolve('/user/students/[userId]/enroll', { userId: data.student.userId }) +
			'?' +
			new URLSearchParams({ programCode: String(values.get('programCode')) });
		try {
			await goto(destination);
		} catch (cause) {
			showError(getErrorMessage(cause, 'Failed to load curriculum. Please try again.'));
		}
	}
</script>

<svelte:head><title>Enroll {data.student.name} | BPC Enrollment System</title></svelte:head>
<div class="mx-auto max-w-7xl space-y-6">
	<section class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
		<div class="h-1.5 bg-primary" aria-hidden="true"></div>
		<form class="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:p-6" onsubmit={chooseProgram}>
			<label class="flex-1 space-y-2">
				<span class="text-sm font-bold">Program for this enrollment</span>
				<select
					class="select w-full bg-base-200"
					name="programCode"
					value={data.programCode}
					required
				>
					<option value="" disabled>Choose a program</option>
					{#each data.programs as program (program.code)}
						<option value={program.code}>{program.code} — {program.name}</option>
					{/each}
				</select>
			</label>
			<button type="submit" class="btn btn-primary" disabled={!data.programs.length}>
				<BookOpen class="size-4" aria-hidden="true" />Load curriculum
			</button>
		</form>
	</section>
	{#if data.plan}
		{#key data.plan.curriculum.id}
			<EnrollmentEditor
				data={{ ...data.plan, student: data.student, schoolYearStart: data.schoolYearStart }}
			/>
		{/key}
	{:else}
		<div class="rounded-2xl border border-base-300 bg-base-100 p-10 text-center">
			<BookOpen class="mx-auto mb-4 size-10 text-primary/40" aria-hidden="true" />
			<h1 class="text-xl font-bold">Choose a program to enroll {data.student.name}</h1>
			<p class="mt-3 text-sm text-base-content/60">
				Load the active curriculum, then choose the year, semester, section, and subjects. The
				student account is already saved.
			</p>
			{#if !data.programs.length}
				<p class="mt-3 text-sm text-base-content/60">
					Ask an administrator to add an active program first.
				</p>
			{/if}
		</div>
	{/if}
</div>
