<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { asset } from '$app/paths';
	import {
		evaluate,
		HEIGHT,
		overall,
		REFERENCE_CORNERS,
		READING_LABELS,
		REGIONS,
		ROW_REGIONS,
		UNIT_CORNERS,
		validCorners,
		WIDTH,
		type Corners,
		type Expected,
		type Scan
	} from '#lib/clearance/clearance.js';
	import type * as Processor from '#lib/clearance/scan.client.js';
	import BorderEditor from '#lib/clearance/BorderEditor.svelte';
	import IdentityCheck from './IdentityCheck.svelte';
	import TemplateCheck from '#lib/clearance/TemplateCheck.svelte';
	import type { TemplateApproval } from '#lib/clearance/template.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const referenceUrl = asset('clearance-reference.jpg');
	const writtenExample: Expected = {
		name: 'Jonnel Mrei Palileo',
		studentNumber: 'MA-23016578',
		course: 'BSIS',
		year: '3',
		section: 'A',
		semester: '2',
		schoolYear: '2025-2026'
	};
	const writtenCorners: Corners = [
		{ x: 315 / 2048, y: 33 / 1218 },
		{ x: 1762 / 2048, y: 0 },
		{ x: 1864 / 2048, y: 1110 / 1218 },
		{ x: 351 / 2048, y: 1 }
	];
	let expected = $state<Expected>({ ...writtenExample });
	let source = $state<HTMLCanvasElement>();
	let sourceUrl = $state('');
	let sourceLabel = $state('');
	let corners = $state<Corners>(structuredClone(REFERENCE_CORNERS));
	let selecting = $state(false);
	let adjusting = $state(false);
	let borderDetection = $state<'found' | 'missing' | null>(null);
	let scan = $state<Scan>();
	let preview = $state('');
	let crops = $state<{ label: string; url: string; text: string; confidence: number }[]>([]);
	let busy = $state(false);
	let templateBusy = $state(false);
	let identityBusy = $state(false);
	let templateApproval = $state<TemplateApproval>();
	const locked = $derived(busy || templateBusy || identityBusy);
	let error = $state('');
	let progress = $state('');
	let overlay = $state(true);
	let controller = $state<AbortController>();
	const checks = $derived(scan ? evaluate(scan, expected) : []);
	const verdict = $derived(overall(checks));
	const verdictLabel = {
		pass: 'Prototype checks passed',
		review: 'Needs review',
		fail: 'Mismatch or incomplete'
	};
	const badge = { pass: 'badge-success', review: 'badge-warning', fail: 'badge-error' };
	const fields = [
		{ key: 'name', label: 'Student name' },
		{ key: 'studentNumber', label: 'Student number' },
		{ key: 'course', label: 'Course code' },
		{ key: 'year', label: 'Year level' },
		{ key: 'section', label: 'Section' },
		{ key: 'schoolYear', label: 'Academic year' }
	] as const;

	function clearResults() {
		scan = undefined;
		preview = '';
		crops = [];
		error = '';
	}
	function setSource(image: HTMLCanvasElement, label: string, points: Corners) {
		templateApproval = undefined;
		source = image;
		sourceUrl = image.toDataURL('image/jpeg', 0.92);
		sourceLabel = label;
		corners = structuredClone(points);
		selecting = false;
		borderDetection = null;
		clearResults();
	}
	async function loadWrittenExample() {
		if (busy) return;
		busy = true;
		clearResults();
		expected = { ...writtenExample };
		try {
			const processor = await import('#lib/clearance/scan.client.js');
			setSource(
				await processor.loadImage(asset('clearance-written-example.jpg')),
				'Written example · Jonnel Mrei Palileo',
				writtenCorners
			);
		} catch {
			error =
				'Could not load written example. Expected details are filled; try loading the example again.';
		} finally {
			busy = false;
		}
	}
	async function sample(filled = false) {
		if (locked) return;
		busy = true;
		clearResults();
		try {
			const processor = await import('#lib/clearance/scan.client.js');
			if (filled) {
				const reference =
					templateApproval?.reference ?? (await processor.loadReference(referenceUrl));
				setSource(
					processor.makeDemo(reference, expected),
					'Synthetic filled demo · not a real clearance',
					UNIT_CORNERS
				);
			} else
				setSource(
					await processor.loadImage(referenceUrl),
					'Your original blank reference photo',
					REFERENCE_CORNERS
				);
		} catch {
			error = 'Could not load reference image. Reload page and try again.';
		} finally {
			busy = false;
		}
	}
	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || locked) return;
		clearResults();
		busy = true;
		try {
			const processor = await import('#lib/clearance/scan.client.js');
			progress = 'Looking for the printed form border…';
			const image = await processor.loadUpload(file);
			const detected = processor.detectBorder(image);
			setSource(image, file.name, detected ?? UNIT_CORNERS);
			selecting = !detected;
			borderDetection = detected ? 'found' : 'missing';
		} catch (cause) {
			error =
				cause instanceof Error ? cause.message : 'Could not read image. Try another JPG or PNG.';
		} finally {
			busy = false;
			progress = '';
		}
	}
	async function analyze() {
		if (!source || locked || selecting || adjusting || !templateApproval) return;
		busy = true;
		clearResults();
		progress = 'Straightening form…';
		controller = new AbortController();
		try {
			const processor: typeof Processor = await import('#lib/clearance/scan.client.js');
			const image = processor.straighten(source, corners);
			preview = image.toDataURL('image/jpeg', 0.95);
			const reference = templateApproval.reference;
			const rows = processor.inspectMarks(image, reference);
			const readings = await processor.recognize(
				image,
				(text) => {
					progress = text;
				},
				controller.signal
			);
			scan = { ...readings, rows };
			crops = (Object.keys(REGIONS) as (keyof typeof REGIONS)[]).map((key) => ({
				label: READING_LABELS[key],
				url: processor.ocrCrop(image, key).toDataURL(),
				text: readings[key].text,
				confidence: readings[key].confidence
			}));
		} catch (cause) {
			error =
				cause instanceof Error
					? cause.message
					: `OCR failed: ${String(cause)}. Check internet connection and retry.`;
		} finally {
			busy = false;
			progress = '';
			controller = undefined;
		}
	}
	onMount(() => {
		void loadWrittenExample();
	});
	onDestroy(() => controller?.abort());
</script>

<svelte:head>
	<title>Clearance scan lab</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-base-200 text-base-content">
	<header class="border-b border-base-300 bg-base-100">
		<div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5">
			<div>
				<p class="text-xs font-semibold tracking-widest text-primary uppercase">
					BPC · Experimental
				</p>
				<h1 class="mt-1 text-2xl font-bold">Clearance scan lab</h1>
			</div>
			<span class="badge badge-outline">Standalone prototype · no records changed</span>
		</div>
	</header>
	<main class="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
		<p class="max-w-3xl text-sm text-base-content/75">
			Upload a blank template and compare the submitted clearance’s printed form first. Once it
			matches, check the student name and number against a student record. The identity check sends
			only those two crops to your local handwriting server. Full template inspection runs in this
			browser and downloads OCR language data on first use.
		</p>
		{#if error}
			<div role="alert" class="alert text-sm alert-error">{error}</div>
		{/if}
		<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
			<div class="space-y-6">
				<section
					class="card border border-base-300 bg-base-100 shadow-sm"
					aria-labelledby="scan-title"
				>
					<div class="card-body gap-4">
						<div>
							<h2 id="scan-title" class="card-title">1. Choose a clearance</h2>
							<p class="mt-1 text-sm text-base-content/65">
								JPG, PNG or WebP · up to 15 MB. Upload tries to find the form border automatically.
								Keep the form upright; check the suggested outline before analyzing.
							</p>
						</div>
						<input
							type="file"
							aria-label="Upload clearance image"
							accept="image/jpeg,image/png,image/webp"
							class="file-input w-full"
							onchange={upload}
							disabled={locked}
						/>
						<div class="flex flex-wrap gap-2">
							<button
								type="button"
								class="btn btn-outline btn-sm"
								onclick={loadWrittenExample}
								disabled={locked}
							>
								Load Jonnel's example
							</button>
							<button
								type="button"
								class="btn btn-outline btn-sm"
								onclick={() => sample()}
								disabled={locked}
							>
								Load blank reference
							</button>
							<button
								type="button"
								class="btn btn-outline btn-sm"
								onclick={() => sample(true)}
								disabled={locked}
							>
								Generate filled demo
							</button>
						</div>
						<p class="text-xs text-base-content/60">
							Jonnel's photo and expected details load automatically on reload. Blank reference
							should never pass. Filled demo adds printed test details and artificial marks;
							semester/year remain 2nd Semester, 2025–2026.
						</p>
						{#if sourceUrl}
							<p class="text-sm font-medium break-words">{sourceLabel}</p>
							{#key source}
								<BorderEditor
									src={sourceUrl}
									bind:corners
									bind:drawing={selecting}
									bind:dragging={adjusting}
									disabled={locked}
									detection={borderDetection}
									onchange={() => {
										borderDetection = null;
										clearResults();
									}}
								/>
							{/key}
						{/if}
					</div>
				</section>
				{#if preview}
					<section
						class="card border border-base-300 bg-base-100 shadow-sm"
						aria-labelledby="preview-title"
					>
						<div class="card-body">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<h2 id="preview-title" class="card-title">Aligned scan</h2>
								<label class="flex items-center gap-2 text-sm">
									<input type="checkbox" class="checkbox checkbox-sm" bind:checked={overlay} />
									Show inspection areas
								</label>
							</div>
							<div class="relative overflow-hidden rounded-lg border border-base-300 bg-white">
								<img src={preview} alt="Straightened clearance" class="block w-full" />
								{#if overlay}
									<svg
										class="pointer-events-none absolute inset-0 h-full w-full"
										viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
										aria-label="Blue boxes: text; orange boxes: checkboxes and signatures"
										role="img"
									>
										{#each Object.values(REGIONS) as box (box)}
											<rect
												x={box.x}
												y={box.y}
												width={box.width}
												height={box.height}
												fill="#2563eb15"
												stroke="#2563eb"
												stroke-width="2"
											/>
										{/each}
										{#each ROW_REGIONS as row (row.department)}
											{#each [row.cleared, row.notCleared, row.signature] as box (box)}
												<rect
													x={box.x}
													y={box.y}
													width={box.width}
													height={box.height}
													fill="#f9731615"
													stroke="#c2410c"
													stroke-width="2"
												/>
											{/each}
										{/each}
									</svg>
								{/if}
							</div>
							<p class="text-xs text-base-content/60">
								Blue: text extraction. Orange: checkbox interiors and signature/stamp ink.
								Misaligned boxes require corner adjustment.
							</p>
						</div>
					</section>
				{/if}
			</div>
			<div class="space-y-6">
				<TemplateCheck
					savedTemplate={data.savedTemplate}
					{source}
					{corners}
					disabled={busy || identityBusy || selecting || adjusting || !validCorners(corners)}
					bind:semester={expected.semester}
					bind:schoolYear={expected.schoolYear}
					onbusychange={(value) => {
						templateBusy = value;
					}}
					onresult={(approval) => {
						templateApproval = approval;
						clearResults();
					}}
				/>
				<IdentityCheck
					{source}
					{corners}
					disabled={locked || selecting || adjusting || !validCorners(corners) || !templateApproval}
					templatePassed={Boolean(templateApproval)}
					student={data.identityStudent}
					signedIn={data.signedIn}
					onbusychange={(value) => {
						identityBusy = value;
					}}
				/>
				<section
					class="card border border-base-300 bg-base-100 shadow-sm"
					aria-labelledby="expected-title"
				>
					<div class="card-body gap-4">
						<div>
							<h2 id="expected-title" class="card-title">2. Expected student details</h2>
							<p class="mt-1 text-sm text-base-content/65">
								Test values only. Compare against term being cleared.
							</p>
						</div>
						<div class="grid grid-cols-2 gap-3">
							{#each fields as field (field.key)}
								<label
									class:col-span-2={field.key === 'name' || field.key === 'studentNumber'}
									class="space-y-1 text-sm"
								>
									<span class="font-medium">{field.label}</span>
									<input
										class="input w-full"
										bind:value={expected[field.key]}
										maxlength="120"
										disabled={locked}
									/>
								</label>
							{/each}
							<label class="space-y-1 text-sm">
								<span class="font-medium">Semester</span>
								<select
									aria-label="Semester"
									class="select w-full"
									bind:value={expected.semester}
									disabled={locked}
								>
									<option value="1">1st Semester</option>
									<option value="2">2nd Semester</option>
								</select>
							</label>
						</div>
						<button
							type="button"
							class="btn w-full btn-primary"
							onclick={analyze}
							disabled={!source ||
								locked ||
								selecting ||
								adjusting ||
								!validCorners(corners) ||
								!templateApproval}
						>
							{#if busy}
								<span class="loading loading-sm loading-spinner" aria-hidden="true"></span>
								Processing…
							{:else}
								Analyze clearance
							{/if}
						</button>
						{#if busy}
							<p role="status" class="text-sm break-words">{progress || 'Preparing image…'}</p>
							{#if controller}
								<button
									type="button"
									class="btn btn-ghost btn-sm"
									onclick={() => controller?.abort()}
								>
									Cancel scan
								</button>
							{/if}
						{/if}
					</div>
				</section>
				<section
					class="card border border-base-300 bg-base-100 shadow-sm"
					aria-labelledby="results-title"
				>
					<div class="card-body gap-4">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h2 id="results-title" class="card-title">3. Full inspection results</h2>
							{#if scan}
								<span class={`badge ${badge[verdict]}`}>{verdictLabel[verdict]}</span>
							{/if}
						</div>
						{#if !scan}
							<p class="text-sm text-base-content/65">
								Load reference or upload a scan, then analyze. Findings appear here.
							</p>
						{:else}
							<p class="text-sm">
								{checks.filter((check) => check.verdict === 'pass').length}/{checks.length} checks passed.
								{verdict === 'pass'
									? 'Prototype evidence only; registrar review still required.'
									: 'Inspect flagged findings and image crops.'}
							</p>
							<ul class="divide-y divide-base-300">
								{#each checks as check (check.label)}
									<li class="py-3">
										<div class="flex items-center justify-between gap-3">
											<span class="text-sm font-semibold">{check.label}</span>
											<span class={`badge badge-sm ${badge[check.verdict]}`}>
												{check.verdict === 'pass'
													? 'Pass'
													: check.verdict === 'review'
														? 'Review'
														: 'Flagged'}
											</span>
										</div>
										<p class="mt-1 text-xs leading-relaxed text-base-content/70">{check.detail}</p>
									</li>
								{/each}
							</ul>
						{/if}
						<div class="rounded-lg bg-base-200 p-3 text-xs leading-relaxed">
							Handwriting may be unreadable with this printed-text OCR engine. Signature checks
							detect added ink only; scribbles can pass. Template matching cannot authenticate
							paper. Faint stamps, shadows and different print layouts need manual review.
						</div>
					</div>
				</section>
			</div>
		</div>
		{#if scan}
			<section
				class="card border border-base-300 bg-base-100 shadow-sm"
				aria-labelledby="evidence-title"
			>
				<div class="card-body">
					<h2 id="evidence-title" class="card-title">OCR evidence</h2>
					<p class="text-sm text-base-content/65">
						Each field has its own OCR confidence score, not a document validity percentage. Printed
						fields use separate crops with contrast cleanup and white padding. Raw readings remain
						unchanged; changing expected values only recalculates comparisons.
					</p>
					<div class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{#each crops as item (item.label)}
							<div class="space-y-2 rounded-lg border border-base-300 p-3">
								<h3 class="text-sm font-semibold capitalize">
									{item.label} · OCR confidence {Math.round(item.confidence)}%
								</h3>
								<img
									src={item.url}
									alt={`${item.label} extraction crop`}
									class="max-h-44 w-full rounded bg-white object-contain"
								/>
								<pre
									class="max-h-44 overflow-auto rounded bg-base-200 p-2 text-xs whitespace-pre-wrap">{item.text ||
										'(No readable text)'}</pre>
							</div>
						{/each}
					</div>
					<details class="mt-4">
						<summary class="cursor-pointer text-sm">Mark detection measurements</summary>
						<div class="overflow-x-auto">
							<table class="table table-sm">
								<thead>
									<tr>
										<th>Department</th>
										<th>Cleared ink</th>
										<th>Not Cleared ink</th>
										<th>Signature ink</th>
									</tr>
								</thead>
								<tbody>
									{#each scan.rows as row (row.department)}
										<tr>
											<td>{row.department}</td>
											<td>{(row.cleared * 100).toFixed(1)}%</td>
											<td>{(row.notCleared * 100).toFixed(1)}%</td>
											<td>{(row.signature * 100).toFixed(1)}%</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</details>
				</div>
			</section>
		{/if}
	</main>
</div>
