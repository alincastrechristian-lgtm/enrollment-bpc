<script lang="ts">
	import AuthLayout from '#lib/components/Auth/AuthLayout.svelte';
	import { authClient } from '#lib/auth-client.js';
	import { resolve } from '$app/paths';
	import { getAuthErrorMessage, getErrorMessage } from '#lib/errors.js';
	import { showError, showLoading, showSuccess } from '#lib/components/Popup/Popup.svelte.js';
	import { ArrowLeft, Mail } from '@lucide/svelte';

	let email = $state('');

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		if (!form.checkValidity()) {
			showError('Enter a valid email address.');
			return;
		}

		showLoading('Preparing your password reset request...');

		try {
			const { error } = await authClient.requestPasswordReset({
				email,
				redirectTo: '/reset-password'
			});
			if (error) {
				showError(getAuthErrorMessage(error, 'Failed to send password reset email.'));
				return;
			}
			showSuccess('Success! Check your email for a password reset link.');
		} catch (cause) {
			showError(getErrorMessage(cause, 'Failed to send password reset email. Please try again.'));
		}
	}
</script>

<svelte:head>
	<title>Forgot your password | BPC Enrollment Portal</title>
	<meta
		name="description"
		content="Request a password reset link for your BPC Enrollment Portal account."
	/>
</svelte:head>

<AuthLayout
	title="Forgot your password?"
	description="Enter your account’s email address. We’ll help you get back into your portal."
	eyebrow="Account recovery"
>
	<form class="space-y-5" onsubmit={handleSubmit} novalidate>
		<div class="space-y-2">
			<label for="recovery-email" class="text-sm font-semibold">Email address</label>
			<div class="input flex h-12 w-full items-center gap-3 border-base-300 bg-base-200">
				<Mail class="size-4 shrink-0 text-base-content/50" aria-hidden="true" />
				<input
					id="recovery-email"
					name="email"
					type="email"
					bind:value={email}
					autocomplete="email"
					placeholder="you@example.com"
					required
					class="min-w-0 grow text-sm"
				/>
			</div>
		</div>
		<button type="submit" class="btn h-12 w-full btn-primary">
			<Mail class="size-4" aria-hidden="true" />
			Send reset link
		</button>
	</form>
	<a
		href={resolve('/login')}
		class="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
	>
		<ArrowLeft class="size-4" aria-hidden="true" />Back to login
	</a>
	<p class="mt-6 border-t border-base-300 pt-5 text-xs leading-relaxed text-base-content/55">
		If you no longer have access to your email, contact the Registrar’s Office for help.
	</p>
</AuthLayout>
