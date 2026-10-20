<script lang="ts">
	import { saveClearanceVerification, testClearanceGemini } from '#lib/actions/clearance.remote.js';
	import { getErrorMessage } from '#lib/errors.js';
	import { untrack, onDestroy } from 'svelte';
	import {
		DEFAULT_GEMINI_MODEL,
		geminiModelSchema,
		GEMINI_MODEL_LABELS,
		type GeminiModel
	} from '#lib/clearance/gemini.js';
	let {
		settings,
		disabled = false,
		onbusychange
	}: {
		settings: {
			automatedClearanceVerificationEnabled: boolean;
			personalInfoVerificationEnabled: boolean;
			hasGeminiKey: boolean;
			geminiModel: GeminiModel;
		};
		disabled?: boolean;
		onbusychange: (busy: boolean) => void;
	} = $props();
	let automatedClearanceVerificationEnabled = $state(
		untrack(() => settings.automatedClearanceVerificationEnabled)
	);
	let personalInfoVerificationEnabled = $state(
		untrack(() => settings.personalInfoVerificationEnabled)
	);
	let geminiApiKey = $state('');
	let geminiModel = $state<GeminiModel>(
		untrack(() => settings.geminiModel ?? DEFAULT_GEMINI_MODEL)
	);
	let clearGeminiKey = $state(false);
	let pending = $state<'save' | 'test' | null>(null);
	let message = $state('');
	let failed = $state(false);
	const dirty = $derived(
		automatedClearanceVerificationEnabled !== settings.automatedClearanceVerificationEnabled ||
			personalInfoVerificationEnabled !== settings.personalInfoVerificationEnabled ||
			!!geminiApiKey.trim() ||
			geminiModel !== (settings.geminiModel ?? DEFAULT_GEMINI_MODEL) ||
			clearGeminiKey
	);
	$effect(() => onbusychange(!!pending));
	onDestroy(() => onbusychange(false));
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (disabled || pending) return;
		pending = 'save';
		message = '';
		failed = false;
		try {
			await saveClearanceVerification({
				automatedClearanceVerificationEnabled,
				personalInfoVerificationEnabled,
				geminiApiKey: geminiApiKey.trim() || undefined,
				geminiModel,
				clearGeminiKey
			});
			geminiApiKey = '';
			clearGeminiKey = false;
			message = 'Verification settings saved.';
		} catch (cause) {
			failed = true;
			message = getErrorMessage(cause, 'Could not save verification settings. Try again.');
		} finally {
			pending = null;
		}
	}
	async function test() {
		if (disabled || pending || clearGeminiKey) return;
		pending = 'test';
		message = '';
		failed = false;
		try {
			const result = await testClearanceGemini({
				geminiApiKey: geminiApiKey.trim() || undefined,
				geminiModel
			});
			message = result.message;
			failed = !result.success;
		} catch (cause) {
			failed = true;
			message = getErrorMessage(cause, 'Could not test Gemini. Try again.');
		} finally {
			pending = null;
		}
	}
</script>

<form
	class="portal-panel overflow-hidden"
	onsubmit={save}
	aria-labelledby="verification-settings-title"
	aria-busy={!!pending}
>
	<div class="space-y-5 p-5 sm:p-6">
		<div>
			<h2 id="verification-settings-title" class="font-bold">Clearance verification</h2>
			<p class="mt-1 text-sm text-base-content/60">
				Choose which checks are required before the Registrar enrolls students.
			</p>
		</div>
		<fieldset class="space-y-4" disabled={disabled || !!pending}>
			<label
				class="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-base-300 p-4"
			>
				<span>
					<span class="block text-sm font-semibold">Automated clearance verification</span>
					<span class="mt-1 block text-xs leading-relaxed text-base-content/60">
						When off, students submit paper clearance to the Registrar instead of uploading it.
						Registrar/admin must still verify clearance before enrollment. Existing files are
						retained.
					</span>
				</span>
				<input
					type="checkbox"
					role="switch"
					class="toggle shrink-0 toggle-primary"
					bind:checked={automatedClearanceVerificationEnabled}
				/>
			</label>
			<label
				class="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-base-300 p-4"
			>
				<span>
					<span class="block text-sm font-semibold">Verify student name and number</span>
					<span class="mt-1 block text-xs leading-relaxed text-base-content/60">
						Checks writing presence and uses Gemini to compare personal details with the student
						record. When off, template and office checks continue, and results show personal
						verification was skipped. Applies to new uploads.
					</span>
				</span>
				<input
					type="checkbox"
					role="switch"
					class="toggle shrink-0 toggle-primary"
					bind:checked={personalInfoVerificationEnabled}
					disabled={!automatedClearanceVerificationEnabled}
				/>
			</label>
			<div class="border-t border-base-300 pt-5">
				<label for="gemini-model" class="block text-sm font-semibold">Gemini model</label>
				<select
					id="gemini-model"
					class="select mt-2 w-full bg-base-200"
					bind:value={geminiModel}
					aria-describedby="gemini-model-help"
				>
					{#each geminiModelSchema.options as model (model)}
						<option value={model}>{GEMINI_MODEL_LABELS[model]}</option>
					{/each}
				</select>
				<p id="gemini-model-help" class="mt-2 mb-5 text-xs text-base-content/60">
					3.1 Flash-Lite is the recommended low-cost default. 2.5 Flash-Lite costs less but may
					reject newer projects. Legacy 2.5 models may reject newer projects. Test uses your
					selected model without saving; save to apply it to handwriting checks. Model access and
					quota depend on your Google project.
				</p>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<label for="gemini-api-key" class="text-sm font-semibold">Gemini API key</label>
					<span class="badge badge-outline badge-sm">
						{settings.hasGeminiKey ? 'Key saved' : 'No key saved'}
					</span>
				</div>
				<input
					id="gemini-api-key"
					class="input mt-2 w-full bg-base-200"
					type="password"
					autocomplete="new-password"
					bind:value={geminiApiKey}
					maxlength="512"
					disabled={clearGeminiKey}
					placeholder={settings.hasGeminiKey
						? 'Leave blank to keep saved key'
						: 'Enter Gemini API key'}
					aria-describedby="gemini-key-help"
				/>
				<p id="gemini-key-help" class="mt-2 text-xs text-base-content/60">
					Saved keys stay hidden. Test uses the entered key, or the saved key when blank. Testing
					does not save changes.
				</p>
				{#if settings.hasGeminiKey}
					<label class="mt-3 flex items-center gap-2 text-xs">
						<input type="checkbox" class="checkbox checkbox-sm" bind:checked={clearGeminiKey} />
						Remove saved key when saving
					</label>
				{/if}
			</div>
		</fieldset>
		{#if message}
			<p role={failed ? 'alert' : 'status'} class:text-error={failed} class="text-sm">{message}</p>
		{/if}
	</div>
	<footer
		class="flex flex-wrap items-center justify-end gap-3 border-t border-base-300 bg-base-200/30 px-5 py-4 sm:px-6"
	>
		<button
			type="button"
			class="btn btn-outline btn-sm"
			disabled={disabled ||
				!!pending ||
				clearGeminiKey ||
				(!settings.hasGeminiKey && !geminiApiKey.trim())}
			onclick={test}
		>
			{pending === 'test' ? 'Testing Gemini…' : 'Test Gemini'}
		</button>
		<button type="submit" class="btn btn-primary btn-sm" disabled={disabled || !!pending || !dirty}>
			{pending === 'save' ? 'Saving…' : 'Save verification settings'}
		</button>
	</footer>
</form>
