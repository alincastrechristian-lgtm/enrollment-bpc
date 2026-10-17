<script lang="ts">
	import {
		showError,
		showLoading,
		showSuccess,
		showYesNo
	} from '#lib/components/Popup/Popup.svelte.js';

	import CatalogPage from '#lib/components/Catalog/CatalogPage.svelte';
	import CatalogToolbar from '#lib/components/Catalog/CatalogToolbar.svelte';
	import Dropdown from '#lib/components/Dropdown/Dropdown.svelte';
	import RevokeSessionsAction from '#lib/components/RevokeSessionsAction.svelte';
	import { filterUserSchema } from '#lib/schema.js';
	import { getErrorMessage } from '#lib/errors.js';
	import { refreshAll } from '$app/navigation';
	import {
		Ellipsis,
		Mail,
		MailCheck,
		Pencil,
		Plus,
		Trash2,
		UserPlus,
		UserCheck,
		UserRoundX,
		X
	} from '@lucide/svelte';
	import {
		createRegistrar,
		updateRegistrar,
		deleteRegistrar,
		resendMagicLink,
		setRegistrarDisabled
	} from '#lib/actions/user.remote.js';

	let { data } = $props();

	const registrars = $derived(data.users);
	let registrarDialog: HTMLDialogElement;
	type RegistrarInformation = {
		name: string;
		firstName: string;
		middleName: string;
		lastName: string;
		email: string;
	};
	let editingRegistrarId = $state<string | null>(null);
	let original = $state<RegistrarInformation | null>(null);
	let firstName = $state(''),
		middleName = $state(''),
		lastName = $state(''),
		email = $state('');
	let saved = $state(false);
	const dirty = $derived(
		!original ||
			firstName.trim() !== original.firstName.trim() ||
			middleName.trim() !== original.middleName.trim() ||
			lastName.trim() !== original.lastName.trim() ||
			email.trim().toLowerCase() !== original.email.trim().toLowerCase()
	);
	let creating = $state(false);
	let resendingEmail = $state<string | null>(null);
	let changingAccess = $state(false);
	let deleting = $state(false);

	async function removeRegistrar(registrar: { id: string; name: string }) {
		if (deleting || changingAccess || resendingEmail) return;
		deleting = true;
		let deleted = false;
		try {
			if (
				!(await showYesNo({
					title: 'Delete registrar account?',
					message: `Permanently delete ${registrar.name}'s account? They will be signed out and lose access. Student enrollments, subjects, grades, and notifications will be kept.`,
					warning: true,
					hintText: 'This cannot be undone. Use Disable account to suspend access temporarily.',
					yesText: 'Delete account',
					noText: 'Cancel'
				}))
			)
				return;
			showLoading('Deleting registrar...');
			await deleteRegistrar({ userId: registrar.id });
			deleted = true;
			await refreshAll();
			showSuccess('Registrar account deleted.');
		} catch (cause) {
			showError(
				getErrorMessage(
					cause,
					deleted
						? 'Registrar deleted. Refresh the list to continue.'
						: 'Failed to delete registrar. Please try again.'
				)
			);
		} finally {
			deleting = false;
		}
	}

	async function changeAccess(registrar: { id: string; name: string; banned: boolean | null }) {
		if (deleting || changingAccess || resendingEmail) return;
		changingAccess = true;
		const disabled = !registrar.banned;
		let updated = false;
		try {
			if (
				!(await showYesNo({
					title: disabled ? 'Disable registrar account?' : 'Enable registrar account?',
					message: disabled
						? `Disable ${registrar.name}'s access? They will be signed out and cannot sign in until re-enabled. Their account and activity history will be kept.`
						: `Restore ${registrar.name}'s access? They can sign in again.`,
					warning: disabled,
					hintText: disabled ? 'You can enable this account again at any time.' : '',
					yesText: disabled ? 'Disable account' : 'Enable account',
					noText: 'Cancel'
				}))
			)
				return;
			showLoading(disabled ? 'Disabling registrar...' : 'Enabling registrar...');
			await setRegistrarDisabled({ userId: registrar.id, disabled });
			updated = true;
			await refreshAll();
			showSuccess(disabled ? 'Registrar account disabled.' : 'Registrar account enabled.');
		} catch (cause) {
			showError(
				getErrorMessage(
					cause,
					updated
						? 'Registrar access updated. Refresh the list to continue.'
						: 'Failed to update registrar access. Please try again.'
				)
			);
		} finally {
			changingAccess = false;
		}
	}

	function openRegistrarPopup(registrar?: RegistrarInformation & { id: string }) {
		if (creating || deleting || changingAccess || resendingEmail) return;
		editingRegistrarId = registrar?.id ?? null;
		original = registrar
			? {
					name: registrar.name,
					firstName: registrar.firstName,
					middleName: registrar.middleName,
					lastName: registrar.lastName,
					email: registrar.email
				}
			: null;
		firstName = registrar?.firstName ?? '';
		middleName = registrar?.middleName ?? '';
		lastName = registrar?.lastName ?? '';
		email = registrar?.email ?? '';
		saved = false;
		registrarDialog.showModal();
	}

	async function saveRegistrar(event: SubmitEvent) {
		event.preventDefault();
		if (creating || saved || !dirty) return;
		creating = true;
		const fields = { firstName, middleName, lastName, email };
		let invitationSent = true;
		const invitationWarning = {
			tone: 'warning' as const,
			title: 'Registrar account created; email not sent',
			message:
				'The registrar account was created successfully, but the account setup email could not be sent.',
			hintText:
				'Do not create the account again. Use Resend setup link from the account actions to try again.'
		};
		try {
			if (editingRegistrarId && original) {
				if (
					email.trim().toLowerCase() !== original.email.trim().toLowerCase() &&
					!(await showYesNo({
						title: 'Change registrar email?',
						message:
							'This changes the registrar’s sign-in email and signs them out of all sessions. Existing account setup and password reset links will stop working. Email verification will be reset. No new setup email will be sent automatically.',
						warning: true,
						yesText: 'Save changes',
						noText: 'Cancel'
					}))
				)
					return;
				await updateRegistrar({ userId: editingRegistrarId, ...fields, original: { ...original } });
			} else {
				const result = await createRegistrar(fields);
				invitationSent = result.invitationSent;
			}
			saved = true;
			registrarDialog.close();
			await refreshAll();
			if (!invitationSent) {
				showError(invitationWarning);
				return;
			}
			showSuccess(
				editingRegistrarId
					? 'Registrar information updated successfully.'
					: 'Registrar invitation created successfully'
			);
		} catch (cause) {
			if (saved && !invitationSent) {
				showError({
					...invitationWarning,
					hintText:
						'The list could not refresh. Reload the page to find the saved account, then use Resend setup link. Do not create the account again.'
				});
				return;
			}
			showError({
				title: saved
					? 'Registrar saved'
					: editingRegistrarId
						? 'Unable to update registrar'
						: 'Unable to create registrar',
				message: saved
					? 'Registrar saved, but the list could not refresh. Reload the page to see the latest information.'
					: getErrorMessage(
							cause,
							editingRegistrarId
								? 'Failed to update registrar. Please try again.'
								: 'Failed to create registrar. Please try again.'
						)
			});
		} finally {
			creating = false;
		}
	}

	async function resend(email: string) {
		if (deleting || resendingEmail || changingAccess) return;
		resendingEmail = email;
		showLoading();

		await resendMagicLink({ email })
			.then(() => {
				showSuccess('Verification email sent successfully');
			})
			.catch((error) => {
				showError(getErrorMessage(error, 'Failed to send verification email'));
			})
			.finally(() => {
				resendingEmail = null;
			});
	}
</script>

<CatalogPage
	title="Registrars"
	description="Manage and maintain registrar accounts and access"
	total={data.total}
	itemLabel="registrars"
>
	{#snippet toolbar()}
		<CatalogToolbar
			search={data.search}
			placeholder="Search by name, account ID or email..."
			searchLabel="Search registrars"
			filterSchema={filterUserSchema}
			filters={data.filters}
		>
			<button
				type="button"
				class="btn gap-2 bg-primary text-primary-content btn-sm hover:bg-primary/80"
				onclick={() => openRegistrarPopup()}
			>
				<Plus class="h-4 w-4" />
				New Registrar
			</button>
		</CatalogToolbar>
	{/snippet}
	{#snippet header()}
		<tr
			class="border-b border-base-300 bg-base-200 text-[11px] font-extrabold tracking-wider text-base-content/60 uppercase"
		>
			<th class="py-4 pl-5">Registrar</th>
			<th>Verification</th>
			<th>Access</th>
			<th class="pr-5 text-right">Actions</th>
		</tr>
	{/snippet}

	{#each registrars as registrar (registrar.id)}
		<tr class="border-b border-base-200 transition-colors last:border-0 hover:bg-base-200/80">
			<!-- Registrar -->
			<td class="py-4 pl-5">
				<div class="flex items-center gap-3">
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary"
					>
						{registrar.name.charAt(0)}
					</div>

					<div class="min-w-0">
						<p class="truncate font-bold text-base-content">
							{registrar.name}
						</p>

						<p class="mt-0.5 text-xs text-base-content/50">
							{registrar.email}
						</p>
					</div>
				</div>
			</td>

			<!-- Verification -->
			<td>
				<span
					class={`badge gap-1.5 border-none px-3 font-bold ${
						registrar.setupComplete ? 'badge-success' : 'badge-warning'
					}`}
				>
					<span class="h-1.5 w-1.5 rounded-full bg-current"></span>

					{registrar.setupComplete ? 'Verified' : 'Setup required'}
				</span>
			</td>

			<!-- Actions -->
			<td>
				<span class={`badge badge-sm ${registrar.banned ? 'badge-error' : 'badge-success'}`}>
					{registrar.banned ? 'Disabled' : 'Enabled'}
				</span>
			</td>
			<td class="pr-5">
				<div class="flex justify-end pr-2">
					<Dropdown id={`registrar-${registrar.id}`} label={`Actions for ${registrar.name}`}>
						{#snippet trigger()}
							<Ellipsis class="size-4" aria-hidden="true" />
						{/snippet}
						<ul class="menu w-full p-0">
							<li>
								<button
									type="button"
									disabled={creating || deleting || changingAccess || !!resendingEmail}
									onclick={() => openRegistrarPopup(registrar)}
								>
									<Pencil class="size-4" aria-hidden="true" />Edit registrar
								</button>
							</li>
							{#if !registrar.setupComplete && !registrar.banned}
								<li>
									<button
										type="button"
										disabled={deleting || changingAccess || !!resendingEmail}
										onclick={() => resend(registrar.email)}
									>
										<MailCheck class="size-4" aria-hidden="true" />{resendingEmail ===
										registrar.email
											? 'Sending…'
											: 'Resend setup link'}
									</button>
								</li>
							{/if}
							<li>
								<RevokeSessionsAction
									userId={registrar.id}
									name={registrar.name}
									disabled={deleting || changingAccess || !!resendingEmail}
								/>
							</li>
							<li class={registrar.banned ? 'text-success' : 'text-error'}>
								<button
									type="button"
									disabled={deleting || changingAccess || !!resendingEmail}
									onclick={() => changeAccess(registrar)}
								>
									{#if registrar.banned}
										<UserCheck class="size-4" aria-hidden="true" />Enable account
									{:else}
										<UserRoundX class="size-4" aria-hidden="true" />Disable account
									{/if}
								</button>
							</li>
							<li class="text-error">
								<button
									type="button"
									disabled={deleting || changingAccess || !!resendingEmail}
									onclick={() => removeRegistrar(registrar)}
								>
									<Trash2 class="size-4" aria-hidden="true" />Delete account
								</button>
							</li>
						</ul>
					</Dropdown>
				</div>
			</td>
		</tr>
	{/each}
</CatalogPage>

<dialog
	bind:this={registrarDialog}
	class="modal"
	oncancel={(event) => {
		if (creating) event.preventDefault();
	}}
	aria-labelledby="new-registrar-title"
	aria-describedby="new-registrar-description"
>
	<div
		class="popup-accent-panel modal-box max-w-lg overflow-y-auto rounded-2xl p-0"
		style:--popup-accent-height="0.25rem"
	>
		<form class="space-y-6 p-6 sm:p-8" aria-busy={creating} onsubmit={saveRegistrar}>
			<div class="flex items-start gap-4">
				<div
					class="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
				>
					{#if editingRegistrarId}
						<Pencil class="size-7" aria-hidden="true" />
					{:else}
						<UserPlus class="size-7" aria-hidden="true" />
					{/if}
				</div>
				<div class="min-w-0 flex-1">
					<h2 id="new-registrar-title" class="text-lg font-semibold">
						{editingRegistrarId ? 'Edit registrar' : 'New registrar'}
					</h2>
					<p id="new-registrar-description" class="mt-1 text-sm text-base-content/60">
						{editingRegistrarId
							? 'Update the registrar’s personal details and sign-in email.'
							: 'Enter the registrar’s name and email address.'}
					</p>
				</div>
				<button
					type="button"
					class="btn btn-circle btn-ghost btn-sm"
					aria-label="Close registrar dialog"
					disabled={creating}
					onclick={() => registrarDialog.close()}
				>
					<X class="size-4" aria-hidden="true" />
				</button>
			</div>

			<fieldset class="grid gap-4 sm:grid-cols-2" disabled={creating || saved}>
				<label class="space-y-2">
					<span class="text-sm font-semibold">First name</span>
					<input
						class="input w-full bg-base-200"
						bind:value={firstName}
						required
						maxlength="100"
						autocomplete="given-name"
						placeholder="First name"
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
						placeholder="Last name"
					/>
				</label>
				<div class="space-y-2 sm:col-span-2">
					<label for="registrar-email" class="text-sm font-semibold">Email</label>
					<div class="input-bordered input flex w-full items-center gap-3 bg-base-200">
						<Mail class="size-4 shrink-0 text-base-content/50" aria-hidden="true" />
						<input
							id="registrar-email"
							name="email"
							bind:value={email}
							type="email"
							placeholder="registrar@example.com"
							autocomplete="email"
							required
							class="min-w-0 grow text-sm"
						/>
					</div>
				</div>
			</fieldset>

			<div class="space-y-3">
				<div class="flex flex-col-reverse gap-2 sm:flex-row">
					<button
						type="button"
						class="btn flex-1 border-base-300 btn-outline"
						disabled={creating}
						onclick={() => registrarDialog.close()}
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={creating || saved || !dirty}
						class="btn flex-1 btn-primary"
					>
						{#if creating}
							<span class="loading loading-xs loading-spinner" aria-hidden="true"></span>
						{:else if !editingRegistrarId}
							<Plus class="size-4" aria-hidden="true" />
						{/if}
						{creating
							? editingRegistrarId
								? 'Saving…'
								: 'Creating…'
							: editingRegistrarId
								? 'Save changes'
								: 'Create registrar'}
					</button>
				</div>
			</div>
			{#if !editingRegistrarId}
				<p class="text-xs leading-relaxed text-base-content/55">
					An account setup link will be sent to this email. The registrar chooses their own
					password.
				</p>
			{/if}
		</form>
	</div>
</dialog>
