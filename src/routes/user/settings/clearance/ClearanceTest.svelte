<script lang="ts">
	import BorderEditor from '#lib/clearance/BorderEditor.svelte';
	import DefinedTemplateCheck from '#lib/clearance/DefinedTemplateCheck.svelte';
	import { hasIdentityAreas, type TemplateInfo } from '#lib/clearance/definition.js';
	import { readClearanceTestHandwriting } from '#lib/actions/clearance.remote.js';
	import type { IdentityReadings } from '#lib/clearance/identity.js';
	import { MAX_HANDWRITING_CROP_BASE64_LENGTH } from '#lib/clearance/ai.js';
	import { isHttpError } from '@sveltejs/kit';
	import { getErrorMessage } from '#lib/errors.js';
	import { UNIT_CORNERS, type Corners } from '#lib/clearance/clearance.js';
	import { ScanLine } from '@lucide/svelte';
	import { onDestroy } from 'svelte';

	let {
		template,
		disabled,
		onbusychange
	}: {
		template: TemplateInfo;
		disabled: boolean;
		onbusychange: (busy: boolean) => void;
	} = $props();
	let source = $state<HTMLCanvasElement>();
	let sourceUrl = $state('');
	let filename = $state('');
	let corners = $state<Corners>(structuredClone(UNIT_CORNERS));
	let detection = $state<'found' | 'missing' | null>(null);
	let drawing = $state(false);
	let dragging = $state(false);
	let loading = $state(false);
	let checking = $state(false);
	let includeHandwriting = $state(false);
	let reading = $state(false);
	let handwriting = $state<IdentityReadings>();
	let cropPreviews = $state<{ name: string; studentNumber: string }>();
	let handwritingError = $state('');
	let readingVersion = 0;
	let aligning = $state(false);
	let error = $state('');
	let destroyed = false;
	// Simulation only. Student uploads use the enrollment stored on the server.
	let semester = $state('1');
	let schoolYear = $state(`${new Date().getFullYear()}-${new Date().getFullYear() + 1}`);
	const locked = $derived(disabled || loading || checking || aligning || reading);
	$effect(() => onbusychange(loading || checking || aligning || reading));
	$effect(() => {
		void source;
		JSON.stringify(corners);
		void template.revision;
		void includeHandwriting;
		readingVersion++;
		handwriting = undefined;
		cropPreviews = undefined;
		handwritingError = '';
	});
	onDestroy(() => {
		destroyed = true;
		onbusychange(false);
	});

	async function readHandwriting() {
		if (!source || !template.definition || !includeHandwriting || locked || drawing || dragging)
			return;
		reading = true;
		handwriting = undefined;
		handwritingError = '';
		const version = readingVersion;
		try {
			const processor = await import('#lib/clearance/scan.client.js');
			const crops = processor.identityCrops(source, corners, template.definition);
			if (destroyed || version !== readingVersion) return;
			cropPreviews = {
				name: crops.name.toDataURL('image/png'),
				studentNumber: crops.studentNumber.toDataURL('image/png')
			};
			const encoded = {
				name: cropPreviews.name.split(',')[1],
				studentNumber: cropPreviews.studentNumber.split(',')[1]
			};
			if (Object.values(encoded).some((crop) => crop.length > MAX_HANDWRITING_CROP_BASE64_LENGTH)) {
				handwritingError =
					'Each encoded handwriting crop must be at most 8 MiB. Narrow the saved input areas or use a smaller image.';
				return;
			}
			const result = await readClearanceTestHandwriting({
				revision: template.revision,
				crops: encoded
			});
			if (!destroyed && version === readingVersion) {
				if (result.success) handwriting = result.readings;
				else handwritingError = result.message;
			}
		} catch (cause) {
			if (!destroyed && version === readingVersion)
				handwritingError = isHttpError(cause, 413)
					? 'The live server rejected the image size. Set BODY_SIZE_LIMIT=20M, allow at least 20 MiB in the reverse proxy, and restart or redeploy the application.'
					: getErrorMessage(cause, 'Could not read handwriting. Try again.');
		} finally {
			reading = false;
		}
	}

	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || locked) return;
		loading = true;
		error = '';
		// Clear previous evidence even when the replacement image cannot be opened.
		source = undefined;
		sourceUrl = '';
		filename = '';
		try {
			const processor = await import('#lib/clearance/scan.client.js');
			const image = await processor.loadUpload(file);
			if (destroyed) return;
			const found = processor.detectBorder(image);
			source = image;
			sourceUrl = image.toDataURL('image/jpeg', 0.95);
			filename = file.name;
			corners = structuredClone(found ?? UNIT_CORNERS);
			detection = found ? 'found' : 'missing';
			drawing = !found;
			dragging = false;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not open this image.';
		} finally {
			loading = false;
		}
	}
</script>

<section class="space-y-5" aria-labelledby="clearance-test-title">
	<div class="flex items-start gap-3">
		<div class="rounded-xl bg-primary/10 p-2.5 text-primary">
			<ScanLine size={22} aria-hidden="true" />
		</div>
		<div>
			<h2 id="clearance-test-title" class="text-lg font-bold">Test a clearance</h2>
			<p class="mt-1 text-sm text-base-content/65">
				Try a filled form against your saved settings. Save setup changes before testing.
			</p>
		</div>
	</div>
	<div class="grid items-start gap-6 xl:grid-cols-2">
		<div class="portal-panel min-w-0 space-y-4 p-5 sm:p-6" aria-busy={loading}>
			<fieldset disabled={locked} class="grid gap-3 sm:grid-cols-2">
				<legend class="mb-2 text-sm font-bold">Test enrollment term</legend>
				<label class="text-sm">
					Semester
					<input
						class="input mt-1 w-full"
						aria-label="Test enrollment semester"
						type="number"
						min="1"
						step="1"
						value={semester}
						oninput={(event) => (semester = event.currentTarget.value)}
					/>
				</label>
				<label class="text-sm">
					School year
					<input
						class="input mt-1 w-full"
						aria-label="Test enrollment school year"
						bind:value={schoolYear}
						placeholder="2026-2027"
						maxlength="9"
					/>
				</label>
			</fieldset>
			<p class="text-xs text-base-content/60">
				Used for this test only. Student uploads are checked against their enrollment semester and
				school year. These values are not saved in the template.
			</p>
			<label class="block space-y-2">
				<span class="text-sm font-semibold">Upload test clearance</span>
				<input
					type="file"
					accept="image/jpeg,image/png,image/webp"
					class="file-input w-full border-base-300 bg-base-200"
					onchange={upload}
					disabled={locked || !template.definition}
					aria-describedby="clearance-test-help"
				/>
			</label>
			<p id="clearance-test-help" class="text-xs text-base-content/60">
				JPG, PNG or WebP up to 15 MB. Confirm both form outlines before comparing. The test image
				stays in your browser unless you run the optional AI handwriting test. It does not replace
				the saved template.
			</p>
			{#if loading}
				<p role="status" class="text-sm">Opening image and finding the form border...</p>
			{/if}
			{#if error}
				<p role="alert" class="text-sm text-error">{error}</p>
			{/if}
			{#if sourceUrl}
				<p class="text-sm font-semibold break-all">{filename}</p>
				{#key source}
					<BorderEditor
						src={sourceUrl}
						{template}
						bind:detecting={aligning}
						bind:corners
						bind:drawing
						bind:dragging
						disabled={locked}
						{detection}
						onchange={() => {
							detection = null;
						}}
					/>
				{/key}
			{:else if !loading}
				<div
					class="rounded-xl border border-dashed border-base-300 bg-base-200/40 p-8 text-center text-sm text-base-content/60"
				>
					The uploaded clearance and adjustable outline will appear here.
				</div>
			{/if}
		</div>
		{#if template.definition}
			<div class="min-w-0 space-y-5">
				<DefinedTemplateCheck
					showReference
					{source}
					{template}
					definition={template.definition}
					term={{ semester, schoolYear }}
					{corners}
					disabled={disabled || loading || aligning || drawing || dragging || reading}
					onbusychange={(value) => {
						checking = value;
					}}
				/>
				<section
					class="portal-panel space-y-4 p-5 sm:p-6"
					aria-label="AI handwriting test"
					aria-busy={reading}
				>
					<label class="flex cursor-pointer items-start gap-3">
						<input
							type="checkbox"
							class="checkbox mt-0.5 checkbox-sm"
							bind:checked={includeHandwriting}
							disabled={locked}
						/>
						<span>
							<span class="block text-sm font-semibold">Test handwriting with AI</span>
							<span class="mt-1 block text-xs text-base-content/60">
								Preview the student name and number AI reads from the saved input areas. No identity
								comparison or clearance approval.
							</span>
						</span>
					</label>
					{#if includeHandwriting}
						<p class="text-xs text-base-content/60">
							Click Read handwriting to send only the name and student number crops to the saved AI
							provider. This diagnostic runs even when personal information verification is
							disabled.
						</p>
						{#if !hasIdentityAreas(template.definition)}
							<p class="text-sm text-warning">
								Mark and save both student name and number areas first.
							</p>
						{/if}
						<button
							type="button"
							class="btn btn-outline btn-sm"
							onclick={readHandwriting}
							disabled={locked ||
								!source ||
								drawing ||
								dragging ||
								!hasIdentityAreas(template.definition)}
						>
							{reading ? 'Reading handwriting…' : 'Read handwriting'}
						</button>
						{#if cropPreviews}
							<details class="rounded-xl border border-base-300 p-3">
								<summary class="cursor-pointer text-sm font-semibold">View cropped fields</summary>
								<p class="mt-2 text-xs text-base-content/60">
									Check that handwriting is complete and the name crop avoids signatures. Adjust the
									saved input areas or form outline if needed.
								</p>
								<div class="mt-3 grid gap-3 sm:grid-cols-2">
									<figure>
										<figcaption class="mb-2 text-xs font-semibold">Student name crop</figcaption>
										<img
											src={cropPreviews.name}
											alt="Student name area sent for handwriting recognition"
											class="max-h-32 w-full rounded border border-base-300 object-contain"
										/>
									</figure>
									<figure>
										<figcaption class="mb-2 text-xs font-semibold">Student number crop</figcaption>
										<img
											src={cropPreviews.studentNumber}
											alt="Student number area sent for handwriting recognition"
											class="max-h-32 w-full rounded border border-base-300 object-contain"
										/>
									</figure>
								</div>
							</details>
						{/if}
						{#if reading}
							<p role="status" class="text-sm">AI is reading the selected fields…</p>
						{/if}
						{#if handwritingError}
							<p role="alert" class="text-sm text-error">{handwritingError}</p>
						{/if}
						{#if handwriting}
							<dl
								class="space-y-3 rounded-xl border border-base-300 bg-base-200/40 p-4 text-sm"
								aria-label="AI handwriting result"
							>
								<div>
									<dt class="font-semibold">Student name</dt>
									<dd class="mt-1 break-words whitespace-pre-wrap">
										{handwriting.name || 'No readable text returned'}
									</dd>
								</div>
								<div>
									<dt class="font-semibold">Student number (without MA-)</dt>
									<dd class="mt-1 break-words whitespace-pre-wrap">
										{handwriting.studentNumber || 'No readable text returned'}
									</dd>
								</div>
							</dl>
							{#each [...new Set(Object.values(handwriting.warnings ?? {}))] as warning (warning)}
								<p class="text-sm text-warning">{warning}</p>
							{/each}
						{/if}
					{/if}
				</section>
			</div>
		{:else}
			<p class="portal-panel p-5 text-sm text-base-content/65">
				Mark and save the reference details above to enable testing. Uploading a new template
				requires new area setup.
			</p>
		{/if}
	</div>
</section>
