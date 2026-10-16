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
		Plus,
		Trash2,
		User,
		UserPlus,
		UserCheck,
		UserRoundX,
		X
	} from '@lucide/svelte';
	import {
		createRegistrar,
		deleteRegistrar,
		resendMagicLink,
		setRegistrarDisabled
	} from '#lib/actions/user.remote.js';

	let { data } = $props();

	const registrars = $derived(data.users);
	let registrarDialog: HTMLDialogElement;
	let registrarForm: HTMLFormElement;
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

	function openRegistrarPopup() {
		if (creating) return;
		registrarForm.reset();
		registrarDialog.showModal();
	}

	async function handleCreateRegistrar(event: SubmitEvent) {
		event.preventDefault();
		if (creating) return;
		creating = true;

		const form = event.currentTarget as HTMLFormElement;
		const formData = new FormData(form);

		const name = formData.get('name')?.toString() ?? '';
		const email = formData.get('email')?.toString() ?? '';

		showLoading();

		try {
			await createRegistrar({
				name,
				email
			});

			registrarDialog.close();
			registrarForm.reset();

			await refreshAll();

			showSuccess('Registrar invitation created successfully');
		} catch (error) {
			showError({
				title: 'Unable to create registrar',
				message: getErrorMessage(error, 'Failed to create registrar. Please try again.')
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
				onclick={openRegistrarPopup}
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
		class="modal-box max-w-lg overflow-y-auto rounded-2xl border border-base-300 bg-base-100 p-0"
	>
		<div class="h-1 bg-primary" aria-hidden="true"></div>
		<form
			bind:this={registrarForm}
			class="space-y-6 p-6 sm:p-8"
			aria-busy={creating}
			onsubmit={handleCreateRegistrar}
		>
			<div class="flex items-start gap-4">
				<div
					class="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
				>
					<UserPlus class="size-7" aria-hidden="true" />
				</div>
				<div class="min-w-0 flex-1">
					<h2 id="new-registrar-title" class="text-lg font-semibold">New Registrar</h2>
					<p id="new-registrar-description" class="mt-1 text-sm text-base-content/60">
						Enter the registrar's name and email address.
					</p>
				</div>
				<button
					type="button"
					class="btn btn-circle btn-ghost btn-sm"
					aria-label="Close new registrar popup"
					disabled={creating}
					onclick={() => registrarDialog.close()}
				>
					<X class="size-4" aria-hidden="true" />
				</button>
			</div>

			<div class="space-y-4">
				<div class="space-y-2">
					<label for="registrar-name" class="text-sm font-semibold">Name</label>
					<div class="input-bordered input flex w-full items-center gap-3 bg-base-200">
						<User class="size-4 shrink-0 text-base-content/50" aria-hidden="true" />
						<input
							id="registrar-name"
							name="name"
							type="text"
							placeholder="Full name"
							autocomplete="name"
							required
							class="min-w-0 grow text-sm"
						/>
					</div>
				</div>
				<div class="space-y-2">
					<label for="registrar-email" class="text-sm font-semibold">Email</label>
					<div class="input-bordered input flex w-full items-center gap-3 bg-base-200">
						<Mail class="size-4 shrink-0 text-base-content/50" aria-hidden="true" />
						<input
							id="registrar-email"
							name="email"
							type="email"
							placeholder="registrar@example.com"
							autocomplete="email"
							required
							class="min-w-0 grow text-sm"
						/>
					</div>
				</div>
			</div>

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
					<button type="submit" disabled={creating} class="btn flex-1 btn-primary">
						<Plus class="size-4" aria-hidden="true" />
						{creating ? 'Creating…' : 'Create Registrar'}
					</button>
				</div>
			</div>
			<p class="text-xs leading-relaxed text-base-content/55">
				An account setup link will be sent to this email. The registrar chooses their own password.
			</p>
		</form>
	</div>
</dialog>
