<script lang="ts">
	import { getErrorMessage } from '#lib/errors.js';
	import { updateSystemSettings } from '#lib/actions/settings.remote.js';
	import { EmailApiType } from '#lib/email.js';
	import {
		showError,
		showLoading,
		showSuccess,
		showYesNo
	} from '#lib/components/Popup/Popup.svelte.js';
	import { Eye, EyeOff, Mail, RotateCcw, Save, Server, ShieldCheck } from '@lucide/svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function initialSettings() {
		return {
			emailApiType: data.settings.emailApiType ?? EmailApiType.SMTP,
			smtpHost: data.settings.smtpHost ?? 'smtp.gmail.com',
			smtpPort: (data.settings.smtpPort ?? 465) as number | undefined,
			senderEmail: data.settings.senderEmail ?? '',
			senderName: data.settings.senderName ?? 'BPC Enrollment System',
			senderPassword: '',
			resendApiKey: ''
		};
	}

	let savedSettings = $state(initialSettings());
	let settings = $state(initialSettings());
	let showPassword = $state(false);
	let showApiKey = $state(false);
	let feedback = $state('');
	let busy = $state(false);
	let passwordSaved = $state(false);
	let apiKeySaved = $state(false);
	const hasSenderPassword = $derived(data.settings.hasSenderPassword || passwordSaved);
	const hasResendApiKey = $derived(data.settings.hasResendApiKey || apiKeySaved);

	async function saveChanges(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		const payload = {
			emailApiType: settings.emailApiType,
			senderName: settings.senderName.trim(),
			senderEmail: settings.senderEmail.trim(),
			...(settings.emailApiType === EmailApiType.SMTP
				? {
						smtpHost: settings.smtpHost.trim(),
						smtpPort: settings.smtpPort,
						senderPassword: settings.senderPassword
					}
				: { resendApiKey: settings.resendApiKey.trim() })
		};
		try {
			const confirmed = await showYesNo({
				title: 'Save email settings?',
				message: 'Update the sender and email provider for outgoing system emails?',
				yesText: 'Save',
				noText: 'Cancel'
			});
			if (!confirmed) return;
			showLoading('Saving email settings...');
			await updateSystemSettings(payload);
			passwordSaved ||= 'senderPassword' in payload && Boolean(payload.senderPassword);
			apiKeySaved ||= 'resendApiKey' in payload && Boolean(payload.resendApiKey);
			savedSettings = { ...savedSettings, ...payload, senderPassword: '', resendApiKey: '' };
			settings = { ...savedSettings };
			showPassword = false;
			showApiKey = false;
			feedback = 'Email settings saved successfully.';
			showSuccess(feedback);
		} catch (error) {
			showError(getErrorMessage(error, 'Failed to save email settings'));
		} finally {
			busy = false;
		}
	}

	function resetChanges() {
		if (busy) return;
		settings = { ...savedSettings };
		showPassword = false;
		showApiKey = false;
		feedback = 'Changes discarded.';
	}
</script>

<svelte:head>
	<title>Email Settings | BPC Enrollment System</title>
</svelte:head>

<section class="space-y-6" aria-label="System email settings">
	<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
		<form
			onsubmit={saveChanges}
			oninput={() => (feedback = '')}
			aria-busy={busy}
			class="portal-panel min-w-0"
		>
			<div class="space-y-6 p-5 sm:p-6">
				<fieldset class="space-y-2" disabled={busy}>
					<legend class="mb-2 text-sm font-bold text-base-content">Email provider</legend>
					<label for="email-provider" class="block text-sm font-semibold">Send emails with</label>
					<select
						id="email-provider"
						name="emailApiType"
						class="select w-full border-base-300 bg-base-200"
						bind:value={settings.emailApiType}
						aria-describedby="email-provider-help"
					>
						<option value={EmailApiType.SMTP}>SMTP</option>
						<option value={EmailApiType.RESEND}>Resend</option>
					</select>
					<p id="email-provider-help" class="text-xs text-base-content/60">
						All outgoing system emails use the saved provider.
					</p>
				</fieldset>
				<fieldset class="space-y-4" disabled={busy}>
					<legend class="mb-4 text-sm font-bold text-base-content">Sender details</legend>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<label for="sender-name" class="block text-sm font-semibold">Sender name</label>
							<input
								id="sender-name"
								name="senderName"
								type="text"
								class="input w-full border-base-300 bg-base-200"
								bind:value={settings.senderName}
								placeholder="BPC Enrollment System"
								required
								pattern=".*\S.*"
								aria-describedby="sender-name-help"
							/>
							<p id="sender-name-help" class="text-xs text-base-content/60">
								The name recipients see in their inbox.
							</p>
						</div>
						<div class="space-y-2">
							<label for="sender-email" class="block text-sm font-semibold">Sender email</label>
							<input
								id="sender-email"
								name="senderEmail"
								type="email"
								class="input w-full border-base-300 bg-base-200"
								bind:value={settings.senderEmail}
								placeholder="enrollment@example.com"
								required
								aria-describedby="sender-email-help"
							/>
							<p id="sender-email-help" class="text-xs text-base-content/60">
								{settings.emailApiType === EmailApiType.RESEND
									? 'Use an address on the exact domain or subdomain verified in Resend.'
									: 'Use the email account for your SMTP server.'}
							</p>
						</div>
					</div>
				</fieldset>

				{#if settings.emailApiType === EmailApiType.SMTP}
					<fieldset class="space-y-4 border-t border-base-300 pt-5" disabled={busy}>
						<legend class="flex items-center gap-2 text-sm font-bold text-base-content">
							<Server class="h-4 w-4 text-base-content/50" aria-hidden="true" />
							SMTP connection
						</legend>
						<div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
							<div class="space-y-2">
								<label for="smtp-host" class="block text-sm font-semibold">SMTP host</label>
								<input
									id="smtp-host"
									name="smtpHost"
									type="text"
									class="input w-full border-base-300 bg-base-200"
									bind:value={settings.smtpHost}
									placeholder="smtp.gmail.com"
									required
									pattern="[^\s/:]+"
									spellcheck="false"
									autocapitalize="none"
									aria-describedby="smtp-host-help"
								/>
								<p id="smtp-host-help" class="text-xs text-base-content/60">
									Server hostname, without https:// or a port.
								</p>
							</div>
							<div class="space-y-2">
								<label for="smtp-port" class="block text-sm font-semibold">SMTP port</label>
								<input
									id="smtp-port"
									name="smtpPort"
									type="number"
									class="input w-full border-base-300 bg-base-200"
									bind:value={settings.smtpPort}
									min="1"
									max="65535"
									step="1"
									required
									aria-describedby="smtp-port-help"
								/>
								<p id="smtp-port-help" class="text-xs text-base-content/60">Usually 465 or 587.</p>
							</div>
						</div>

						<div class="space-y-2">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<label for="sender-password" class="block text-sm font-semibold">
									Sender password
								</label>
								<span
									id="sender-password-status"
									role="status"
									class={`badge badge-sm ${hasSenderPassword ? 'badge-success' : 'badge-ghost'}`}
								>
									{hasSenderPassword ? 'Password configured' : 'No password set'}
								</span>
							</div>
							<div class="relative">
								<input
									id="sender-password"
									name="senderPassword"
									type={showPassword ? 'text' : 'password'}
									class="input w-full border-base-300 bg-base-200 pr-12"
									bind:value={settings.senderPassword}
									placeholder={hasSenderPassword
										? 'Leave blank to keep existing password'
										: 'Enter a password or app password'}
									autocomplete="new-password"
									required={!hasSenderPassword}
									aria-describedby="sender-password-status sender-password-help"
								/>
								<button
									type="button"
									class="btn absolute top-0 right-0 h-full w-12 btn-ghost"
									onclick={() => (showPassword = !showPassword)}
									aria-label={showPassword ? 'Hide password' : 'Show password'}
									aria-pressed={showPassword}
								>
									{#if showPassword}
										<EyeOff class="h-4 w-4" aria-hidden="true" />
									{:else}
										<Eye class="h-4 w-4" aria-hidden="true" />
									{/if}
								</button>
							</div>
							<p id="sender-password-help" class="text-xs leading-relaxed text-base-content/60">
								{hasSenderPassword
									? 'A password is saved. Leave blank to keep it, or enter a new one to replace it.'
									: 'No password has been saved yet.'}
								For Gmail, use an app password.
							</p>
						</div>
					</fieldset>
				{:else}
					<fieldset class="space-y-4 border-t border-base-300 pt-5" disabled={busy}>
						<legend class="text-sm font-bold text-base-content">Resend connection</legend>
						<div class="space-y-2">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<label for="resend-api-key" class="block text-sm font-semibold">
									Resend API key
								</label>
								<span
									id="resend-api-key-status"
									role="status"
									class={`badge badge-sm ${hasResendApiKey ? 'badge-success' : 'badge-ghost'}`}
								>
									{hasResendApiKey ? 'API key configured' : 'No API key set'}
								</span>
							</div>
							<div class="relative">
								<input
									id="resend-api-key"
									name="resendApiKey"
									type={showApiKey ? 'text' : 'password'}
									class="input w-full border-base-300 bg-base-200 pr-12"
									bind:value={settings.resendApiKey}
									placeholder={hasResendApiKey ? 'Leave blank to keep existing API key' : 're_...'}
									required={!hasResendApiKey}
									pattern=".*\S.*"
									autocomplete="new-password"
									spellcheck="false"
									autocapitalize="none"
									aria-describedby="resend-api-key-status resend-api-key-help"
								/>
								<button
									type="button"
									class="btn absolute top-0 right-0 h-full w-12 btn-ghost"
									onclick={() => (showApiKey = !showApiKey)}
									aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
									aria-pressed={showApiKey}
								>
									{#if showApiKey}
										<EyeOff class="h-4 w-4" aria-hidden="true" />
									{:else}
										<Eye class="h-4 w-4" aria-hidden="true" />
									{/if}
								</button>
							</div>
							<p id="resend-api-key-help" class="text-xs leading-relaxed text-base-content/60">
								Create an API key with sending access in your Resend dashboard.
								{hasResendApiKey
									? 'Leave blank to keep the saved key, or enter a new one to replace it.'
									: 'An API key is required to use Resend.'}
							</p>
						</div>
					</fieldset>
				{/if}
			</div>

			<div class="flex flex-col gap-4 border-t border-base-300 p-5 sm:p-6">
				<p role="status" class="text-sm text-base-content/70">{feedback}</p>
				<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<button
						type="button"
						class="btn gap-2 border-base-300 btn-outline btn-sm"
						onclick={resetChanges}
						disabled={busy}
					>
						<RotateCcw class="h-4 w-4" aria-hidden="true" />Discard changes
					</button>
					<button type="submit" class="btn gap-2 btn-primary btn-sm" disabled={busy}>
						<Save class="h-4 w-4" aria-hidden="true" />{busy ? 'Saving...' : 'Save settings'}
					</button>
				</div>
			</div>
		</form>

		<aside class="space-y-6">
			<div class="portal-panel p-5 shadow-sm sm:p-6">
				<h2 class="text-sm font-bold text-base-content">Sender preview</h2>
				<p class="mt-1 text-xs text-base-content/60">
					How your sender details appear to recipients.
				</p>
				<div class="mt-5 rounded-xl border border-base-300 bg-base-200 p-4">
					<div class="flex items-start gap-3">
						<div
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
						>
							<Mail class="h-4 w-4" aria-hidden="true" />
						</div>
						<div class="min-w-0">
							<p class="wrap-break-words text-sm font-bold text-base-content">
								{savedSettings.senderName || 'BPC Enrollment System'}
							</p>
							<p class="mt-1 text-xs break-all text-base-content/60">
								{savedSettings.senderEmail || 'enrollment@example.com'}
							</p>
						</div>
					</div>
					<div class="mt-4 border-t border-base-300 pt-4">
						<p class="text-sm font-semibold text-base-content">Your enrollment update</p>
						<p class="mt-1 text-xs leading-relaxed text-base-content/60">
							Notifications and enrollment updates will use these sender details.
						</p>
					</div>
				</div>
			</div>
			<div class="portal-panel p-5 shadow-sm sm:p-6">
				<div class="flex items-center gap-2">
					<ShieldCheck class="h-4 w-4 text-primary" aria-hidden="true" />
					<h2 class="text-sm font-bold text-base-content">Before you connect</h2>
				</div>
				<p class="mt-3 text-sm leading-relaxed text-base-content/60">
					{#if settings.emailApiType === EmailApiType.RESEND}
						Verify your sending domain in Resend, then use a sender address on that domain. The
						resend.dev test sender can only send to your Resend account email.
					{:else}
						Use a dedicated system email account and confirm the SMTP host and port with your email
						provider.
					{/if}
				</p>
			</div>
		</aside>
	</div>
</section>
