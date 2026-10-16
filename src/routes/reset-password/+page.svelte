<script lang="ts">
	import AuthLayout from '#lib/components/Auth/AuthLayout.svelte';
	import { getErrorMessage } from '#lib/errors.js';
	import { completeFirstLogin, resetPasswordAndSignIn } from '#lib/actions/password.remote.js';
	import { onMount } from 'svelte';
	import { showError, showLoading } from '#lib/components/Popup/Popup.svelte.js';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Check, Eye, EyeOff, LockKeyhole, ShieldCheck } from '@lucide/svelte';

	const token = $derived(page.url.searchParams.get('token'));
	const tokenError = $derived(page.url.searchParams.get('error'));

	onMount(() => {
		if (tokenError || !token) {
			showError(
				'Invalid or missing reset token. Please request a new password reset email.',
				() => {
					window.location.href = '/forgot-password';
				}
			);
		}
	});

	let password = $state('');
	let confirmation = $state('');
	let showPassword = $state(false);
	let showConfirmation = $state(false);
	let submitted = $state(false);
	let busy = $state(false);
	let signedIn = $state(false);

	const longEnough = $derived(password.length >= 8);
	const passwordsMatch = $derived(password.length > 0 && password === confirmation);
	const mismatch = $derived(confirmation.length > 0 && !passwordsMatch);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		if (!signedIn) {
			submitted = true;
			if (tokenError || !token) {
				showError(
					'Invalid or missing reset token. Please request a new password reset email.',
					() => {
						window.location.href = '/forgot-password';
					}
				);
				return;
			}
			if (!longEnough) {
				showError('Use at least 8 characters for your new password.');
				return;
			}
			if (!passwordsMatch) {
				showError('Passwords do not match. Please enter the same password again.');
				return;
			}
		}

		busy = true;
		try {
			if (!signedIn) {
				showLoading('Setting your password and signing in...');
				const result = await resetPasswordAndSignIn({ token: token!, newPassword: password });
				password = '';
				confirmation = '';
				submitted = false;
				showPassword = false;
				showConfirmation = false;
				if (result.status === 'sign-in-required') {
					showError(result.message, () => {
						window.location.href = resolve('/login');
					});
					return;
				}
				signedIn = true;
			}
			showLoading('Completing account setup...');
			await completeFirstLogin();
			window.location.href = '/user/dashboard';
		} catch (error) {
			showError(getErrorMessage(error, 'Failed to update your account. Please try again.'));
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Reset your password | BPC Enrollment Portal</title>
	<meta name="description" content="Reset your BPC Enrollment Portal password." />
</svelte:head>

<AuthLayout
	title="Reset your password"
	description="Choose a new password to regain access to your BPC Enrollment Portal account."
	eyebrow="Account recovery"
>
	<form
		class="space-y-5"
		novalidate
		onsubmit={handleSubmit}
		aria-busy={busy}
		oninput={() => {
			submitted = false;
		}}
	>
		<fieldset disabled={busy || signedIn} class="space-y-5">
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
						{#if showPassword}
							<EyeOff class="size-4" aria-hidden="true" />
						{:else}
							<Eye class="size-4" aria-hidden="true" />
						{/if}
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
				<label for="confirm-password" class="text-sm font-semibold">Confirm new password</label>
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
						aria-label={showConfirmation ? 'Hide confirmed password' : 'Show confirmed password'}
						aria-pressed={showConfirmation}
						onclick={() => (showConfirmation = !showConfirmation)}
					>
						{#if showConfirmation}
							<EyeOff class="size-4" aria-hidden="true" />
						{:else}
							<Eye class="size-4" aria-hidden="true" />
						{/if}
					</button>
				</div>
				<p
					id="confirmation-hint"
					class={`text-xs ${mismatch || (submitted && !passwordsMatch) ? 'text-error' : passwordsMatch ? 'text-primary' : 'text-base-content/60'}`}
					aria-live="polite"
				>
					{#if mismatch || (submitted && !passwordsMatch)}
						Passwords do not match.
					{:else if passwordsMatch}
						Passwords match.
					{:else}
						Enter the same password again.
					{/if}
				</p>
			</div>
		</fieldset>
		<button type="submit" class="btn h-12 w-full btn-primary" disabled={busy}>
			<ShieldCheck class="size-4" aria-hidden="true" />
			{busy ? 'Updating account...' : signedIn ? 'Finish setup' : 'Reset password'}
		</button>
	</form>
	<p class="mt-6 border-t border-base-300 pt-5 text-xs leading-relaxed text-base-content/55">
		Choose a password you do not use elsewhere. Never share it with anyone.
	</p>
</AuthLayout>
