<script lang="ts">
	import {
		saveClearanceVerification,
		testClearanceAi,
		fetchClearanceOpenaiModels,
		fetchClearanceOllamaModels
	} from '#lib/actions/clearance.remote.js';
	import { AI_PROVIDER_LABELS, aiProviderSchema, type AiProvider } from '#lib/clearance/ai.js';
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
			aiProvider?: AiProvider;
			hasOpenaiKey?: boolean;
			openaiModel?: string;
			ollamaBaseUrl?: string;
			ollamaModel?: string;
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
	let aiProvider = $state<AiProvider>(untrack(() => settings.aiProvider ?? 'gemini'));
	let openaiApiKey = $state('');
	let clearOpenaiKey = $state(false);
	let openaiModels = $state<string[]>([]);
	let customOpenaiModel = $state(false);
	let openaiModel = $state(untrack(() => settings.openaiModel ?? 'gpt-4.1-mini'));
	const openaiModelChoices = $derived([
		...new Set([
			...(openaiModel ? [openaiModel] : []),
			...(openaiModels.length ? openaiModels : ['gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o-mini'])
		])
	]);
	let ollamaBaseUrl = $state(untrack(() => settings.ollamaBaseUrl ?? 'http://localhost:11434'));
	let ollamaModel = $state(untrack(() => settings.ollamaModel ?? 'qwen3-vl:4b'));
	let ollamaModels = $state<string[]>([]);
	let customOllamaModel = $state(false);
	const ollamaModelChoices = $derived([
		...new Set([...(ollamaModel ? [ollamaModel] : []), ...ollamaModels])
	]);
	$effect(() => {
		void ollamaBaseUrl;
		ollamaModels = [];
	});
	let geminiApiKey = $state('');
	let geminiModel = $state<GeminiModel>(
		untrack(() => settings.geminiModel ?? DEFAULT_GEMINI_MODEL)
	);
	let clearGeminiKey = $state(false);
	const removingKey = $derived(
		aiProvider === 'gemini' ? clearGeminiKey : aiProvider === 'openai' ? clearOpenaiKey : false
	);
	const canTest = $derived(
		aiProvider === 'ollama'
			? !!ollamaBaseUrl.trim() && !!ollamaModel.trim()
			: aiProvider === 'openai'
				? !!(settings.hasOpenaiKey || openaiApiKey.trim())
				: !!(settings.hasGeminiKey || geminiApiKey.trim())
	);
	let pending = $state<'save' | 'test' | 'models' | null>(null);
	let message = $state('');
	let failed = $state(false);
	const dirty = $derived(
		automatedClearanceVerificationEnabled !== settings.automatedClearanceVerificationEnabled ||
			personalInfoVerificationEnabled !== settings.personalInfoVerificationEnabled ||
			!!geminiApiKey.trim() ||
			geminiModel !== (settings.geminiModel ?? DEFAULT_GEMINI_MODEL) ||
			clearGeminiKey ||
			clearOpenaiKey ||
			!!openaiApiKey.trim() ||
			aiProvider !== (settings.aiProvider ?? 'gemini') ||
			openaiModel !== (settings.openaiModel ?? 'gpt-4.1-mini') ||
			ollamaBaseUrl !== (settings.ollamaBaseUrl ?? 'http://localhost:11434') ||
			ollamaModel !== (settings.ollamaModel ?? 'qwen3-vl:4b')
	);
	$effect(() => onbusychange(!!pending));
	onDestroy(() => onbusychange(false));
	$effect(() => {
		void openaiApiKey;
		void clearOpenaiKey;
		openaiModels = [];
	});
	async function fetchModels() {
		if (disabled || pending || removingKey) return;
		pending = 'models';
		message = '';
		failed = false;
		const ollama = aiProvider === 'ollama';
		const label = ollama ? 'Ollama' : 'OpenAI';
		if (ollama) ollamaModels = [];
		else openaiModels = [];
		try {
			const result = ollama
				? await fetchClearanceOllamaModels({ ollamaBaseUrl: ollamaBaseUrl.trim() })
				: await fetchClearanceOpenaiModels({ openaiApiKey: openaiApiKey.trim() || undefined });
			if (result.success) {
				if (ollama) {
					ollamaModels = result.models;
					customOllamaModel = false;
				} else {
					openaiModels = result.models;
					customOpenaiModel = false;
				}
				message = result.models.length
					? `Fetched ${result.models.length} available ${label} models. Choose one below, then test its compatibility.`
					: ollama
						? 'No models are installed on this Ollama server. Pull a vision-capable model first.'
						: 'OpenAI returned no models for this key. Check project access and key permissions.';
			} else {
				failed = true;
				message = result.message;
			}
		} catch (cause) {
			failed = true;
			message = getErrorMessage(cause, `Could not fetch ${label} models. Try again.`);
		} finally {
			pending = null;
		}
	}
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
				clearGeminiKey,
				aiProvider,
				openaiApiKey: openaiApiKey.trim() || undefined,
				clearOpenaiKey,
				openaiModel,
				ollamaBaseUrl,
				ollamaModel
			});
			geminiApiKey = '';
			openaiApiKey = '';
			clearOpenaiKey = false;
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
		if (disabled || pending || removingKey) return;
		pending = 'test';
		message = '';
		failed = false;
		try {
			const result = await testClearanceAi({
				aiProvider,
				openaiApiKey: openaiApiKey.trim() || undefined,
				openaiModel,
				ollamaBaseUrl,
				ollamaModel,
				geminiApiKey: geminiApiKey.trim() || undefined,
				geminiModel
			});
			message = result.message;
			failed = !result.success;
		} catch (cause) {
			failed = true;
			message = getErrorMessage(cause, 'Could not test AI provider. Try again.');
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
						Checks writing presence and uses the selected AI provider to compare personal details
						with the student record. When off, template and office checks continue, and results show
						personal verification was skipped. Applies to new uploads.
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
				<label for="ai-provider" class="block text-sm font-semibold">Handwriting AI provider</label>
				<select
					id="ai-provider"
					class="select mt-2 mb-5 w-full bg-base-200"
					bind:value={aiProvider}
				>
					{#each aiProviderSchema.options as provider (provider)}
						<option value={provider}>{AI_PROVIDER_LABELS[provider]}</option>
					{/each}
				</select>
				{#if aiProvider === 'gemini'}
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
				{:else if aiProvider === 'openai'}
					<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
						<label for="openai-model" class="text-sm font-semibold">OpenAI model</label>
						<button
							type="button"
							class="btn btn-outline btn-sm"
							onclick={fetchModels}
							disabled={clearOpenaiKey || (!settings.hasOpenaiKey && !openaiApiKey.trim())}
						>
							{pending === 'models' ? 'Fetching models...' : 'Fetch available models'}
						</button>
					</div>
					{#if customOpenaiModel}
						<div class="flex items-center gap-2">
							<input
								id="openai-model"
								class="input w-full bg-base-200"
								bind:value={openaiModel}
								required
								maxlength="120"
								placeholder="Enter model ID"
								aria-describedby="openai-model-help"
							/>
							<button
								type="button"
								class="btn shrink-0 btn-ghost btn-sm"
								onclick={() => (customOpenaiModel = false)}
							>
								Choose from list
							</button>
						</div>
					{:else}
						<select
							id="openai-model"
							class="select w-full bg-base-200"
							value={openaiModel}
							aria-describedby="openai-model-help"
							onchange={(event) => {
								if (event.currentTarget.value === '__custom__') customOpenaiModel = true;
								else openaiModel = event.currentTarget.value;
							}}
						>
							{#if !openaiModel}
								<option value="" disabled>Choose a model</option>
							{/if}
							{#each openaiModelChoices as model (model)}
								<option value={model}>{model}</option>
							{/each}
							<option value="__custom__">Custom model...</option>
						</select>
					{/if}
					<p id="openai-model-help" class="mt-2 mb-5 text-xs text-base-content/60">
						Fetch models using the entered or saved key. Run Test AI connection to confirm image and
						structured-output support before saving.
					</p>
					<div class="flex flex-wrap items-center justify-between gap-2">
						<label for="openai-api-key" class="text-sm font-semibold">OpenAI API key</label>
						<span class="badge badge-outline badge-sm">
							{settings.hasOpenaiKey ? 'Key saved' : 'No key saved'}
						</span>
					</div>
					<input
						id="openai-api-key"
						class="input mt-2 w-full bg-base-200"
						type="password"
						autocomplete="new-password"
						bind:value={openaiApiKey}
						maxlength="512"
						disabled={clearOpenaiKey}
						placeholder={settings.hasOpenaiKey
							? 'Leave blank to keep saved key'
							: 'Enter OpenAI API key'}
					/>
					<p class="mt-2 text-xs text-base-content/60">
						Requires an OpenAI API key and API billing; ChatGPT subscriptions do not include API
						credit. Saved keys stay hidden. Fetching and testing do not save changes.
					</p>
					{#if settings.hasOpenaiKey}
						<label class="mt-3 flex items-center gap-2 text-xs">
							<input type="checkbox" class="checkbox checkbox-sm" bind:checked={clearOpenaiKey} />
							Remove saved key when saving
						</label>
					{/if}
				{:else}
					<label for="ollama-url" class="block text-sm font-semibold">Ollama server address</label>
					<input
						id="ollama-url"
						class="input mt-2 w-full bg-base-200"
						type="url"
						bind:value={ollamaBaseUrl}
						required
						maxlength="500"
						placeholder="http://192.168.254.63:11434"
					/>
					<p class="mt-2 mb-5 text-xs text-base-content/60">
						Address must be reachable from the application server. Localhost refers to that server
						or container, not your browser.
					</p>
					<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
						<label for="ollama-model" class="text-sm font-semibold">Ollama vision model</label>
						<button
							type="button"
							class="btn btn-outline btn-sm"
							onclick={fetchModels}
							disabled={!ollamaBaseUrl.trim()}
						>
							{pending === 'models' ? 'Fetching models...' : 'Fetch available models'}
						</button>
					</div>
					{#if customOllamaModel}
						<div class="flex items-center gap-2">
							<input
								id="ollama-model"
								class="input w-full bg-base-200"
								bind:value={ollamaModel}
								required
								maxlength="120"
								placeholder="Enter model ID"
							/>
							<button
								type="button"
								class="btn shrink-0 btn-ghost btn-sm"
								onclick={() => (customOllamaModel = false)}
							>
								Choose from list
							</button>
						</div>
					{:else}
						<select
							id="ollama-model"
							class="select w-full bg-base-200"
							value={ollamaModel}
							onchange={(event) => {
								if (event.currentTarget.value === '__custom__') customOllamaModel = true;
								else ollamaModel = event.currentTarget.value;
							}}
						>
							{#if !ollamaModel}
								<option value="" disabled>Choose a model</option>
							{/if}
							{#each ollamaModelChoices as model (model)}
								<option value={model}>{model}</option>
							{/each}
							<option value="__custom__">Custom model...</option>
						</select>
					{/if}
					<p class="mt-2 text-xs text-base-content/60">
						Fetch installed models from the entered server without saving changes. Choose a
						vision-capable model and run Test AI connection; text-only models cannot read clearance
						images.
					</p>
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
			disabled={disabled || !!pending || removingKey || !canTest}
			onclick={test}
		>
			{pending === 'test' ? 'Testing AI…' : 'Test AI connection'}
		</button>
		<button type="submit" class="btn btn-primary btn-sm" disabled={disabled || !!pending || !dirty}>
			{pending === 'save' ? 'Saving…' : 'Save verification settings'}
		</button>
	</footer>
</form>
