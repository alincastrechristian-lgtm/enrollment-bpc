<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { saveClearanceAreas } from '#lib/actions/clearance.remote.js';
	import BorderEditor from '#lib/clearance/BorderEditor.svelte';
	import AreaEditor from '#lib/clearance/AreaEditor.svelte';
	import PersonalFieldsSetup from './PersonalFieldsSetup.svelte';
	import OfficeFieldsSetup from './OfficeFieldsSetup.svelte';
	import { UNIT_CORNERS, validCorners, type Corners } from '#lib/clearance/clearance.js';
	import {
		definitionSchema,
		type TemplateArea,
		type PersonalFieldArea,
		type OfficeRow,
		type TemplateInfo
	} from '#lib/clearance/definition.js';
	import { getErrorMessage } from '#lib/errors.js';
	import type { AreaSuggestions } from '#lib/clearance/suggestions.js';
	import { showSuccess } from '#lib/components/Popup/Popup.svelte.js';
	import { MapPin, Save, Plus, Trash2, ScanText } from '@lucide/svelte';
	let {
		template,
		disabled,
		onbusychange,
		ondirtychange,
		step = $bindable('printed')
	}: {
		template: TemplateInfo;
		disabled: boolean;
		onbusychange: (busy: boolean) => void;
		ondirtychange?: (dirty: boolean) => void;
		step?: 'outline' | 'printed' | 'offices' | 'personal';
	} = $props();
	const steps = [
		{ id: 'outline', title: 'Form outline', hint: 'Align the reference' },
		{ id: 'printed', title: 'Printed areas & term', hint: 'School, logo and semester' },
		{ id: 'offices', title: 'Offices & signatures', hint: 'Checkboxes and signing areas' },
		{ id: 'personal', title: 'Personal inputs', hint: 'Optional · for later use' }
	] as const;
	let corners = $state<Corners>(
		untrack(() => structuredClone(template.definition?.corners ?? UNIT_CORNERS))
	);
	let areas = $state<TemplateArea[]>(
		untrack(() => structuredClone(template.definition?.areas ?? []))
	);
	let personalFields = $state<PersonalFieldArea[]>(
		untrack(() => structuredClone(template.definition?.personalFields ?? []))
	);
	let personalBusy = $state(false);
	let officeRows = $state<OfficeRow[]>(
		untrack(() => structuredClone(template.definition?.officeRows ?? []))
	);
	let officeBusy = $state(false);
	let semester = $state(
		untrack(() => template.definition?.semester ?? (template.semester === 1 ? '1' : '2'))
	);
	let schoolYear = $state(
		untrack(
			() =>
				template.definition?.schoolYear ??
				(template.schoolYearStart
					? `${template.schoolYearStart}-${template.schoolYearStart + 1}`
					: '')
		)
	);
	let selected = $state(0);
	let source = $state<HTMLCanvasElement>();
	let sourceUrl = $state('');
	let aligned = $state('');
	let drawing = $state(false),
		dragging = $state(false),
		busy = $state(false),
		saving = $state(false);
	let error = $state('');
	let detecting = $state(false);
	let progress = $state('');
	let suggestions = $state<AreaSuggestions>();
	let selectedSuggestionId = $state('');
	let detectController: AbortController | undefined;
	let destroyed = false;
	const active = $derived(areas[selected]);
	const previewSuggestion = $derived(
		suggestions?.areas.find((area) => area.id === selectedSuggestionId) ?? suggestions?.areas[0]
	);
	const draft = $derived({ corners, areas, semester, schoolYear, personalFields, officeRows });
	let originalDraft = $state(
		untrack(() =>
			JSON.stringify({ corners, areas, semester, schoolYear, personalFields, officeRows })
		)
	);
	$effect(() => ondirtychange?.(JSON.stringify(draft) !== originalDraft));
	const valid = $derived(definitionSchema.safeParse(draft));
	const locked = $derived(disabled || busy || saving || detecting || personalBusy || officeBusy);
	$effect(() => onbusychange(busy || saving || detecting || personalBusy || officeBusy));
	onDestroy(() => {
		destroyed = true;
		detectController?.abort();
		onbusychange(false);
		ondirtychange?.(false);
	});
	onMount(() => {
		void load();
	});
	async function load() {
		busy = true;
		try {
			const p = await import('#lib/clearance/scan.client.js');
			const image = await p.loadImage(
				`${resolve('/user/clearance-template')}?${new URLSearchParams({ revision: template.revision })}`
			);
			if (destroyed) return;
			source = image;
			sourceUrl = image.toDataURL('image/jpeg', 0.95);
			if (!template.definition) {
				step = 'outline';
				const found = p.detectBorder(image);
				corners = structuredClone(found ?? UNIT_CORNERS);
				drawing = !found;
				originalDraft = JSON.stringify({
					corners,
					areas,
					semester,
					schoolYear,
					personalFields,
					officeRows
				});
			} else aligned = p.alignTemplate(image, corners).toDataURL('image/png');
		} catch (cause) {
			error = getErrorMessage(cause, 'Could not load saved template. Reload to try again.');
		} finally {
			busy = false;
		}
	}
	async function align() {
		if (!source || locked || drawing || dragging || !validCorners(corners)) return;
		const p = await import('#lib/clearance/scan.client.js');
		aligned = p.alignTemplate(source, corners).toDataURL('image/png');
		step = 'printed';
		suggestions = undefined;
		error = '';
	}
	async function detect() {
		if (!source || !aligned || locked) return;
		detecting = true;
		error = '';
		suggestions = undefined;
		progress = 'Preparing area detection...';
		detectController = new AbortController();
		try {
			const p = await import('#lib/clearance/scan.client.js');
			const result = await p.detectTemplateAreas(
				source,
				corners,
				(text) => {
					progress = text;
				},
				detectController.signal
			);
			if (!destroyed && !detectController.signal.aborted) suggestions = result;
		} catch (cause) {
			error = detectController.signal.aborted
				? 'Area detection cancelled. Your areas were kept.'
				: getErrorMessage(cause, 'Could not detect areas. Try again or mark them manually.');
		} finally {
			detecting = false;
			progress = '';
			detectController = undefined;
		}
	}
	function applySuggestions() {
		if (!suggestions || locked || !suggestions.areas.length) return;
		areas = structuredClone($state.snapshot(suggestions.areas));
		if (suggestions.semester && template.semester == null) semester = suggestions.semester;
		if (suggestions.schoolYear && template.schoolYearStart == null)
			schoolYear = suggestions.schoolYear;
		selected = 0;
		suggestions = undefined;
	}
	function removeSuggestion(id: string) {
		if (!suggestions || locked) return;
		const index = suggestions.areas.findIndex((area) => area.id === id);
		if (index < 0) return;
		const remaining = suggestions.areas.filter((area) => area.id !== id);
		if (previewSuggestion?.id === id)
			selectedSuggestionId = remaining[Math.min(index, remaining.length - 1)]?.id ?? '';
		suggestions = {
			...suggestions,
			areas: remaining,
			semester: remaining.some((area) => area.kind === 'semester')
				? suggestions.semester
				: undefined,
			schoolYear: remaining.some((area) => area.kind === 'academicYear')
				? suggestions.schoolYear
				: undefined
		};
	}
	function removeArea(id: string) {
		if (locked) return;
		const index = areas.findIndex((area) => area.id === id);
		if (index < 0) return;
		areas = areas.filter((area) => area.id !== id);
		selected = Math.max(0, Math.min(selected - (index < selected ? 1 : 0), areas.length - 1));
	}
	function add(kind: TemplateArea['kind']) {
		if (locked || areas.length >= 20) return;
		const labels = {
			text: 'Printed text',
			image: 'Logo or structure',
			semester: 'Semester',
			academicYear: 'Academic year'
		};
		areas = [
			...areas,
			{
				id: crypto.randomUUID(),
				label:
					kind === 'text'
						? `${labels[kind]} ${areas.filter((a) => a.kind === 'text').length + 1}`
						: labels[kind],
				kind,
				expected: '',
				box: { x: 0, y: 0, width: 0, height: 0 }
			}
		];
		selected = areas.length - 1;
	}
	async function save() {
		if (locked || !aligned) return;
		const parsed = definitionSchema.safeParse($state.snapshot(draft));
		if (!parsed.success) {
			error = parsed.error.issues[0]?.message ?? 'Check the marked areas.';
			return;
		}
		saving = true;
		error = '';
		try {
			await saveClearanceAreas({ revision: template.revision, definition: parsed.data });
			showSuccess('Template areas, personal inputs and office boxes saved.');
		} catch (cause) {
			error = getErrorMessage(cause, 'Could not save template areas.');
		} finally {
			saving = false;
		}
	}
</script>

<section
	class="portal-panel min-w-0 space-y-5 p-4 sm:p-6"
	aria-labelledby="template-setup-title"
	aria-busy={busy || saving || detecting || personalBusy || officeBusy}
>
	<div class="flex items-center gap-3">
		<MapPin class="text-primary" size={22} aria-hidden="true" />
		<div>
			<h2 id="template-setup-title" class="font-bold">Template setup</h2>
			<p class="mt-1 text-sm text-base-content/65">
				Work through each step, then save your template settings.
			</p>
		</div>
	</div>
	<nav aria-label="Template setup steps" class="grid grid-cols-2 gap-2 lg:grid-cols-4">
		{#each steps as item, i (item.id)}
			<button
				type="button"
				aria-label={item.title}
				aria-pressed={step === item.id}
				aria-current={step === item.id ? 'step' : undefined}
				disabled={locked || (item.id !== 'outline' && !aligned)}
				onclick={() => {
					step = item.id;
				}}
				class={`flex min-w-0 items-start gap-2.5 rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-45 ${step === item.id ? 'border-primary bg-primary/5' : 'border-base-300 hover:bg-base-200/60'}`}
			>
				<span
					class={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${step === item.id ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content/60'}`}
				>
					{i + 1}
				</span>
				<span class="min-w-0">
					<span class="block text-xs font-bold sm:text-sm">{item.title}</span>
					<span class="mt-0.5 hidden text-xs text-base-content/55 sm:block">{item.hint}</span>
				</span>
			</button>
		{/each}
	</nav>
	{#if busy}
		<p role="status" class="text-sm">Loading reference...</p>
	{/if}
	{#if sourceUrl}
		<div hidden={step !== 'outline'} class="space-y-3">
			<h3 class="text-sm font-bold">Confirm reference outline</h3>
			<div class="mt-4 max-w-3xl space-y-3">
				<BorderEditor
					src={sourceUrl}
					bind:corners
					bind:drawing
					bind:dragging
					disabled={locked}
					onchange={() => {
						aligned = '';
						suggestions = undefined;
					}}
				/>
				<button
					type="button"
					class="btn btn-primary btn-sm"
					onclick={align}
					disabled={locked || drawing || dragging || !validCorners(corners)}
				>
					Use this outline
				</button>
			</div>
		</div>
	{/if}
	{#if aligned}
		<div hidden={step !== 'printed'} class="space-y-4">
			<h3 class="text-sm font-bold">Printed areas &amp; required term</h3>
			<p class="text-xs text-base-content/65">
				Add school name and form title as text, a logo or table structure as an image, and the
				semester and academic year. Include whole lines with a little margin. Exclude handwriting,
				signatures and checkbox interiors.
			</p>
			<div class="space-y-3 rounded-xl border border-base-300 bg-base-200/40 p-4">
				<button type="button" class="btn btn-outline btn-sm" onclick={detect} disabled={locked}>
					{#if detecting}
						<span class="loading loading-xs loading-spinner" aria-hidden="true"></span>
					{:else}
						<ScanText size={16} aria-hidden="true" />
					{/if}
					{detecting ? 'Detecting areas...' : 'Auto-detect areas'}
				</button>
				<p class="text-xs text-base-content/65">
					Suggest printed text, term details and graphic areas from this blank reference. Existing
					areas stay unchanged until you choose to use the suggestions.
				</p>
				{#if detecting}
					<p role="status" class="text-sm">{progress}</p>
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						onclick={() => detectController?.abort()}
					>
						Cancel area detection
					</button>
				{/if}
				{#if suggestions}
					<div aria-label="Area suggestions" class="space-y-3">
						<p role="status" class="text-sm font-semibold">
							Found {suggestions.areas.length} suggested areas
						</p>
						<details class="text-xs text-base-content/65">
							<summary class="cursor-pointer">Detection notes</summary>
							<ul class="mt-2 list-inside list-disc space-y-1">
								{#each suggestions.hints as hint (hint)}
									<li>{hint}</li>
								{/each}
							</ul>
						</details>
						{#if suggestions.areas.length}
							<p class="text-xs text-base-content/65">
								Select a suggestion to view its box. Delete unwanted suggestions using the trash
								button beside them.
							</p>
							<div class="grid min-w-0 items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
								<ul aria-label="Suggested areas" class="max-h-96 space-y-2 overflow-auto text-xs">
									{#each suggestions.areas as area (area.id)}
										<li
											class="flex items-start gap-1 rounded-lg border border-base-300 bg-base-100 p-1"
										>
											<button
												type="button"
												aria-label={`Preview ${area.label}`}
												aria-pressed={previewSuggestion?.id === area.id}
												class={`min-w-0 flex-1 rounded-md p-2 text-left hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-primary ${previewSuggestion?.id === area.id ? 'bg-primary/10' : ''}`}
												disabled={locked}
												onclick={() => {
													selectedSuggestionId = area.id;
												}}
											>
												<strong class="block">{area.label}</strong>
												<span class="mt-1 block break-words text-base-content/65">
													{area.kind === 'image' ? 'Visual candidate' : area.expected}
												</span>
											</button>
											<button
												type="button"
												aria-label={`Delete suggested ${area.label}`}
												title={`Delete ${area.label}`}
												class="btn btn-square shrink-0 btn-ghost text-error btn-sm"
												disabled={locked}
												onclick={() => removeSuggestion(area.id)}
											>
												<Trash2 size={16} aria-hidden="true" />
											</button>
										</li>
									{/each}
								</ul>
								{#if previewSuggestion}
									<section
										aria-label="Suggested area preview"
										class="min-w-0 space-y-2 rounded-lg border border-base-300 bg-base-100 p-3"
									>
										<h4 class="text-sm font-semibold">{previewSuggestion.label}</h4>
										<div
											role="img"
											aria-label={`${previewSuggestion.label} highlighted on the reference`}
											class="relative w-fit max-w-full overflow-hidden rounded-md border border-base-300 bg-white"
										>
											<img
												src={aligned}
												alt=""
												class="block h-auto max-h-[65vh] w-auto max-w-full"
											/>
											<svg
												class="pointer-events-none absolute inset-0 h-full w-full"
												viewBox="0 0 100 100"
												preserveAspectRatio="none"
												aria-hidden="true"
											>
												<rect
													x={previewSuggestion.box.x * 100}
													y={previewSuggestion.box.y * 100}
													width={previewSuggestion.box.width * 100}
													height={previewSuggestion.box.height * 100}
													fill="#16a34a30"
													stroke="#15803d"
													stroke-width=".5"
												/>
											</svg>
										</div>
										<p class="text-xs break-words text-base-content/65">
											{previewSuggestion.kind === 'image'
												? 'Check that this contains a permanent logo or printed structure.'
												: previewSuggestion.expected}
										</p>
									</section>
								{/if}
							</div>
							<p class="text-xs text-base-content/65">
								Using suggestions replaces the draft areas and fills readable term values. Review
								and edit them, then save to apply changes.
							</p>
						{:else}
							<p class="text-sm text-base-content/65">
								No suggestions remain. Run detection again or mark areas manually.
							</p>
						{/if}
						<div class="flex flex-wrap gap-2">
							<button
								type="button"
								class="btn btn-outline btn-sm"
								disabled={locked || !suggestions.areas.length}
								onclick={applySuggestions}
							>
								Use suggestions — replace draft areas
							</button>
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								disabled={locked}
								onclick={() => {
									suggestions = undefined;
								}}
							>
								Discard suggestions
							</button>
						</div>
					</div>
				{/if}
			</div>
			{#if !suggestions}
				<details class="rounded-lg border border-base-300 p-3">
					<summary class="cursor-pointer text-xs font-semibold">Add an area manually</summary>
					<div class="mt-3 flex flex-wrap gap-2">
						<button
							type="button"
							class="btn btn-outline btn-sm"
							onclick={() => add('text')}
							disabled={locked || areas.length >= 20}
						>
							<Plus size={14} />Text area
						</button>
						<button
							type="button"
							class="btn btn-outline btn-sm"
							onclick={() => add('image')}
							disabled={locked || areas.length >= 20}
						>
							Logo / structure
						</button>
						<button
							type="button"
							class="btn btn-outline btn-sm"
							onclick={() => add('semester')}
							disabled={locked || areas.some((a) => a.kind === 'semester')}
						>
							Semester area
						</button>
						<button
							type="button"
							class="btn btn-outline btn-sm"
							onclick={() => add('academicYear')}
							disabled={locked || areas.some((a) => a.kind === 'academicYear')}
						>
							Year area
						</button>
					</div>
				</details>
				{#if areas.length}
					<div class="grid min-w-0 items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
						<div class="min-w-0 space-y-3">
							<ul class="max-h-72 space-y-1.5 overflow-y-auto pr-1" aria-label="Marked areas">
								{#each areas as area, i (area.id)}
									<li
										class="flex items-start gap-1 rounded-lg border border-base-300 bg-base-100 p-1"
									>
										<button
											type="button"
											aria-pressed={selected === i}
											class={`min-w-0 flex-1 rounded p-2 text-left text-xs ${selected === i ? 'bg-primary/10 font-semibold' : ''}`}
											disabled={locked}
											onclick={() => {
												selected = i;
											}}
										>
											{area.label}
										</button>
										<button
											type="button"
											class="btn btn-square shrink-0 btn-ghost text-error btn-sm"
											aria-label={`Remove permanent ${area.label}`}
											disabled={locked}
											onclick={() => removeArea(area.id)}
										>
											<Trash2 size={14} aria-hidden="true" />
										</button>
									</li>
								{/each}
							</ul>
							{#if active}
								<label class="block text-sm">
									Area label
									<input
										class="input mt-1 w-full"
										maxlength="60"
										bind:value={active.label}
										disabled={locked}
									/>
								</label>
								{#if active.kind === 'text'}
									<label class="block text-sm">
										Expected printed text
										<textarea
											class="textarea mt-1 w-full"
											rows="3"
											maxlength="1000"
											placeholder="Type the exact text shown in this area"
											bind:value={active.expected}
											disabled={locked}></textarea>
									</label>
								{/if}
								<label class="block text-sm">
									Area type
									<select
										aria-label="Area type"
										class="select mt-1 w-full"
										bind:value={active.kind}
										disabled={locked}
									>
										<option value="text">Printed text</option>
										<option value="image">Logo or structure</option>
										<option value="semester">Semester</option>
										<option value="academicYear">Academic year</option>
									</select>
								</label>
								{#if active.kind !== 'text' && active.kind !== 'image' && active.expected}
									<p class="text-xs text-base-content/60">Suggested reading: {active.expected}</p>
								{/if}
							{/if}
						</div>
						{#if active}
							<AreaEditor src={aligned} bind:box={active.box} disabled={locked} />
						{/if}
					</div>
				{/if}
			{/if}
			<fieldset disabled={locked} class="grid gap-3 sm:grid-cols-2">
				<legend class="mb-2 text-sm font-bold">Required term</legend>
				<label class="text-sm">
					Semester
					<select
						class="select mt-1 w-full"
						bind:value={semester}
						disabled={template.semester != null}
					>
						<option value="1">1st Semester</option>
						<option value="2">2nd Semester</option>
					</select>
				</label>
				<label class="text-sm">
					Academic year
					<input
						class="input mt-1 w-full"
						bind:value={schoolYear}
						placeholder="2025-2026"
						maxlength="9"
						readonly={template.schoolYearStart != null}
					/>
				</label>
			</fieldset>
			{#if template.semester != null}
				<p class="text-xs text-base-content/60">
					Term is fixed for this version. Reuse the template to create a draft for another term.
				</p>
			{/if}
		</div>
		<div hidden={step !== 'personal'}>
			<PersonalFieldsSetup
				{source}
				image={aligned}
				{corners}
				bind:fields={personalFields}
				disabled={disabled || busy || saving || detecting || officeBusy}
				onbusychange={(value) => {
					personalBusy = value;
				}}
			/>
		</div>
		<div hidden={step !== 'offices'}>
			<OfficeFieldsSetup
				{source}
				image={aligned}
				{corners}
				bind:rows={officeRows}
				disabled={disabled || busy || saving || detecting || personalBusy}
				onbusychange={(value) => {
					officeBusy = value;
				}}
			/>
		</div>
		<div class="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-4">
			<div class="min-w-0 text-xs text-base-content/60">
				<p>Save applies all steps. Tests use your saved settings.</p>
				{#if suggestions}
					<p class="mt-1 text-warning">
						Apply or discard the printed-area suggestions before saving.
					</p>
				{/if}
				{#if !valid.success}
					<p class="mt-1 text-warning">{valid.error.issues[0]?.message}</p>
				{/if}
			</div>
			<button
				type="button"
				class="btn btn-primary btn-sm"
				onclick={save}
				disabled={locked || !valid.success || !!suggestions}
			>
				<Save size={16} />{saving ? 'Saving...' : 'Save template areas'}
			</button>
		</div>
	{/if}
	{#if error}
		<p role="alert" class="text-sm text-error">{error}</p>
	{/if}
</section>
