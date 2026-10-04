<script lang="ts">
	import { authClient } from '#lib/auth-client.js';
	import { showError } from '#lib/components/Popup/Popup.svelte.js';
	import { Eye, EyeOff } from '@lucide/svelte';

	let showPassword = $state(false);

	async function handleLogin(event: Event) {
		event.preventDefault();

		const form = event.target as HTMLFormElement;
		const emailInput = form.querySelector<HTMLInputElement>('#email');
		const passwordInput = form.querySelector<HTMLInputElement>('#password');

		if (!emailInput || !passwordInput) {
			showError('Email or password input not found.');
			return;
		}

		const email = emailInput.value.trim();
		const password = passwordInput.value.trim();

		await authClient.signIn
			.email({
				email,
				password
			})
			.then((result) => {
				if (result.data?.user) {
					// Redirect to the dashboard or another page after successful login
					window.location.href = '/user/dashboard';
				} else {
					showError(`Login failed: ${result.error?.message || 'Unknown error'}`);
				}
			})
			.catch((error) => {
				console.error('Login error:', error);
				showError('An error occurred during login. Please try again.');
			});
	}
</script>

<div class="min-h-dvh bg-base-100">
	<div class="flex min-h-dvh w-full">
		<aside
			class="sticky top-0 hidden h-dvh w-72 shrink-0 overflow-hidden bg-neutral text-base-100 sm:block sm:w-80 lg:w-105"
		>
			<div class="absolute inset-0 bg-primary/10"></div>
			<div class="relative flex h-full w-full flex-col justify-between p-16">
				<div class="space-y-10">
					<div
						class="flex h-24 w-24 items-center justify-center rounded-full bg-primary text-4xl font-bold tracking-wide text-primary-content"
					>
						BPC
					</div>

					<div class="space-y-3">
						<h2
							class="text-5xl leading-tight font-black tracking-tight text-primary-content uppercase"
						>
							Bulacan Polytechnic College
						</h2>
						<p class="text-lg tracking-widest text-neutral-content/60 uppercase">
							College Enrollment System
						</p>
					</div>
				</div>

				<div
					class="rounded-2xl border border-neutral-content/20 bg-neutral/60 p-8 backdrop-blur-sm"
				>
					<p
						class="text-center text-sm font-semibold tracking-wider text-neutral-content uppercase"
					>
						Secure • Simple • Centralized
					</p>
					<p class="mt-4 text-center text-sm text-neutral-content/60">
						Registrar-assisted enrollment workflow
					</p>
				</div>
			</div>
		</aside>

		<main
			class="flex min-w-0 flex-1 items-center justify-center bg-base-200 px-4 py-10 sm:px-8 lg:px-14"
		>
			<div class="flex w-full max-w-xl flex-col items-center space-y-6 sm:space-y-8">
				<header
					class="flex w-full items-center gap-4 rounded-3xl bg-neutral px-5 py-4 text-base-100 shadow-lg shadow-neutral/20 sm:hidden"
				>
					<div
						class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold tracking-wide text-primary-content"
					>
						BPC
					</div>

					<div class="min-w-0 space-y-1">
						<p
							class="truncate text-xs font-semibold tracking-[0.3em] text-base-content/30 uppercase"
						>
							Bulacan Polytechnic College
						</p>
						<h1 class="truncate text-lg font-black tracking-tight text-primary-content">
							College Enrollment System
						</h1>
						<p
							class="truncate text-[11px] font-medium tracking-widest text-base-content/30 uppercase"
						>
							Student / Registrar Login
						</p>
					</div>
				</header>

				<header class="hidden space-y-2 text-center sm:block">
					<h1 class="text-4xl font-extrabold tracking-tight text-base-content sm:text-5xl">
						BPC Enrollment Portal
					</h1>
					<p class="text-xl text-base-content/60">Student / Registrar Login</p>
				</header>

				<section
					class="w-full max-w-xl rounded-4xl border border-base-300 bg-base-100 p-6 shadow-sm sm:p-10"
				>
					<form class="space-y-7" onsubmit={handleLogin}>
						<div class="space-y-2">
							<label
								class="text-sm font-bold tracking-wide text-base-content/60 uppercase"
								for="email">Email</label
							>
							<input
								id="email"
								type="email"
								placeholder="student@email.com"
								class="input-bordered input h-14 w-full rounded-lg border-base-300 bg-base-100 text-lg text-base-content/80 placeholder:text-base-content/50 focus:border-primary focus:outline-none"
								required
							/>
						</div>

						<div class="space-y-2">
							<label
								class="text-sm font-bold tracking-wide text-base-content/60 uppercase"
								for="password">Password</label
							>
							<div class="relative">
								<input
									id="password"
									type={showPassword ? 'text' : 'password'}
									autocomplete="current-password"
									placeholder="••••••••"
									class="input-bordered input h-14 w-full rounded-lg border-base-300 bg-base-100 pr-14 text-lg text-base-content/80 placeholder:text-base-content/50 focus:border-primary focus:outline-none"
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
							class="btn h-14 w-full border-none bg-primary text-base font-bold tracking-wide text-primary-content hover:bg-primary/80"
						>
							LOGIN
						</button>

						<div>
							<a
								href="/forgot-password"
								class="text-sm font-semibold text-primary hover:text-primary/80 hover:underline"
								>Forgot Password?</a
							>
						</div>

						<p class="pt-4 text-sm text-base-content/50">
							Incoming first-year applicants: submit requirements physically to the Registrar's
							Office.
						</p>
					</form>
				</section>
			</div>
		</main>
	</div>
</div>
