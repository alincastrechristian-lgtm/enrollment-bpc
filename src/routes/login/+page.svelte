<script lang="ts">
	import { authClient } from '#lib/auth-client.js';
	import AuthLayout from '#lib/components/Auth/AuthLayout.svelte';
	import { showError } from '#lib/components/Popup/Popup.svelte.js';
	import { getAuthErrorMessage, getErrorMessage } from '#lib/errors.js';
	import { resolve } from '$app/paths';
	import { Eye, EyeOff } from '@lucide/svelte';

	let showPassword = $state(false);
	let busy = $state(false);
	let verifying = $state(false);
	let useRecoveryCode = $state(false);
	let code = $state('');

	async function verifyFactor(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		try {
			const result = useRecoveryCode
				? await authClient.twoFactor.verifyBackupCode({ code: code.trim(), trustDevice: false })
				: await authClient.twoFactor.verifyTotp({ code: code.trim(), trustDevice: false });
			if (result.error) {
				showError(
					getAuthErrorMessage(result.error, 'Could not verify code. Try again or sign in again.')
				);
				return;
			}
			window.location.href = resolve('/user/dashboard');
		} catch {
			showError('Could not verify code. Please try again.');
		} finally {
			busy = false;
		}
	}

	async function handleLogin(event: Event) {
		event.preventDefault();
		if (busy) return;

		const form = event.target as HTMLFormElement;
		const emailInput = form.querySelector<HTMLInputElement>('#email');
		const passwordInput = form.querySelector<HTMLInputElement>('#password');

		if (!emailInput || !passwordInput) {
			showError('Email or password input not found.');
			return;
		}

		const email = emailInput.value.trim();
		const password = passwordInput.value;
		busy = true;

		await authClient.signIn
			.email({
				email,
				password
			})
			.then((result) => {
				if (result.data && 'twoFactorRedirect' in result.data && result.data.twoFactorRedirect) {
					passwordInput.value = '';
					verifying = true;
				} else if (result.data?.user) {
					// Redirect to the dashboard or another page after successful login
					window.location.href = resolve('/user/dashboard');
				} else {
					showError(getAuthErrorMessage(result.error, 'Unable to sign in. Please try again.'));
				}
			})
			.catch((error) => {
				showError(getErrorMessage(error, 'An error occurred during login. Please try again.'));
			})
			.finally(() => {
				busy = false;
			});
	}
</script>

<svelte:head>
	<title>Sign in | BPC Enrollment Portal</title>
	<meta
		name="description"
		content="Sign in to the Bulacan Polytechnic College enrollment portal to access your enrollment and academic records."
	/>
</svelte:head>

<AuthLayout
	title="Sign in to your portal"
	description="Pick up where you left off. Sign in with your BPC portal account."
	eyebrow="Welcome back"
>
	{#if verifying}
		<form class="space-y-5" onsubmit={verifyFactor} aria-busy={busy}>
			<h2 class="text-xl font-bold">Two-factor verification</h2>
			<p class="text-sm">
				{useRecoveryCode
					? 'Enter one of your saved recovery codes. Each code works once.'
					: 'Enter the 6-digit code from your authenticator app.'}
			</p>
			<label class="block" for="login-code">
				{useRecoveryCode ? 'Recovery code' : 'Authentication code'}
			</label>
			<input
				id="login-code"
				class="input w-full"
				bind:value={code}
				autocomplete="one-time-code"
				inputmode={useRecoveryCode ? 'text' : 'numeric'}
				pattern={useRecoveryCode ? undefined : '[0-9]{6}'}
				maxlength={useRecoveryCode ? 100 : 6}
				required
				disabled={busy}
			/>
			<button class="btn w-full btn-primary" type="submit" disabled={busy}>
				{busy ? 'Verifying…' : 'Verify and sign in'}
			</button>
			<button
				class="btn w-full btn-ghost"
				type="button"
				disabled={busy}
				onclick={() => {
					useRecoveryCode = !useRecoveryCode;
					code = '';
				}}
			>
				{useRecoveryCode ? 'Use authenticator app' : 'Use recovery code'}
			</button>
			<button
				class="btn w-full btn-ghost"
				type="button"
				disabled={busy}
				onclick={() => {
					verifying = false;
					code = '';
					useRecoveryCode = false;
				}}
			>
				Back to sign in
			</button>
		</form>
	{:else}
		<form class="space-y-5" onsubmit={handleLogin} aria-busy={busy}>
			<div class="space-y-2">
				<label class="text-sm font-bold tracking-wide text-base-content/60 uppercase" for="email">
					Email
				</label>
				<input
					id="email"
					type="email"
					autocomplete="username"
					placeholder="Enter your email"
					class="input-bordered input h-14 w-full rounded-lg border-base-300 bg-base-100 text-lg text-base-content/80 placeholder:text-base-content/50 focus:border-primary focus:outline-primary/20"
					required
				/>
			</div>

			<div class="space-y-2">
				<label
					class="text-sm font-bold tracking-wide text-base-content/60 uppercase"
					for="password"
				>
					Password
				</label>
				<div class="relative">
					<input
						id="password"
						type={showPassword ? 'text' : 'password'}
						autocomplete="current-password"
						placeholder="Enter your password"
						class="input-bordered input h-14 w-full rounded-lg border-base-300 bg-base-100 pr-14 text-lg text-base-content/80 placeholder:text-base-content/50 focus:border-primary focus:outline-primary/20"
						required
					/>
					<button
						type="button"
						class="btn absolute top-1/2 right-3 btn-square -translate-y-1/2 btn-ghost btn-sm"
						aria-label={showPassword ? 'Hide password' : 'Show password'}
						aria-pressed={showPassword}
						aria-controls="password"
						onclick={() => (showPassword = !showPassword)}
					>
						{#if showPassword}
							<EyeOff class="size-4" aria-hidden="true" />
						{:else}
							<Eye class="size-4" aria-hidden="true" />
						{/if}
					</button>
				</div>
			</div>

			<button
				type="submit"
				disabled={busy}
				class="btn h-14 w-full border-none bg-primary text-base font-bold tracking-wide text-primary-content hover:bg-primary/80"
			>
				{busy ? 'Signing in…' : 'Sign in'}
			</button>

			<div>
				<a
					href={resolve('/forgot-password')}
					class="text-sm font-semibold text-primary hover:text-primary/80 hover:underline"
				>
					Forgot Password?
				</a>
			</div>

			<p class="pt-4 text-sm text-base-content/50">
				For account creation and enrollment assistance, contact the Registrar's Office.
			</p>
		</form>
	{/if}
</AuthLayout>
