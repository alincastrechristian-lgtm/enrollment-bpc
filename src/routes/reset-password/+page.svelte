<script lang="ts">
	import { authClient } from '#lib/auth-client.js';
	import { showError, showLoading } from '#lib/components/Popup/Popup.svelte.js';
	import { page } from '$app/state';
	import { Check, Eye, EyeOff, LockKeyhole, ShieldCheck } from '@lucide/svelte';

	const token = page.url.searchParams.get('token');
	const error = page.url.searchParams.get('error');

	if (error || !token) {
		showError('Invalid or missing reset token, Please try requesting a new one.', () => {
			window.location.href = '/';
		});
	}

	let password = $state('');
	let confirmation = $state('');
	let showPassword = $state(false);
	let showConfirmation = $state(false);
	let submitted = $state(false);

	const longEnough = $derived(password.length >= 8);
	const passwordsMatch = $derived(password.length > 0 && password === confirmation);
	const mismatch = $derived(confirmation.length > 0 && !passwordsMatch);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!token) {
			showError('Missing reset token. Please try requesting a new one.', () => {
				window.location.href = '/';
			});
			return;
		}

		submitted = true;

		if (!longEnough) {
			showError('Use at least 8 characters for your new password.');
			return;
		}
		if (!passwordsMatch) {
			showError('Passwords do not match. Please enter the same password again.');
			return;
		}

		showLoading('Checking your new password...');

		const { error } = await authClient.resetPassword({
			newPassword: password,
			token
		});

		if (error) {
			showError(error.message || 'Failed to reset password. Please try again.', () => {
				window.location.href = '/forgot-password';
			});
			return;
		}

		window.location.href = '/';
	}
</script>

<svelte:head>
	<title>Reset your password | BPC Enrollment Portal</title>
	<meta name="description" content="Reset your BPC Enrollment Portal password." />
</svelte:head>

<div class="flex min-h-dvh bg-base-200">
	<aside
		class="hidden w-80 shrink-0 flex-col justify-between bg-neutral p-10 text-neutral-content lg:flex xl:w-105 xl:p-14"
	>
		<div class="space-y-10">
			<div
				class="flex size-24 items-center justify-center rounded-full bg-primary text-4xl font-bold tracking-wide text-primary-content"
			>
				BPC
			</div>
			<div class="space-y-4">
				<h2 class="text-4xl font-black tracking-tight text-primary-content uppercase xl:text-5xl">
					Bulacan Polytechnic College
				</h2>
				<p class="text-sm tracking-widest text-neutral-content/70 uppercase">
					College Enrollment System
				</p>
			</div>
		</div>
		<div class="mt-12 rounded-2xl border border-neutral-content/20 p-6">
			<ShieldCheck class="mb-4 size-8 text-primary-content" aria-hidden="true" />
			<p class="font-semibold">Secure account recovery</p>
			<p class="mt-2 text-sm leading-relaxed text-neutral-content/70">
				Your password helps keep your account and enrollment information protected.
			</p>
		</div>
	</aside>

	<main class="flex min-w-0 flex-1 items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
		<div class="w-full max-w-xl space-y-6">
			<header class="flex items-center gap-3 lg:hidden">
				<div
					class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-content"
				>
					BPC
				</div>
				<div>
					<p class="text-sm font-bold">Bulacan Polytechnic College</p>
					<p class="text-xs text-base-content/60">College Enrollment System</p>
				</div>
			</header>

			<section
				class="card rounded-3xl border border-base-300 bg-base-100 shadow-sm"
				aria-labelledby="password-title"
			>
				<div class="card-body gap-6 p-6 sm:p-10">
					<div>
						<div
							class="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"
						>
							<LockKeyhole class="size-7" aria-hidden="true" />
						</div>
						<p class="mb-2 text-xs font-bold tracking-widest text-primary uppercase">
							Account recovery
						</p>
						<h1
							id="password-title"
							class="text-3xl font-extrabold tracking-tight text-base-content"
						>
							Reset your password
						</h1>
						<p class="mt-3 text-sm leading-relaxed text-base-content/60">
							Choose a new password to regain access to your BPC Enrollment Portal account.
						</p>
					</div>

					<form
						class="space-y-5"
						novalidate
						onsubmit={handleSubmit}
						oninput={() => {
							submitted = false;
						}}
					>
						<div class="space-y-2">
							<label for="new-password" class="text-sm font-semibold">New password</label>
							<div class="input flex h-12 w-full items-center gap-3 border-base-300 bg-base-200">
								<LockKeyhole class="size-4 shrink-0 text-base-content/50" aria-hidden="true" />
								<input
									id="new-password"
									name="newPassword"
									type={showPassword ? 'text' : 'password'}
									bind:value={password}
									autocomplete="new-password"
									placeholder="Enter your new password"
									required
									minlength={8}
									aria-describedby="password-hint"
									class="min-w-0 grow text-sm"
								/>
								<button
									type="button"
									class="btn btn-square btn-ghost btn-sm"
									aria-label={showPassword ? 'Hide new password' : 'Show new password'}
									aria-pressed={showPassword}
									onclick={() => (showPassword = !showPassword)}
								>
									{#if showPassword}<EyeOff class="size-4" aria-hidden="true" />{:else}<Eye
											class="size-4"
											aria-hidden="true"
										/>{/if}
								</button>
							</div>
							<p id="password-hint" class="flex items-center gap-2 text-xs text-base-content/60">
								<Check
									class={longEnough ? 'size-3.5 text-primary' : 'size-3.5 text-base-content/30'}
									aria-hidden="true"
								/>
								Use at least 8 characters.
							</p>
						</div>

						<div class="space-y-2">
							<label for="confirm-password" class="text-sm font-semibold"
								>Confirm new password</label
							>
							<div
								class="input flex h-12 w-full items-center gap-3 border-base-300 bg-base-200"
								class:input-error={mismatch || (submitted && !passwordsMatch)}
							>
								<LockKeyhole class="size-4 shrink-0 text-base-content/50" aria-hidden="true" />
								<input
									id="confirm-password"
									name="confirmPassword"
									type={showConfirmation ? 'text' : 'password'}
									bind:value={confirmation}
									autocomplete="new-password"
									placeholder="Re-enter your new password"
									required
									minlength={8}
									aria-invalid={mismatch || (submitted && !passwordsMatch)}
									aria-describedby="confirmation-hint"
									class="min-w-0 grow text-sm"
								/>
								<button
									type="button"
									class="btn btn-square btn-ghost btn-sm"
									aria-label={showConfirmation
										? 'Hide confirmed password'
										: 'Show confirmed password'}
									aria-pressed={showConfirmation}
									onclick={() => (showConfirmation = !showConfirmation)}
								>
									{#if showConfirmation}<EyeOff class="size-4" aria-hidden="true" />{:else}<Eye
											class="size-4"
											aria-hidden="true"
										/>{/if}
								</button>
							</div>
							<p
								id="confirmation-hint"
								class={`text-xs ${mismatch || (submitted && !passwordsMatch) ? 'text-error' : passwordsMatch ? 'text-primary' : 'text-base-content/60'}`}
								aria-live="polite"
							>
								{#if mismatch || (submitted && !passwordsMatch)}Passwords do not match.{:else if passwordsMatch}Passwords
									match.{:else}Enter the same password again.{/if}
							</p>
						</div>

						<button type="submit" class="btn h-12 w-full btn-primary">
							<ShieldCheck class="size-4" aria-hidden="true" />
							Reset password
						</button>
					</form>

					<p class="border-t border-base-300 pt-5 text-xs leading-relaxed text-base-content/60">
						Choose a password you do not use elsewhere. Never share it with anyone.
					</p>
				</div>
			</section>
			<p class="text-center text-xs text-base-content/50">BPC Enrollment Portal</p>
		</div>
	</main>
</div>
