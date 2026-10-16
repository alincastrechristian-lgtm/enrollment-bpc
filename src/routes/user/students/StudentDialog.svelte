<script lang="ts">
	import { createStudent } from '#lib/actions/user.remote.js';
	import { getErrorMessage } from '#lib/errors.js';
	import { showError, showSuccess } from '#lib/components/Popup/Popup.svelte.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ArrowRight, Clock3, GraduationCap, Mail, UserPlus, X } from '@lucide/svelte';
	let dialog: HTMLDialogElement;
	let name = $state(''),
		email = $state(''),
		address = $state(''),
		contactNumber = $state('');
	let enrollNow = $state(true),
		busy = $state(false),
		savedUserId = $state<string | null>(null);
	export function open() {
		name = '';
		email = '';
		address = '';
		contactNumber = '';
		enrollNow = true;
		savedUserId = null;
		dialog.showModal();
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy || savedUserId) return;
		busy = true;
		try {
			const result = await createStudent({ name, email, address, contactNumber });
			savedUserId = result.userId;
			await goto(
				enrollNow
					? resolve('/user/students/[userId]/enroll', { userId: result.userId })
					: resolve('/user/students/[userId]', { userId: result.userId }),
				{ refreshAll: true }
			);
			dialog.close();
			if (result.invitationSent)
				showSuccess(
					enrollNow ? 'Student created. Continue with enrollment.' : 'Student created successfully.'
				);
			else
				showError(
					'Student created, but the account setup email failed. Resend the setup link from the student record.'
				);
		} catch (cause) {
			showError({
				title: savedUserId ? 'Student created' : 'Unable to create student',
				message: savedUserId
					? 'Student saved. Open their record below to continue.'
					: getErrorMessage(cause, 'Failed to create student. Please try again.')
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
		class="portal-panel modal-box flex max-h-[90dvh] max-w-2xl flex-col overflow-hidden p-0 shadow-xl"
	>
		<div class="h-1.5 shrink-0 bg-primary" aria-hidden="true"></div>
		<header
			class="flex shrink-0 items-start justify-between gap-4 border-b border-base-300 bg-base-200/40 p-5 sm:p-6"
		>
			<div class="flex items-start gap-4">
				<span
					class="grid size-12 shrink-0 place-items-center rounded-2xl border border-primary/15 bg-primary/10 text-primary"
				>
					<UserPlus class="size-6" aria-hidden="true" />
				</span>
				<div>
					<p class="mb-1 text-[10px] font-bold tracking-widest text-primary uppercase">
						Student registration
					</p>
					<h2 id="new-student-title" class="text-xl font-bold tracking-tight">Create student</h2>
					<p
						id="new-student-description"
						class="mt-1.5 max-w-sm text-sm leading-relaxed text-base-content/60"
					>
						Start with their personal details, then choose when to enroll.
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
			<fieldset
				disabled={busy || !!savedUserId}
				class="grid min-h-0 gap-4 overflow-y-auto p-5 sm:grid-cols-2 sm:p-6"
			>
				<div class="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
					<h3 class="text-sm font-bold">Personal details</h3>
					<span class="text-xs text-base-content/45">All fields are required</span>
				</div>
				<label class="space-y-2 sm:col-span-2">
					<span class="text-sm font-semibold">Full name</span>
					<input
						class="input w-full bg-base-200"
						bind:value={name}
						required
						minlength="2"
						maxlength="100"
						autocomplete="name"
						placeholder="e.g. Maria Santos"
					/>
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
				<p
					class="flex items-start gap-2 text-xs leading-relaxed text-base-content/50 sm:col-span-2"
				>
					<Mail class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />The account setup link will be
					sent to this email address.
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
			</fieldset>
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
					<button type="submit" class="btn btn-primary" disabled={busy}>
						{#if busy}
							<span class="loading loading-sm loading-spinner" aria-hidden="true"></span>
						{/if}
						{busy ? 'Creating...' : enrollNow ? 'Create & enroll' : 'Create student'}
						{#if !busy && enrollNow}
							<ArrowRight class="size-4" aria-hidden="true" />
						{/if}
					</button>
				{/if}
			</div>
		</form>
	</div>
</dialog>
