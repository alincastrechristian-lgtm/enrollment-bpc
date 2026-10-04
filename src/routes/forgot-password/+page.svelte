<script lang="ts">
	import { authClient } from '#lib/auth-client.js';
	import { showError, showLoading, showSuccess } from '#lib/components/Popup/Popup.svelte.js';
	import { ArrowLeft, Mail, ShieldCheck } from '@lucide/svelte';

	let email = $state('');

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		if (!form.checkValidity()) {
			showError('Enter a valid email address.');
			return;
		}

		showLoading('Preparing your password reset request...');

		const { error } = await authClient.requestPasswordReset({
			email,
			redirectTo: '/reset-password'
		});

		if (error) {
			showError(error.message || 'Failed to send password reset email.');
			return;
		}

		showSuccess('Success! Check your email for a password reset link.');
	}
</script>

<svelte:head>
	<title>Forgot your password | BPC Enrollment Portal</title>
	<meta
		name="description"
		content="Request a password reset link for your BPC Enrollment Portal account."
	/>
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
				aria-labelledby="forgot-password-title"
			>
				<div class="card-body gap-6 p-6 sm:p-10">
					<div>
						<div
							class="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"
						>
							<Mail class="size-7" aria-hidden="true" />
						</div>
						<p class="mb-2 text-xs font-bold tracking-widest text-primary uppercase">
							Account recovery
						</p>
						<h1
							id="forgot-password-title"
							class="text-3xl font-extrabold tracking-tight text-base-content"
						>
							Forgot your password?
						</h1>
						<p class="mt-3 text-sm leading-relaxed text-base-content/60">
							Enter the email address associated with your BPC Enrollment Portal account to request
							a password reset link.
						</p>
					</div>

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
						href="/"
						class="flex link items-center justify-center gap-2 text-sm font-semibold text-primary link-hover"
					>
						<ArrowLeft class="size-4" aria-hidden="true" />
						Back to login
					</a>
					<p class="border-t border-base-300 pt-5 text-xs leading-relaxed text-base-content/60">
						If you no longer have access to your email, contact the Registrar's Office for help.
					</p>
				</div>
			</section>
			<p class="text-center text-xs text-base-content/50">BPC Enrollment Portal</p>
		</div>
	</main>
</div>
