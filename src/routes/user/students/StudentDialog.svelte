<script lang="ts">
	import { createStudent, updateStudent } from '#lib/actions/user.remote.js';
	import type { EditableStudentInformation, StudentInformationSnapshot } from '#lib/students.js';
	import { getErrorMessage } from '#lib/errors.js';
	import {
		formatStudentSex,
		studentSexValues,
		todayInManila,
		type StudentSex
	} from '#lib/student-demographics.js';
	import { showError, showSuccess, showYesNo } from '#lib/components/Popup/Popup.svelte.js';
	import { goto, refreshAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ArrowRight, Clock3, GraduationCap, Mail, Pencil, UserPlus, X } from '@lucide/svelte';
	let dialog: HTMLDialogElement;
	let firstName = $state(''),
		middleName = $state(''),
		lastName = $state(''),
		email = $state(''),
		address = $state(''),
		contactNumber = $state('');
	let birthDate = $state('');
	let sex = $state<StudentSex | ''>('');
	let editingUserId = $state<string | null>(null);
	let original = $state<StudentInformationSnapshot | null>(null);
	const dirty = $derived(
		!original ||
			firstName.trim() !== original.firstName.trim() ||
			middleName.trim() !== original.middleName.trim() ||
			lastName.trim() !== original.lastName.trim() ||
			email.trim().toLowerCase() !== original.email.trim().toLowerCase() ||
			address.trim() !== original.address.trim() ||
			contactNumber.trim() !== original.contactNumber.trim() ||
			(birthDate || null) !== original.birthDate ||
			(sex || null) !== original.sex
	);
	let enrollNow = $state(true),
		busy = $state(false),
		savedUserId = $state<string | null>(null);
	export function open(student?: EditableStudentInformation) {
		if (busy) return;
		editingUserId = student?.userId ?? null;
		original = student
			? {
					name: student.name,
					firstName: student.firstName,
					middleName: student.middleName,
					lastName: student.lastName,
					email: student.email,
					address: student.address,
					contactNumber: student.contactNumber,
					birthDate: student.birthDate,
					sex: student.sex
				}
			: null;
		firstName = student?.firstName ?? '';
		middleName = student?.middleName ?? '';
		lastName = student?.lastName ?? '';
		email = student?.email ?? '';
		address = student?.address ?? '';
		contactNumber = student?.contactNumber ?? '';
		birthDate = student?.birthDate ?? '';
		sex = student?.sex ?? '';
		enrollNow = true;
		savedUserId = null;
		dialog.showModal();
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy || savedUserId || !dirty || !birthDate || !sex) return;
		busy = true;
		const fields = {
			firstName,
			middleName,
			lastName,
			email,
			address,
			contactNumber,
			birthDate,
			sex
		};
		let invitationSent = true;
		const invitationWarning = {
			tone: 'warning' as const,
			title: 'Student account created; email not sent',
			message:
				'The student account was created successfully, but the account setup email could not be sent.',
			hintText:
				'Do not create the account again. Open the student record and use Resend setup link to try again.'
		};
		try {
			if (editingUserId && original) {
				const emailChanged = email.trim().toLowerCase() !== original.email.trim().toLowerCase();
				if (
					emailChanged &&
					!(await showYesNo({
						title: 'Change student email?',
						message:
							'This changes the student’s sign-in email and signs them out of all sessions. Existing account setup and password reset links will stop working. Email verification will be reset. No new setup email will be sent automatically.',
						warning: true,
						yesText: 'Save changes',
						noText: 'Cancel'
					}))
				)
					return;
				const result = await updateStudent({
					userId: editingUserId,
					...fields,
					original: { ...original }
				});
				savedUserId = result.userId;
				dialog.close();
				await refreshAll();
				showSuccess('Student information updated successfully.');
				return;
			}
			const result = await createStudent(fields);
			savedUserId = result.userId;
			invitationSent = result.invitationSent;
			// Navigation can destroy this component and clear its dialog binding.
			dialog.close();
			await goto(
				enrollNow
					? resolve('/user/students/[userId]/enroll', { userId: result.userId })
					: resolve('/user/students/[userId]', { userId: result.userId }),
				{ refreshAll: true }
			);
			if (invitationSent)
				showSuccess(
					enrollNow ? 'Student created. Continue with enrollment.' : 'Student created successfully.'
				);
			else showError(invitationWarning);
		} catch (cause) {
			// Keep the saved-record link available if navigation leaves this page mounted.
			if (savedUserId && !editingUserId && dialog?.isConnected) dialog.showModal();
			if (savedUserId && !editingUserId && !invitationSent) {
				showError({
					...invitationWarning,
					hintText:
						'The page could not open. Use View student below to open the saved account, then Resend setup link. Do not create the account again.'
				});
				return;
			}
			showError({
				title: savedUserId
					? editingUserId
						? 'Student updated'
						: 'Student created'
					: editingUserId
						? 'Unable to update student'
						: 'Unable to create student',
				message: savedUserId
					? editingUserId
						? 'Changes saved, but the page could not refresh. Reload the student record to see the latest information.'
						: 'Student saved. Open their record below to continue.'
					: getErrorMessage(
							cause,
							editingUserId
								? 'Failed to update student. Please try again.'
								: 'Failed to create student. Please try again.'
						)
			});
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="modal"
	aria-labelledby="new-student-title"
	aria-describedby="new-student-description"
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
>
	<div
		class="portal-panel popup-accent-panel modal-box flex max-h-[90dvh] max-w-2xl flex-col overflow-hidden p-0 shadow-xl"
	>
		<header
			class="flex shrink-0 items-start justify-between gap-4 border-b border-base-300 bg-base-200/40 p-5 sm:p-6"
		>
			<div class="flex items-start gap-4">
				<span
					class="grid size-12 shrink-0 place-items-center rounded-2xl border border-primary/15 bg-primary/10 text-primary"
				>
					{#if editingUserId}
						<Pencil class="size-6" aria-hidden="true" />
					{:else}
						<UserPlus class="size-6" aria-hidden="true" />
					{/if}
				</span>
				<div>
					<p class="mb-1 text-[10px] font-bold tracking-widest text-primary uppercase">
						{editingUserId ? 'Student record' : 'Student registration'}
					</p>
					<h2 id="new-student-title" class="text-xl font-bold tracking-tight">
						{editingUserId ? 'Edit student' : 'Create student'}
					</h2>
					<p
						id="new-student-description"
						class="mt-1.5 max-w-sm text-sm leading-relaxed text-base-content/60"
					>
						{editingUserId
							? 'Update personal details and account contact information.'
							: 'Start with their personal details, then choose when to enroll.'}
					</p>
				</div>
			</div>
			<button
				type="button"
				class="btn btn-square btn-ghost btn-sm"
				aria-label="Close"
				disabled={busy}
				onclick={() => dialog.close()}
			>
				<X class="size-4" aria-hidden="true" />
			</button>
		</header>
		<form onsubmit={save} class="flex min-h-0 flex-col" aria-busy={busy}>
			<div class="min-h-0 flex-1 overflow-y-auto">
				<fieldset
					disabled={busy || !!savedUserId}
					class="grid min-w-0 gap-4 p-5 sm:grid-cols-2 sm:p-6"
				>
					<div class="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
						<h3 class="text-sm font-bold">Personal details</h3>
						<span class="text-xs text-base-content/45">Required unless marked optional</span>
					</div>
					<label class="space-y-2">
						<span class="text-sm font-semibold">First name</span>
						<input
							class="input w-full bg-base-200"
							bind:value={firstName}
							required
							maxlength="100"
							autocomplete="given-name"
							placeholder="e.g. Maria"
						/>
					</label>
					<label class="space-y-2">
						<span class="text-sm font-semibold">
							Middle name <span class="font-normal text-base-content/50">(optional)</span>
						</span>
						<input
							class="input w-full bg-base-200"
							bind:value={middleName}
							maxlength="100"
							autocomplete="additional-name"
							placeholder="Middle name"
						/>
					</label>
					<label class="space-y-2 sm:col-span-2">
						<span class="text-sm font-semibold">Last name</span>
						<input
							class="input w-full bg-base-200"
							bind:value={lastName}
							required
							maxlength="100"
							autocomplete="family-name"
							placeholder="e.g. Santos"
						/>
					</label>
					<label class="space-y-2">
						<span class="text-sm font-semibold">Birth date</span>
						<input
							class="input w-full bg-base-200"
							type="date"
							required
							bind:value={birthDate}
							max={todayInManila()}
							autocomplete="bday"
						/>
					</label>
					<label class="space-y-2">
						<span class="text-sm font-semibold">Sex</span>
						<select class="select w-full bg-base-200" bind:value={sex} required>
							<option value="">Choose sex</option>
							{#each studentSexValues as value (value)}
								<option {value}>{formatStudentSex(value)}</option>
							{/each}
						</select>
					</label>
					<label class="space-y-2">
						<span class="text-sm font-semibold">Email</span>
						<input
							class="input w-full bg-base-200"
							type="email"
							bind:value={email}
							required
							autocomplete="email"
							placeholder="student@example.com"
						/>
					</label>
					<label class="space-y-2">
						<span class="text-sm font-semibold">Contact number</span>
						<input
							class="input w-full bg-base-200"
							type="tel"
							bind:value={contactNumber}
							required
							maxlength="30"
							autocomplete="tel"
							placeholder="e.g. 0917 123 4567"
						/>
					</label>
					<label class="space-y-2 sm:col-span-2">
						<span class="text-sm font-semibold">Address</span>
						<textarea
							class="textarea min-h-22 w-full resize-y bg-base-200"
							bind:value={address}
							required
							maxlength="500"
							rows="2"
							placeholder="House / street, barangay, city or municipality, province"
							autocomplete="street-address"></textarea>
					</label>
					{#if !editingUserId}
						<p
							class="flex items-start gap-2 text-xs leading-relaxed text-base-content/50 sm:col-span-2"
						>
							<Mail class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />The account setup link
							will be sent to this email address.
						</p>
						<div class="mt-1 border-t border-base-300 pt-5 sm:col-span-2">
							<h3 class="text-sm font-bold">What happens next?</h3>
							<p class="mt-1 text-xs text-base-content/50">
								The student account is saved with either option.
							</p>
							<div class="mt-4 grid gap-3 sm:grid-cols-2">
								<label
									class={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-primary/30 ${enrollNow ? 'border-primary/40 bg-primary/5' : 'border-base-300 bg-base-100 hover:bg-base-200/50'}`}
								>
									<input
										type="radio"
										class="radio mt-0.5 radio-sm radio-primary"
										bind:group={enrollNow}
										value={true}
									/>
									<span>
										<span class="flex items-center gap-2 text-sm font-bold">
											<GraduationCap class="size-4 text-primary" aria-hidden="true" />Enroll now
										</span>
										<span class="mt-1.5 block text-xs leading-relaxed text-base-content/55">
											Choose a program, term, section, and subjects next.
										</span>
									</span>
								</label>
								<label
									class={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-primary/30 ${!enrollNow ? 'border-primary/40 bg-primary/5' : 'border-base-300 bg-base-100 hover:bg-base-200/50'}`}
								>
									<input
										type="radio"
										class="radio mt-0.5 radio-sm radio-primary"
										bind:group={enrollNow}
										value={false}
									/>
									<span>
										<span class="flex items-center gap-2 text-sm font-bold">
											<Clock3 class="size-4 text-base-content/55" aria-hidden="true" />Enroll later
										</span>
										<span class="mt-1.5 block text-xs leading-relaxed text-base-content/55">
											Open their record and enroll when ready.
										</span>
									</span>
								</label>
							</div>
						</div>
					{/if}
				</fieldset>
			</div>
			<div
				class="flex shrink-0 flex-col-reverse gap-3 border-t border-base-300 bg-base-200/30 p-5 sm:flex-row sm:justify-end sm:px-6 sm:py-4"
			>
				{#if savedUserId}
					<a
						class="btn btn-primary"
						href={resolve('/user/students/[userId]', { userId: savedUserId })}
					>
						View student
					</a>
				{:else}
					<button
						type="button"
						class="btn btn-ghost"
						disabled={busy}
						onclick={() => dialog.close()}
					>
						Cancel
					</button>
					<button type="submit" class="btn btn-primary" disabled={busy || !dirty}>
						{#if busy}
							<span class="loading loading-sm loading-spinner" aria-hidden="true"></span>
						{/if}
						{busy
							? editingUserId
								? 'Saving...'
								: 'Creating...'
							: editingUserId
								? 'Save changes'
								: enrollNow
									? 'Create & enroll'
									: 'Create student'}
						{#if !busy && !editingUserId && enrollNow}
							<ArrowRight class="size-4" aria-hidden="true" />
						{/if}
					</button>
				{/if}
			</div>
		</form>
	</div>
</dialog>
