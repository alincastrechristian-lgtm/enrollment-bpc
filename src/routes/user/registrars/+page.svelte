<script lang="ts">
	import Dropdown from '#lib/components/Dropdown/Dropdown.svelte';
	import { showError, showLoading, showSuccess } from '#lib/components/Popup/Popup.svelte.js';
	import PopupCard from '#lib/components/Popup/PopupCard.svelte';
	import CatalogPage from '#lib/components/Catalog/CatalogPage.svelte';
	import CatalogToolbar from '#lib/components/Catalog/CatalogToolbar.svelte';
	import { filterUserSchema } from '#lib/schema.js';
	import { refreshAll } from '$app/navigation';
	import {
		Eye,
		Mail,
		MailCheck,
		Pencil,
		Plus,
		Settings,
		Trash2,
		User,
		UserPlus,
		X
	} from '@lucide/svelte';
	import { createRegistrar, resendMagicLink } from '../../../lib/actions/user.remote.js';

	let { data } = $props();

	const registrars = $derived(data.users);
	let registrarDialog: HTMLDialogElement;
	let registrarForm: HTMLFormElement;

	function openRegistrarPopup() {
		registrarForm.reset();
		registrarDialog.showModal();
	}

	async function handleCreateRegistrar(event: SubmitEvent) {
		event.preventDefault();

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
			showError(error instanceof Error ? error.message : 'Failed to create registrar');
		}
	}

	async function resend(email: string) {
		showLoading();

		await resendMagicLink({ email })
			.then(() => {
				showSuccess('Verification email sent successfully');
			})
			.catch((error) => {
				showError(error?.message ?? 'Failed to send verification email');
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
			<td class="pr-5">
				<div class="flex justify-end pr-2">
					<Dropdown id={`registrar-${registrar.id}`} label={`Actions for ${registrar.name}`}>
						{#snippet trigger()}
							<Settings class="h-4 w-4" />
						{/snippet}

						<ul class="menu w-full p-0">
							<li>
								<a href="/user/registrars/view">
									<Eye class="h-4 w-4" />
									View
								</a>
							</li>

							<li>
								<button type="button">
									<Pencil class="h-4 w-4" />
									Edit
								</button>
							</li>

							{#if !registrar.setupComplete}
								<li>
									<button type="button" onclick={() => resend(registrar.email)}>
										<MailCheck class="h-4 w-4" />
										Resend verification
									</button>
								</li>
							{/if}

							<li class="text-error">
								<button type="button">
									<Trash2 class="h-4 w-4" />
									Delete
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
	class="z-0"
	aria-labelledby="new-registrar-title"
	aria-describedby="new-registrar-description"
>
	<PopupCard onClose={() => registrarDialog.close()}>
		<form bind:this={registrarForm} class="card-body gap-6 p-6" onsubmit={handleCreateRegistrar}>
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
						onclick={() => registrarDialog.close()}>Cancel</button
					>
					<button
						type="submit"
						class="btn flex-1 btn-primary"
						aria-describedby="registrar-submit-hint"
					>
						<Plus class="size-4" aria-hidden="true" />
						Create Registrar
					</button>
				</div>
			</div>
		</form>
	</PopupCard>
</dialog>
