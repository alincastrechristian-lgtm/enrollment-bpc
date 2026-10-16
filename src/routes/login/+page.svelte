<script lang="ts">
	import AuthLayout from '#lib/components/Auth/AuthLayout.svelte';
	import { authClient } from '#lib/auth-client.js';
	import { getAuthErrorMessage, getErrorMessage } from '#lib/errors.js';
	import { showError } from '#lib/components/Popup/Popup.svelte.js';
	import { Eye, EyeOff } from '@lucide/svelte';
	import { resolve } from '$app/paths';

	let showPassword = $state(false);
	let busy = $state(false);

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
				if (result.data?.user) {
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
	<form class="space-y-5" onsubmit={handleLogin} aria-busy={busy}>
		<div class="space-y-2">
			<label class="text-sm font-bold tracking-wide text-base-content/60 uppercase" for="email">
				Email
			</label>
			<input
				id="email"
				type="email"
				autocomplete="username"
				placeholder="student@email.com"
				class="input-bordered input h-14 w-full rounded-lg border-base-300 bg-base-100 text-lg text-base-content/80 placeholder:text-base-content/50 focus:border-primary focus:outline-primary/20"
				required
			/>
		</div>

		<div class="space-y-2">
			<label class="text-sm font-bold tracking-wide text-base-content/60 uppercase" for="password">
				Password
			</label>
			<div class="relative">
				<input
					id="password"
					type={showPassword ? 'text' : 'password'}
					autocomplete="current-password"
					placeholder="••••••••"
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
</AuthLayout>
