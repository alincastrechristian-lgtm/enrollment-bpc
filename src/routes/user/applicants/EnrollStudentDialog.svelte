<script lang="ts">
	import { canCreateStudentAccount } from '#lib/applicants.js';
	import {
		showError,
		showLoading,
		showSuccess,
		showYesNo
	} from '#lib/components/Popup/Popup.svelte.js';
	import PopupCard from '#lib/components/Popup/PopupCard.svelte';
	import type { Applicant } from '#lib/schema.js';
	import { FileCheck, GraduationCap, UserPlus, X } from '@lucide/svelte';

	let { busy = $bindable(false) }: { busy?: boolean } = $props();
	let selectedApplicant = $state<Applicant>();
	let section = $state('');
	const canEnrollStudent = $derived(canCreateStudentAccount(selectedApplicant));
	const applicantFields = $derived([
		{ id: 'name', label: 'Full name', value: selectedApplicant?.name },
		{ id: 'application-id', label: 'Application ID', value: selectedApplicant?.applicationId },
		{ id: 'email', label: 'Email address', value: selectedApplicant?.email },
		{ id: 'contact', label: 'Contact number', value: selectedApplicant?.contactNumber },
		{ id: 'program', label: 'Program', value: selectedApplicant?.programCode },
		{ id: 'year', label: 'Year level', value: selectedApplicant?.yearLevel },
		{ id: 'address', label: 'Address', value: selectedApplicant?.address }
	]);

	let enrollmentDialog: HTMLDialogElement;

	export function openDialog(record: Applicant) {
		if (busy || !canCreateStudentAccount(record)) return;
		selectedApplicant = record;
		section = '';
		enrollmentDialog.showModal();
	}

	function closeDialog() {
		if (!busy) {
			enrollmentDialog.close();
		}
	}

	async function enrollStudentAction(event: SubmitEvent) {
		event.preventDefault();
		if (!selectedApplicant || !['A', 'B', 'C', 'D'].includes(section)) return;

		if (busy || !canEnrollStudent) return;
		busy = true;
		const creating = selectedApplicant;
		try {
			const confirmed = await showYesNo({
				title: 'Enroll student?',
				message: `Enroll ${creating.name} (${creating.applicationId}) using ${creating.email}?`,
				yesText: 'Enroll Student',
				noText: 'Cancel'
			});
			if (!confirmed) return;
			showLoading();

			// const result = await enrollStudent({ applicantId: creating.id });
			// enrollmentDialog.close();
			// await refreshAll();
			// if (result.invitationSent) {
			// 	showSuccess('Student enrolled successfully');
			// } else {
			// 	showError('Student enrolled, but invitation failed. Resend it from the Students page.');
			// }

			showSuccess(
				'Student enrollment is currently disabled. Please contact the system administrator.'
			);
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Failed to enroll student');
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	bind:this={enrollmentDialog}
	class="fixed inset-0 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 text-base-content outline-none backdrop:bg-transparent"
	aria-labelledby="enroll-student-title"
	aria-describedby="enroll-student-description"
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
>
	<PopupCard onClose={closeDialog} class="max-w-xl">
		<form
			class="flex max-h-[85dvh] flex-col overflow-hidden rounded-box"
			onsubmit={enrollStudentAction}
		>
			<div class="flex shrink-0 items-start gap-4 border-b border-base-300 p-6">
				<div
					class="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
				>
					<UserPlus class="size-7" aria-hidden="true" />
				</div>
				<div class="min-w-0 flex-1">
					<h2 id="enroll-student-title" class="text-lg font-semibold">Enroll Student</h2>
					<p id="enroll-student-description" class="mt-1 text-sm text-base-content/60">
						Review the applicant's information and choose a section.
					</p>
				</div>
				<button
					type="button"
					class="btn btn-circle btn-ghost btn-sm"
					aria-label="Close enrollment popup"
					disabled={busy}
					onclick={closeDialog}
				>
					<X class="size-4" aria-hidden="true" />
				</button>
			</div>

			<div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
				<fieldset class="space-y-3">
					<legend class="flex items-center gap-2 text-sm font-semibold">
						<FileCheck class="size-4 text-primary" aria-hidden="true" />Applicant information
					</legend>
					<div class="grid gap-4 sm:grid-cols-2">
						{#each applicantFields as field (field.id)}
							<div class={field.id === 'address' ? 'space-y-2 sm:col-span-2' : 'space-y-2'}>
								<label for={`student-${field.id}`} class="text-sm font-semibold">
									{field.label}
								</label>
								<input
									id={`student-${field.id}`}
									type="text"
									value={field.value ?? ''}
									readonly
									class="input-bordered input w-full bg-base-200 text-sm"
								/>
							</div>
						{/each}
					</div>
				</fieldset>
				<fieldset class="space-y-3 border-t border-base-300 pt-5" disabled={busy}>
					<legend class="flex items-center gap-2 text-sm font-semibold">
						<GraduationCap class="size-4 text-primary" aria-hidden="true" />Section assignment
					</legend>
					<div class="space-y-2">
						<label for="student-section" class="text-sm font-semibold">Section</label>
						<select
							id="student-section"
							name="section"
							class="select-bordered select w-full bg-base-200 text-sm"
							bind:value={section}
							required
						>
							<option value="" disabled>Select a section</option>
							{#each ['A', 'B', 'C', 'D'] as option (option)}
								<option value={option}>Section {option}</option>
							{/each}
						</select>
					</div>
				</fieldset>
				<p class="text-xs text-base-content/60">
					An account setup link will be sent to the applicant's email address.
				</p>
			</div>

			<div class="shrink-0 border-t border-base-300 bg-base-200/40 p-6">
				<div class="flex flex-col-reverse gap-2 sm:flex-row">
					<button
						type="button"
						class="btn flex-1 border-base-300 btn-outline"
						disabled={busy}
						onclick={closeDialog}
					>
						Cancel
					</button>
					<button type="submit" class="btn flex-1 btn-primary" disabled={busy || !canEnrollStudent}>
						{#if busy}
							<span class="loading loading-sm loading-spinner" aria-hidden="true"></span>
						{:else}
							<UserPlus class="size-4" aria-hidden="true" />
						{/if}
						{busy ? 'Enrolling...' : 'Enroll Student'}
					</button>
				</div>
			</div>
		</form>
	</PopupCard>
</dialog>
