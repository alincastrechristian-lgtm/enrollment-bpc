<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { asset } from '$app/paths';
	import BorderEditor from './BorderEditor.svelte';
	import { REFERENCE_CORNERS, UNIT_CORNERS, validCorners, type Corners } from './clearance';
	import { evaluateTemplate, type TemplateApproval, type TemplateResult } from './template';
	import DefinedTemplateCheck from './DefinedTemplateCheck.svelte';
	import type { TemplateInfo } from './definition';

	let {
		source,
		savedTemplate,
		corners,
		disabled,
		semester = $bindable(),
		schoolYear = $bindable(),
		onbusychange,
		onresult = () => {}
	}: {
		source: HTMLCanvasElement | undefined;
		savedTemplate: TemplateInfo | null;
		corners: Corners;
		disabled: boolean;
		semester: string;
		schoolYear: string;
		onbusychange: (busy: boolean) => void;
		onresult?: (approval: TemplateApproval | undefined) => void;
	} = $props();
	let reference = $state<HTMLCanvasElement>();
	let referenceUrl = $state('');
	let referenceLabel = $state('');
	let referenceCorners = $state<Corners>(structuredClone(REFERENCE_CORNERS));
	let drawing = $state(false);
	let dragging = $state(false);
	let detection = $state<'found' | 'missing' | null>(null);
	let loading = $state(false);
	let running = $state(false);
	let progress = $state('');
	let error = $state('');
	let result = $state<TemplateResult>();
	let controller: AbortController | undefined;
	let destroyed = false;
	const years = $derived(schoolYear.trim().match(/^(20\d{2})-(20\d{2})$/));
	const termReady = $derived(
		(semester === '1' || semester === '2') &&
			years !== null &&
			Number(years[2]) === Number(years[1]) + 1
	);
	const labels = {
		pass: 'Template matches',
		review: 'Needs review',
		fail: 'Wrong template or term'
	};
	const badges = { pass: 'badge-success', review: 'badge-warning', fail: 'badge-error' };
	$effect(() => {
		void source;
		void reference;
		JSON.stringify(corners);
		JSON.stringify(referenceCorners);
		void semester;
		void schoolYear;
		invalidate();
	});
	function invalidate() {
		result = undefined;
		onresult(undefined);
	}
	function setReference(image: HTMLCanvasElement, label: string, points: Corners) {
		reference = image;
		referenceUrl = image.toDataURL('image/jpeg', 0.95);
		referenceLabel = label;
		referenceCorners = structuredClone(points);
		drawing = false;
		detection = null;
	}
	async function builtin(initial = false) {
		if (loading || running || (!initial && disabled)) return;
		loading = true;
		onbusychange(true);
		error = '';
		invalidate();
		try {
			const processor = await import('./scan.client');
			setReference(
				await processor.loadImage(asset('clearance-reference.jpg')),
				'Built-in blank BPC clearance',
				REFERENCE_CORNERS
			);
		} catch {
			error = 'Could not load blank template. Upload a JPG, PNG or WebP template.';
		} finally {
			loading = false;
			if (!destroyed) onbusychange(false);
		}
	}
	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || disabled || running || loading) return;
		loading = true;
		onbusychange(true);
		error = '';
		invalidate();
		try {
			const processor = await import('./scan.client');
			const image = await processor.loadUpload(file);
			const found = processor.detectBorder(image);
			setReference(image, file.name, found ?? UNIT_CORNERS);
			drawing = !found;
			detection = found ? 'found' : 'missing';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not load template.';
		} finally {
			loading = false;
			if (!destroyed) onbusychange(false);
		}
	}
	async function compare() {
		if (
			!source ||
			!reference ||
			!termReady ||
			!validCorners(corners) ||
			disabled ||
			running ||
			loading ||
			drawing ||
			dragging ||
			!validCorners(referenceCorners)
		)
			return;
		running = true;
		onbusychange(true);
		error = '';
		invalidate();
		controller = new AbortController();
		try {
			const processor = await import('./scan.client');
			const blank = processor.straighten(reference, referenceCorners);
			const submitted = processor.straighten(source, corners);
			const layout = processor.inspectTemplateLayout(submitted, blank);
			const templateText = await processor.recognizePrinted(
				reference,
				referenceCorners,
				(text) => {
					progress = `Template: ${text}`;
				},
				controller.signal
			);
			const uploadedText = await processor.recognizePrinted(
				source,
				corners,
				(text) => {
					progress = `Upload: ${text}`;
				},
				controller.signal
			);
			if (controller.signal.aborted) return;
			result = evaluateTemplate(templateText, uploadedText, layout, { semester, schoolYear });
			if (result.verdict === 'pass') onresult({ reference: blank });
		} catch (cause) {
			error =
				cause instanceof Error
					? cause.message
					: 'Template check failed. Retry with clearer images.';
		} finally {
			running = false;
			progress = '';
			controller = undefined;
			if (!destroyed) onbusychange(false);
		}
	}
	onMount(() => {
		if (!savedTemplate) void builtin(true);
	});
	onDestroy(() => {
		destroyed = true;
		controller?.abort();
		onbusychange(false);
	});
</script>

{#if savedTemplate}
	{#if savedTemplate.definition}
		<fieldset {disabled} class="grid gap-3 sm:grid-cols-2">
			<legend class="mb-2 text-sm font-bold">Test enrollment term</legend>
			<label class="text-sm">
				Semester
				<select class="select mt-1 w-full" bind:value={semester}>
					<option value="1">1st Semester</option>
					<option value="2">2nd Semester</option>
				</select>
			</label>
			<label class="text-sm">
				School year
				<input
					class="input mt-1 w-full"
					bind:value={schoolYear}
					placeholder="2026-2027"
					maxlength="9"
				/>
			</label>
		</fieldset>
		<DefinedTemplateCheck
			{source}
			{corners}
			template={savedTemplate}
			definition={savedTemplate.definition}
			term={{ semester, schoolYear }}
			{disabled}
			{onbusychange}
		/>
		<p class="text-xs text-base-content/65">
			Custom templates support format testing here. The handwriting tools below use the original BPC
			layout and remain locked for custom templates.
		</p>
	{:else}
		<p class="portal-panel p-5 text-sm">
			The saved template needs area setup in Settings → Clearance before it can be tested.
		</p>
	{/if}
{:else}
	<section
		class="portal-panel min-w-0"
		aria-labelledby="template-title"
		aria-busy={loading || running}
	>
		<div class="card-body gap-4">
			<div>
				<h2 id="template-title" class="font-bold">Template check first</h2>
				<p class="mt-1 text-sm text-base-content/65">
					Upload a blank template of this BPC five-department form. Compare its printed wording and
					layout before reading student handwriting.
				</p>
			</div>
			<label class="space-y-1 text-sm">
				<span class="font-medium">Blank clearance template</span>
				<input
					type="file"
					aria-label="Upload blank clearance template"
					class="file-input w-full"
					accept="image/jpeg,image/png,image/webp"
					onchange={upload}
					disabled={disabled || loading || running}
				/>
			</label>
			<button
				type="button"
				class="btn btn-outline btn-sm"
				onclick={() => builtin()}
				disabled={disabled || loading || running}
			>
				Use built-in blank template
			</button>
			{#if referenceUrl}
				<p class="text-sm font-medium break-words">{referenceLabel}</p>
				<details class="rounded-lg border border-base-300 p-3" open={drawing}>
					<summary class="cursor-pointer text-sm">View / adjust template outline</summary>
					<div class="mt-3">
						{#key reference}
							<BorderEditor
								src={referenceUrl}
								bind:corners={referenceCorners}
								bind:drawing
								bind:dragging
								disabled={disabled || loading || running}
								{detection}
								onchange={() => {
									detection = null;
									invalidate();
								}}
							/>
						{/key}
					</div>
				</details>
			{/if}
			<div class="grid grid-cols-2 gap-3">
				<label class="space-y-1 text-sm">
					<span>Required semester</span>
					<select
						aria-label="Required semester"
						class="select w-full"
						bind:value={semester}
						disabled={disabled || running || loading}
					>
						<option value="" disabled>Choose semester</option>
						<option value="1">1st Semester</option>
						<option value="2">2nd Semester</option>
					</select>
				</label>
				<label class="space-y-1 text-sm">
					<span>Required academic year</span>
					<input
						aria-label="Required academic year"
						class="input w-full"
						bind:value={schoolYear}
						placeholder="2025-2026"
						maxlength="9"
						disabled={disabled || running || loading}
					/>
				</label>
			</div>
			{#if !termReady}
				<p class="text-xs text-base-content/65">
					Choose a semester and enter consecutive academic years, for example 2025-2026.
				</p>
			{/if}
			<button
				type="button"
				class="btn btn-primary"
				onclick={compare}
				disabled={disabled ||
					loading ||
					running ||
					!source ||
					!reference ||
					!termReady ||
					!validCorners(corners) ||
					drawing ||
					dragging ||
					!validCorners(referenceCorners)}
			>
				{#if running || loading}
					<span class="loading loading-sm loading-spinner" aria-hidden="true"></span>
				{/if}
				{running ? 'Comparing printed form…' : loading ? 'Loading template…' : 'Compare template'}
			</button>
			{#if running}
				<p role="status" class="text-sm">{progress || 'Aligning images…'}</p>
				<button type="button" class="btn btn-ghost btn-sm" onclick={() => controller?.abort()}>
					Cancel template check
				</button>
			{/if}
			{#if error}
				<p role="alert" class="text-sm text-error">{error}</p>
			{/if}
			{#if result}
				<p role="status">
					<span class={`badge ${badges[result.verdict]}`}>{labels[result.verdict]}</span>
				</p>
				<p class="text-sm">
					{result.verdict === 'pass'
						? 'Printed form and required term match. Student identity checking is unlocked.'
						: 'Handwriting stays locked. Review the findings and adjust outlines or upload a clearer form.'}
				</p>
				<details open={result.verdict !== 'pass'}>
					<summary class="cursor-pointer text-sm">Printed text and layout findings</summary>
					<ul class="divide-y divide-base-300">
						{#each result.checks as check (check.label)}
							<li class="space-y-1 py-2">
								<div class="flex justify-between gap-2 text-sm">
									<strong>{check.label}</strong>
									<span class={`badge badge-sm ${badges[check.verdict]}`}>
										{check.verdict === 'pass'
											? 'Match'
											: check.verdict === 'review'
												? 'Review'
												: 'Mismatch'}
									</span>
								</div>
								<p class="text-xs text-base-content/70">{check.detail}</p>
							</li>
						{/each}
					</ul>
				</details>
			{:else}
				<p class="text-sm text-base-content/65">
					Choose a submitted clearance and confirm both outlines, then compare.
				</p>
			{/if}
			<p class="text-xs text-base-content/65">
				Template stays in this browser until reload. Name, number, signatures and checkbox interiors
				are excluded from layout comparison. A matching format does not authenticate a document.
			</p>
		</div>
	</section>
{/if}
