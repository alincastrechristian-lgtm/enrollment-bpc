<script lang="ts">
	import { authClient } from '#lib/auth-client.js';
	import { getAuthErrorMessage } from '#lib/errors.js';
	import { invalidateAll } from '$app/navigation';
	import QRCode from 'qrcode';
	import {
		ArrowRight,
		Check,
		CircleCheck,
		KeyRound,
		LockKeyhole,
		ShieldCheck,
		Smartphone
	} from '@lucide/svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmation = $state('');
	let factorPassword = $state('');
	let code = $state('');
	let qr = $state('');
	let setupKey = $state('');
	let backupCodes = $state<string[]>([]);
	let savedCodes = $state(false);
	let busy = $state(false);
	let errorMessage = $state('');
	let message = $state('');

	async function run(action: () => Promise<void>) {
		if (busy) return;
		busy = true;
		errorMessage = '';
		message = '';
		try {
			await action();
		} catch (cause) {
			errorMessage = getAuthErrorMessage(
				cause,
				'Could not update security settings. Please try again.'
			);
		} finally {
			busy = false;
		}
	}

	function clearSetup() {
		qr = '';
		setupKey = '';
		backupCodes = [];
		code = '';
		savedCodes = false;
		factorPassword = '';
	}

	async function changePassword(event: SubmitEvent) {
		event.preventDefault();
		await run(async () => {
			if (newPassword !== confirmation) {
				errorMessage = 'New passwords do not match.';
				return;
			}
			const result = await authClient.changePassword({
				currentPassword,
				newPassword,
				revokeOtherSessions: true
			});
			if (result.error) throw result.error;
			currentPassword = newPassword = confirmation = '';
			message = 'Password changed. Other sessions have been signed out.';
		});
	}

	async function toggleFactor(event: SubmitEvent) {
		event.preventDefault();
		await run(async () => {
			if (data.twoFactorEnabled) {
				const result = await authClient.twoFactor.disable({ password: factorPassword });
				if (result.error) throw result.error;
				clearSetup();
				await invalidateAll();
				message = 'Two-factor authentication disabled.';
			} else {
				const result = await authClient.twoFactor.enable({
					password: factorPassword,
					method: 'totp'
				});
				if (result.error) throw result.error;
				if (result.data?.method !== 'totp') throw new Error('Unexpected enrollment method');
				clearSetup();
				backupCodes = result.data.backupCodes;
				setupKey = new URL(result.data.totpURI).searchParams.get('secret') ?? '';
				qr = await QRCode.toDataURL(result.data.totpURI, { width: 256, margin: 2 });
			}
		});
	}

	async function confirmFactor(event: SubmitEvent) {
		event.preventDefault();
		await run(async () => {
			if (!savedCodes) return;
			const result = await authClient.twoFactor.verifyTotp({ code, trustDevice: false });
			if (result.error) throw result.error;
			clearSetup();
			await invalidateAll();
			message = 'Two-factor authentication enabled. Use your authenticator app when signing in.';
		});
	}
</script>

<svelte:head>
	<title>Security | BPC Enrollment Portal</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="w-full space-y-6">
	<header class="portal-page-header">
		<div class="h-1 bg-primary" aria-hidden="true"></div>
		<div class="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
			<div class="flex min-w-0 items-center gap-4 sm:gap-5">
				<span
					class="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-primary/10 bg-primary/10 text-primary"
					aria-hidden="true"
				>
					<ShieldCheck class="size-8" />
				</span>
				<div class="min-w-0">
					<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Account security</h1>
					<p class="mt-1 text-sm text-base-content/60">
						Manage your password and protect your sign-in.
					</p>
				</div>
			</div>
			<span
				class={`badge h-auto gap-1.5 py-2 ${data.twoFactorEnabled ? 'border-success/30 bg-success/15 text-base-content' : 'border-base-300 bg-base-200 text-base-content/65'}`}
			>
				<ShieldCheck class="size-3.5 shrink-0" aria-hidden="true" />
				{data.twoFactorEnabled ? 'Two-factor protection on' : 'Two-factor protection off'}
			</span>
		</div>
	</header>
	{#if errorMessage}
		<div class="alert border-error/25 bg-error/10 text-sm text-base-content" role="alert">
			{errorMessage}
		</div>
	{/if}
	{#if message}
		<div class="alert border-success/30 bg-success/15 text-sm text-base-content" role="status">
			<CircleCheck class="size-5 text-success" aria-hidden="true" />{message}
		</div>
	{/if}
	<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
		<section
			class="portal-panel min-w-0 overflow-hidden shadow-sm"
			aria-labelledby="password-heading"
		>
			<header class="border-b border-base-300 p-5 sm:px-6">
				<h2 id="password-heading" class="flex items-center gap-2 text-lg font-bold">
					<KeyRound class="size-5 text-primary" aria-hidden="true" />Change password
				</h2>
				<p class="mt-1 text-xs text-base-content/60">
					Choose a strong password that you do not use elsewhere.
				</p>
			</header>
			<form onsubmit={changePassword} aria-busy={busy}>
				<fieldset class="space-y-5 p-5 sm:p-6" disabled={busy}>
					<label class="block text-sm font-semibold" for="current-password">
						Current password
						<input
							id="current-password"
							class="input mt-2 w-full border-base-300 bg-base-200"
							type="password"
							autocomplete="current-password"
							bind:value={currentPassword}
							required
						/>
					</label>
					<label class="block text-sm font-semibold" for="new-password">
						New password
						<input
							id="new-password"
							class="input mt-2 w-full border-base-300 bg-base-200"
							type="password"
							autocomplete="new-password"
							minlength="8"
							maxlength="128"
							bind:value={newPassword}
							aria-describedby="password-help"
							required
						/>
					</label>
					<p id="password-help" class="-mt-3 text-xs text-base-content/60">Use 8–128 characters.</p>
					<label class="block text-sm font-semibold" for="confirm-password">
						Confirm new password
						<input
							id="confirm-password"
							class="input mt-2 w-full border-base-300 bg-base-200"
							type="password"
							autocomplete="new-password"
							minlength="8"
							maxlength="128"
							bind:value={confirmation}
							required
						/>
					</label>
				</fieldset>
				<div class="flex flex-col gap-4 border-t border-base-300 bg-base-200/35 p-5 sm:px-6">
					<p class="flex items-start gap-2 text-xs leading-relaxed text-base-content/60">
						<LockKeyhole class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Changing your
						password signs out your other sessions.
					</p>
					<button class="btn w-full gap-2 btn-primary sm:w-fit" type="submit" disabled={busy}>
						<KeyRound class="size-4" aria-hidden="true" />Change password
					</button>
				</div>
			</form>
		</section>
		<section
			class="portal-panel min-w-0 overflow-hidden shadow-sm"
			aria-labelledby="factor-heading"
		>
			<header class="border-b border-base-300 p-5 sm:px-6">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<h2 id="factor-heading" class="flex items-center gap-2 text-lg font-bold">
						<Smartphone class="size-5 text-primary" aria-hidden="true" />Two-factor authentication
					</h2>
					<span
						class={`badge badge-sm ${data.twoFactorEnabled ? 'border-success/30 bg-success/15 text-base-content' : 'border-base-300 bg-base-200 text-base-content/65'}`}
					>
						{data.twoFactorEnabled ? 'Enabled' : 'Not enabled'}
					</span>
				</div>
				<p class="mt-1 text-xs text-base-content/60">
					Add an extra layer of protection with an authenticator app.
				</p>
			</header>
			{#if qr}
				<div class="space-y-6 p-5 sm:p-6">
					<div class="space-y-4">
						<p class="flex items-center gap-2 text-sm font-bold">
							<span
								class="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs text-primary"
								aria-hidden="true"
							>
								1
							</span>
							Scan with your authenticator app
						</p>
						<div class="mx-auto w-fit max-w-full rounded-xl border border-base-300 bg-white p-2">
							<img
								src={qr}
								alt="QR code for authenticator setup"
								width="256"
								height="256"
								class="max-w-full rounded-lg"
							/>
						</div>
						<details class="rounded-lg border border-base-300 bg-base-200/50 p-3">
							<summary class="cursor-pointer text-xs font-semibold text-base-content/70">
								Cannot scan? Enter setup key manually
							</summary>
							<code class="mt-3 block text-sm break-all select-all">{setupKey}</code>
						</details>
					</div>
					<div class="space-y-3 border-t border-base-300 pt-5">
						<p class="flex items-center gap-2 text-sm font-bold">
							<span
								class="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs text-primary"
								aria-hidden="true"
							>
								2
							</span>
							Save your recovery codes
						</p>
						<p class="text-xs leading-relaxed text-base-content/60">
							Keep these somewhere safe. Each code works once if you lose access to your app.
						</p>
						<ul
							class="grid grid-cols-2 gap-2 rounded-lg border border-base-300 bg-base-200 p-4 font-mono text-sm select-all"
						>
							{#each backupCodes as backupCode (backupCode)}
								<li>{backupCode}</li>
							{/each}
						</ul>
					</div>
					<form class="border-t border-base-300 pt-5" onsubmit={confirmFactor} aria-busy={busy}>
						<fieldset class="space-y-4" disabled={busy}>
							<label class="flex items-center gap-3 text-sm">
								<input type="checkbox" class="checkbox" bind:checked={savedCodes} required />
								I saved my recovery codes.
							</label>
							<label class="block text-sm font-semibold" for="setup-code">
								3. Enter the 6-digit code from your app
								<input
									id="setup-code"
									class="input mt-2 w-full border-base-300 bg-base-200 font-mono text-lg tracking-widest"
									inputmode="numeric"
									autocomplete="one-time-code"
									pattern={'[0-9]{6}'}
									maxlength="6"
									bind:value={code}
									required
								/>
							</label>
							<div class="flex flex-wrap items-center gap-2">
								<button class="btn gap-2 btn-primary" type="submit" disabled={!savedCodes}>
									<Check class="size-4" aria-hidden="true" />Verify and enable
								</button>
								<button class="btn btn-ghost" type="button" onclick={clearSetup}>
									Cancel setup
								</button>
							</div>
						</fieldset>
					</form>
					<p class="text-xs leading-relaxed text-base-content/60">
						Protection starts after code verification. Canceling leaves two-factor authentication
						off.
					</p>
				</div>
			{:else}
				<form onsubmit={toggleFactor} aria-busy={busy}>
					<fieldset class="space-y-5 p-5 sm:p-6" disabled={busy}>
						<div
							class="flex items-start gap-3 rounded-xl border border-primary/10 bg-primary/5 p-4"
						>
							<ShieldCheck class="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
							<div>
								<p class="text-sm font-semibold">
									{data.twoFactorEnabled
										? 'Your account has extra protection'
										: 'Secure your next sign-in'}
								</p>
								<p class="mt-1 text-xs leading-relaxed text-base-content/60">
									{data.twoFactorEnabled
										? 'You will be asked for an app code when signing in. Enter your password below to turn off this protection.'
										: 'Use Google Authenticator, Microsoft Authenticator, or another authenticator app to generate sign-in codes.'}
								</p>
							</div>
						</div>
						<label class="block text-sm font-semibold" for="factor-password">
							Current password
							<input
								id="factor-password"
								class="input mt-2 w-full border-base-300 bg-base-200"
								type="password"
								autocomplete="current-password"
								bind:value={factorPassword}
								required
							/>
						</label>
					</fieldset>
					<div class="border-t border-base-300 bg-base-200/35 p-5 sm:px-6">
						<button
							class="btn w-full gap-2 sm:w-fit"
							class:btn-error={data.twoFactorEnabled}
							class:btn-primary={!data.twoFactorEnabled}
							type="submit"
							disabled={busy}
						>
							{#if data.twoFactorEnabled}
								<ShieldCheck class="size-4" aria-hidden="true" />
							{:else}
								<ArrowRight class="size-4" aria-hidden="true" />
							{/if}
							{data.twoFactorEnabled
								? 'Disable two-factor authentication'
								: 'Set up authenticator app'}
						</button>
					</div>
				</form>
			{/if}
		</section>
	</div>
</div>
