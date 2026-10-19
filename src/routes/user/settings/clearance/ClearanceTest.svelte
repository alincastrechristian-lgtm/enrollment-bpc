<script lang="ts">
	import BorderEditor from '#lib/clearance/BorderEditor.svelte';
	import DefinedTemplateCheck from '#lib/clearance/DefinedTemplateCheck.svelte';
	import type { TemplateInfo } from '#lib/clearance/definition.js';
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
	let error = $state('');
	let destroyed = false;
	const locked = $derived(disabled || loading || checking);
	$effect(() => onbusychange(loading || checking));
	onDestroy(() => {
		destroyed = true;
		onbusychange(false);
	});

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
				Choose a filled clearance to test against the saved marked areas. Student identity and
				signatures are not verified.
			</p>
		</div>
	</div>
	<div class="grid items-start gap-6 xl:grid-cols-2">
		<div class="portal-panel min-w-0 space-y-4 p-5 sm:p-6" aria-busy={loading}>
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
				stays in your browser and does not replace the saved template.
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
			<DefinedTemplateCheck
				showReference
				{source}
				{template}
				definition={template.definition}
				{corners}
				disabled={disabled || loading || drawing || dragging}
				onbusychange={(value) => {
					checking = value;
				}}
			/>
		{:else}
			<p class="portal-panel p-5 text-sm text-base-content/65">
				Mark and save the reference details above to enable testing. Uploading a new template
				requires new area setup.
			</p>
		{/if}
	</div>
</section>
