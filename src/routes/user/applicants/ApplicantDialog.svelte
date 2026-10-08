<script lang="ts">
	import { createApplicant, updateApplicant } from '#lib/actions/applicant.remote.js';
	import { showError, showLoading, showSuccess } from '#lib/components/Popup/Popup.svelte.js';
	import PopupCard from '#lib/components/Popup/PopupCard.svelte';
	import type { Applicant } from '#lib/schema.js';
	import { refreshAll } from '$app/navigation';
	import {
		FileCheck,
		GraduationCap,
		Hash,
		Mail,
		MapPin,
		Pencil,
		Phone,
		Plus,
		User,
		UserPlus,
		X
	} from '@lucide/svelte';
	import { dateValue } from './functions.js';

	let { busy = $bindable(false) }: { busy?: boolean } = $props();
	let applicantDialog: HTMLDialogElement;
	let selectedApplicant = $state<Applicant | null>(null);

	function newDraft() {
		return {
			applicationId: '',
			name: '',
			program: '',
			yearLevel: 1,
			dateApplied: dateValue(new Date()),
			email: '',
			contactNumber: '',
			address: '',
			hasBirthCertificate: false,
			hasForm138: false,
			hasGoodMoral: false,
			hasPicture: false
		};
	}
	let draft = $state(newDraft());

	export function openApplicant(applicant: Applicant | null = null) {
		if (busy) return;
		selectedApplicant = applicant;
		draft = applicant
			? {
					applicationId: applicant.applicationId,
					name: applicant.name,
					program: applicant.program,
					yearLevel: applicant.yearLevel,
					dateApplied: dateValue(applicant.dateApplied),
					email: applicant.email,
					contactNumber: applicant.contactNumber,
					address: applicant.address,
					hasBirthCertificate: applicant.hasBirthCertificate,
					hasForm138: applicant.hasForm138,
					hasGoodMoral: applicant.hasGoodMoral,
					hasPicture: applicant.hasPicture
				}
			: newDraft();
		applicantDialog.showModal();
	}

	function closeApplicant() {
		if (!busy) applicantDialog.close();
	}

	async function saveApplicant(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		showLoading();
		const editing = selectedApplicant;
		try {
			const { applicationId, ...details } = draft;
			const payload = {
				...details,
				dateApplied:
					editing && draft.dateApplied === dateValue(editing.dateApplied)
						? editing.dateApplied
						: new Date(`${draft.dateApplied}T00:00:00+08:00`)
			};
			if (editing) await updateApplicant({ ...payload, id: editing.id });
			else await createApplicant({ ...payload, applicationId });
			applicantDialog.close();
			await refreshAll();
			showSuccess(editing ? 'Applicant updated successfully' : 'Applicant created successfully');
		} catch (error) {
			showError(error instanceof Error ? error.message : 'Failed to save applicant');
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	bind:this={applicantDialog}
	class="z-0"
	aria-labelledby="applicant-form-title"
	aria-describedby="applicant-form-description"
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
>
	<PopupCard onClose={closeApplicant} class="max-w-2xl">
		<form class="flex max-h-[85dvh] flex-col overflow-hidden rounded-box" onsubmit={saveApplicant}>
			<div class="flex shrink-0 items-start gap-4 border-b border-base-300 p-6">
				<div
					class="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
				>
					{#if selectedApplicant}<Pencil class="size-7" aria-hidden="true" />{:else}<UserPlus
							class="size-7"
							aria-hidden="true"
						/>{/if}
				</div>
				<div class="min-w-0 flex-1">
					<h2 id="applicant-form-title" class="text-lg font-semibold">
						{selectedApplicant ? 'Edit Applicant' : 'New Applicant'}
					</h2>
					<p id="applicant-form-description" class="mt-1 text-sm text-base-content/60">
						{selectedApplicant
							? 'Update applicant details and document requirements.'
							: 'Add an applicant and track their admission requirements.'}
					</p>
				</div>
				<button
					type="button"
					disabled={busy}
					class="btn btn-circle btn-ghost btn-sm"
					aria-label="Close applicant form"
					onclick={closeApplicant}><X class="size-4" aria-hidden="true" /></button
				>
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto">
				<fieldset disabled={busy} class="min-w-0 space-y-6 p-6">
					<fieldset class="space-y-4">
						<legend class="mb-4 flex items-center gap-2 text-sm font-semibold"
							><User class="size-4 text-primary" aria-hidden="true" />Applicant details</legend
						>
						<div class="grid gap-4 sm:grid-cols-2">
							<div class="space-y-2">
								<label for="applicant-name" class="text-sm font-semibold">Full name</label>
								<div class="input-bordered input flex w-full items-center gap-3 bg-base-200">
									<User class="size-4 shrink-0 text-base-content/50" aria-hidden="true" /><input
										id="applicant-name"
										class="min-w-0 grow text-sm"
										bind:value={draft.name}
										autocomplete="name"
										placeholder="Full name"
										minlength="2"
										required
									/>
								</div>
							</div>
							<div class="space-y-2">
								<label for="applicant-application-id" class="text-sm font-semibold"
									>Application ID</label
								>
								<div class="input-bordered input flex w-full items-center gap-3 bg-base-200">
									<Hash class="size-4 shrink-0 text-base-content/50" aria-hidden="true" /><input
										id="applicant-application-id"
										class="min-w-0 grow text-sm"
										bind:value={draft.applicationId}
										readonly={selectedApplicant !== null}
										placeholder="e.g. 2026-000428"
										required
									/>
								</div>
							</div>
							<div class="space-y-2">
								<label for="applicant-email" class="text-sm font-semibold">Email address</label>
								<div class="input-bordered input flex w-full items-center gap-3 bg-base-200">
									<Mail class="size-4 shrink-0 text-base-content/50" aria-hidden="true" /><input
										id="applicant-email"
										type="email"
										class="min-w-0 grow text-sm"
										bind:value={draft.email}
										autocomplete="email"
										placeholder="applicant@example.com"
										required
									/>
								</div>
							</div>
							<div class="space-y-2">
								<label for="applicant-contact" class="text-sm font-semibold">Contact number</label>
								<div class="input-bordered input flex w-full items-center gap-3 bg-base-200">
									<Phone class="size-4 shrink-0 text-base-content/50" aria-hidden="true" /><input
										id="applicant-contact"
										type="tel"
										class="min-w-0 grow text-sm"
										bind:value={draft.contactNumber}
										autocomplete="tel"
										placeholder="09XXXXXXXXX"
										required
									/>
								</div>
							</div>
							<div class="space-y-2 sm:col-span-2">
								<label for="applicant-address" class="text-sm font-semibold">Address</label>
								<div
									class="flex items-start gap-3 rounded-lg border border-base-300 bg-base-200 px-3 py-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-base-content"
								>
									<MapPin
										class="mt-1 size-4 shrink-0 text-base-content/50"
										aria-hidden="true"
									/><textarea
										id="applicant-address"
										class="min-w-0 grow resize-y bg-transparent text-sm outline-none"
										rows="2"
										bind:value={draft.address}
										autocomplete="street-address"
										placeholder="Street, barangay, city or municipality"
										required></textarea>
								</div>
							</div>
						</div>
					</fieldset>

					<fieldset class="space-y-4 border-t border-base-300 pt-5">
						<legend class="flex items-center gap-2 text-sm font-semibold"
							><GraduationCap class="size-4 text-primary" aria-hidden="true" />Application
							information</legend
						>
						<div class="grid gap-4 sm:grid-cols-2">
							<div class="space-y-2">
								<label for="applicant-program" class="text-sm font-semibold">Program</label><input
									id="applicant-program"
									class="input-bordered input w-full bg-base-200 text-sm"
									bind:value={draft.program}
									placeholder="e.g. BSIS"
									required
								/>
							</div>
							<div class="space-y-2">
								<label for="applicant-year" class="text-sm font-semibold">Year level</label><select
									id="applicant-year"
									class="select-bordered select w-full bg-base-200 text-sm"
									bind:value={draft.yearLevel}
									>{#each [1, 2, 3, 4] as year (year)}<option value={year}>Year {year}</option
										>{/each}</select
								>
							</div>
							<div class="space-y-2">
								<label for="applicant-date" class="text-sm font-semibold">Date applied</label><input
									id="applicant-date"
									type="date"
									class="input-bordered input w-full bg-base-200 text-sm"
									bind:value={draft.dateApplied}
									required
								/>
							</div>
						</div>
					</fieldset>

					<fieldset class="space-y-3 border-t border-base-300 pt-5">
						<legend class="flex items-center gap-2 text-sm font-semibold"
							><FileCheck class="size-4 text-primary" aria-hidden="true" />Documents received</legend
						>
						<p class="text-xs text-base-content/60">Check each requirement once received.</p>
						<div class="grid gap-2 sm:grid-cols-2">
							<label
								class="flex cursor-pointer items-center gap-3 rounded-xl border border-base-300 bg-base-200 p-3 text-sm transition-colors hover:border-primary/40 has-checked:border-primary/40 has-checked:bg-primary/5"
								><input
									type="checkbox"
									class="checkbox checkbox-sm checkbox-primary"
									bind:checked={draft.hasBirthCertificate}
								/>Birth certificate</label
							>
							<label
								class="flex cursor-pointer items-center gap-3 rounded-xl border border-base-300 bg-base-200 p-3 text-sm transition-colors hover:border-primary/40 has-checked:border-primary/40 has-checked:bg-primary/5"
								><input
									type="checkbox"
									class="checkbox checkbox-sm checkbox-primary"
									bind:checked={draft.hasForm138}
								/>Form 138</label
							>
							<label
								class="flex cursor-pointer items-center gap-3 rounded-xl border border-base-300 bg-base-200 p-3 text-sm transition-colors hover:border-primary/40 has-checked:border-primary/40 has-checked:bg-primary/5"
								><input
									type="checkbox"
									class="checkbox checkbox-sm checkbox-primary"
									bind:checked={draft.hasGoodMoral}
								/>Good moral certificate</label
							>
							<label
								class="flex cursor-pointer items-center gap-3 rounded-xl border border-base-300 bg-base-200 p-3 text-sm transition-colors hover:border-primary/40 has-checked:border-primary/40 has-checked:bg-primary/5"
								><input
									type="checkbox"
									class="checkbox checkbox-sm checkbox-primary"
									bind:checked={draft.hasPicture}
								/>Picture</label
							>
						</div>
					</fieldset>
				</fieldset>
			</div>

			<div class="shrink-0 border-t border-base-300 bg-base-200/40 p-6">
				<div class="flex flex-col-reverse gap-2 sm:flex-row">
					<button
						type="button"
						class="btn flex-1 border-base-300 btn-outline"
						disabled={busy}
						onclick={closeApplicant}>Cancel</button
					>
					<button type="submit" class="btn flex-1 btn-primary" disabled={busy}>
						{#if busy}<span class="loading loading-sm loading-spinner" aria-hidden="true"
							></span>{:else if selectedApplicant}<Pencil
								class="size-4"
								aria-hidden="true"
							/>{:else}<Plus class="size-4" aria-hidden="true" />{/if}
						{busy ? 'Saving...' : selectedApplicant ? 'Save changes' : 'Create Applicant'}
					</button>
				</div>
			</div>
		</form>
	</PopupCard>
</dialog>
