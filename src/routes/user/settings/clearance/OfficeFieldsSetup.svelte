<script lang="ts">
	import { onDestroy } from 'svelte';
	import AreaEditor from '#lib/clearance/AreaEditor.svelte';
	import {
		OFFICE_AREA_LABELS,
		officeRowsSchema,
		type OfficeRow,
		type OfficeAreaKind
	} from '#lib/clearance/definition.js';
	import type { Corners } from '#lib/clearance/clearance.js';
	import { getErrorMessage } from '#lib/errors.js';
	import { ScanText, Plus, Trash2 } from '@lucide/svelte';
	let {
		source,
		image,
		corners,
		rows = $bindable(),
		disabled,
		onbusychange
	}: {
		source: HTMLCanvasElement | undefined;
		image: string;
		corners: Corners;
		rows: OfficeRow[];
		disabled: boolean;
		onbusychange: (busy: boolean) => void;
	} = $props();
	let detecting = $state(false),
		progress = $state(''),
		error = $state('');
	let selected = $state(0),
		part = $state<OfficeAreaKind>('office');
	let suggestions = $state<{ previous: OfficeRow[]; hints: string[] }>();
	let controller: AbortController | undefined;
	let destroyed = false;
	const active = $derived(rows[selected]);
	const incompleteRows = $derived(rows.filter((row) => !row.cleared || !row.signature));
	const valid = $derived(officeRowsSchema.safeParse(rows));
	const locked = $derived(disabled || detecting);
	const kinds = Object.keys(OFFICE_AREA_LABELS) as OfficeAreaKind[];
	const colors = { office: '#15803d', cleared: '#2563eb', signature: '#9333ea' };
	const emptyBox = { x: 0, y: 0, width: 0, height: 0 };
	const overlays = $derived(
		kinds.map((id) => ({
			id,
			label: OFFICE_AREA_LABELS[id],
			color: colors[id],
			box: active?.[id] ?? emptyBox
		}))
	);
	$effect(() => onbusychange(detecting));
	onDestroy(() => {
		destroyed = true;
		controller?.abort();
		onbusychange(false);
	});
	async function detect() {
		if (locked || !source) return;
		detecting = true;
		error = '';
		progress = 'Looking for office rows…';
		controller = new AbortController();
		try {
			const p = await import('#lib/clearance/scan.client.js');
			const result = await p.detectOfficeRows(
				source,
				corners,
				(message) => {
					progress = message;
				},
				controller.signal
			);
			if (!destroyed && !controller.signal.aborted) {
				suggestions = {
					previous: suggestions?.previous ?? structuredClone($state.snapshot(rows)),
					hints: result.hints
				};
				rows = result.rows;
				selected = 0;
				part = 'office';
			}
		} catch (cause) {
			error = controller.signal.aborted
				? 'Office detection cancelled. Existing office rows were kept.'
				: getErrorMessage(cause, 'Could not detect office rows. Mark them manually.');
		} finally {
			detecting = false;
			progress = '';
			controller = undefined;
		}
	}
	function discard() {
		if (locked || !suggestions) return;
		rows = suggestions.previous;
		suggestions = undefined;
		selected = 0;
		part = 'office';
	}
	function remove(id: string) {
		if (locked) return;
		const index = rows.findIndex((row) => row.id === id);
		if (index < 0) return;
		const remaining = rows.filter((row) => row.id !== id);
		rows = remaining;
		selected = Math.max(0, Math.min(selected - (index < selected ? 1 : 0), remaining.length - 1));
	}
	function add() {
		if (locked || rows.length >= 30) return;
		let index = rows.length + 1;
		while (rows.some((row) => row.label.toLowerCase() === `office ${index}`)) index++;
		rows = [
			...rows,
			{
				id: crypto.randomUUID(),
				label: `Office ${index}`,
				office: { x: 0, y: 0, width: 0, height: 0 }
			}
		];
		selected = rows.length - 1;
		part = 'office';
	}
	function removeBox() {
		if (locked || !active || part === 'office') return;
		delete active[part];
	}
</script>

<section aria-labelledby="office-fields-title" class="min-w-0 space-y-5" aria-busy={detecting}>
	<div>
		<h3 id="office-fields-title" class="text-base font-semibold">
			Offices, checkboxes and signatures
		</h3>
		<p class="mt-1 text-sm text-base-content/65">
			Select an office, then adjust its name, cleared checkbox and signature / stamp area.
			Auto-detection fills the draft. Use Save all template settings above to keep the detected
			boxes.
		</p>
	</div>
	<div class="space-y-3 rounded-xl border border-base-300 bg-base-200/40 p-4">
		<button
			type="button"
			class="btn btn-outline btn-sm"
			disabled={locked || !source}
			onclick={detect}
		>
			{#if detecting}
				<span class="loading loading-xs loading-spinner" aria-hidden="true"></span>
			{:else}
				<ScanText size={16} aria-hidden="true" />
			{/if}
			{detecting ? 'Detecting office rows…' : 'Auto-detect office rows'}
		</button>
		<p class="text-xs text-base-content/65">
			Find office names, cleared checkboxes and signature spaces. Review the detected rows below.
		</p>
		{#if detecting}
			<p role="status" class="text-sm">{progress}</p>
			<button type="button" class="btn btn-ghost btn-sm" onclick={() => controller?.abort()}>
				Cancel office detection
			</button>
		{/if}
	</div>
	{#if suggestions}
		<div class="space-y-3 rounded-xl border border-base-300 bg-base-100 p-4">
			<p role="status" class="text-sm font-semibold">Found {rows.length} office rows</p>
			<details class="text-xs text-base-content/65">
				<summary class="cursor-pointer">Detection notes</summary>
				<ul class="mt-2 list-inside list-disc space-y-1">
					{#each suggestions.hints as hint (hint)}
						<li>{hint}</li>
					{/each}
				</ul>
			</details>
			<p class="text-xs text-base-content/65">
				Review the boxes below, then save. Discard restores your previous draft.
			</p>
			<div class="flex flex-wrap gap-2">
				<button type="button" class="btn btn-ghost btn-sm" disabled={locked} onclick={discard}>
					Discard office suggestions
				</button>
			</div>
		</div>
	{/if}
	<div class="rounded-xl border border-base-300 p-4">
		<p class="text-xs font-semibold">Add an office manually</p>
		<div class="mt-3 flex flex-wrap gap-2">
			<button
				type="button"
				class="btn btn-outline btn-sm"
				disabled={locked || rows.length >= 30}
				onclick={add}
			>
				<Plus size={14} aria-hidden="true" />Add office
			</button>
		</div>
	</div>
	{#if active}
		<div class="grid min-w-0 items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
			<div class="min-w-0 space-y-4 rounded-xl border border-base-300 bg-base-100 p-4">
				{#if incompleteRows.length}
					<p class="text-xs text-warning" role="status">
						{incompleteRows.length}
						{incompleteRows.length === 1 ? 'office needs' : 'offices need'} missing boxes before student
						uploads are available.
					</p>
				{/if}
				<ul class="max-h-72 space-y-1.5 overflow-y-auto pr-1" aria-label="Office rows">
					{#each rows as row, i (row.id)}
						<li class="flex items-start gap-1 rounded-lg border border-base-300 bg-base-100 p-1">
							<button
								type="button"
								aria-pressed={selected === i}
								class={`min-w-0 flex-1 rounded p-2 text-left text-xs ${selected === i ? 'bg-primary/10 font-semibold' : ''}`}
								disabled={locked}
								onclick={() => {
									selected = i;
								}}
							>
								<span class="block">{row.label}</span>
								{#if !row.cleared || !row.signature}
									<span class="mt-1 block text-warning">
										Missing: {[
											...(!row.cleared ? ['checkbox'] : []),
											...(!row.signature ? ['signature / stamp'] : [])
										].join(', ')}
									</span>
								{/if}
							</button>
							<button
								type="button"
								class="btn btn-square shrink-0 btn-ghost text-error btn-sm"
								aria-label={`Remove office ${row.label}`}
								disabled={locked}
								onclick={() => remove(row.id)}
							>
								<Trash2 size={14} aria-hidden="true" />
							</button>
						</li>
					{/each}
				</ul>
				<label class="block text-sm">
					Office name
					<input
						class="input mt-1 w-full"
						maxlength="100"
						bind:value={active.label}
						disabled={locked}
					/>
				</label>
				{#if part !== 'office' && active[part]}
					<button
						type="button"
						class="btn btn-ghost text-error btn-sm"
						disabled={locked}
						onclick={removeBox}
					>
						<Trash2 size={14} aria-hidden="true" />Remove this box
					</button>
				{/if}
				{#if !active.cleared || !active.signature}
					<p class="text-xs text-base-content/65">
						Draw the missing cleared checkbox or signature / stamp area. Both are required for
						student uploads. Saving a draft keeps your progress.
					</p>
				{/if}
			</div>
			<div
				class="min-w-0 space-y-3 rounded-xl border border-base-300 bg-base-100 p-4"
				aria-label="Office area editor"
			>
				<p class="text-xs font-semibold">{active.label} · {OFFICE_AREA_LABELS[part]}</p>
				<div role="group" aria-label="Office area legend" class="flex flex-wrap gap-2">
					{#each kinds as kind (kind)}
						<button
							type="button"
							aria-pressed={part === kind}
							class={`btn whitespace-normal btn-sm ${part === kind ? 'btn-outline' : 'btn-ghost'}`}
							disabled={locked}
							onclick={() => {
								part = kind;
							}}
						>
							<span
								class="size-3 shrink-0 rounded-sm"
								style:background-color={colors[kind]}
								aria-hidden="true"
							></span>
							{OFFICE_AREA_LABELS[kind]}{active[kind] ? '' : ' — not marked'}
						</button>
					{/each}
				</div>
				{#if !active[part]}
					<p class="text-xs text-base-content/65">
						This area is not marked. Drag on the reference to draw its box.
					</p>
				{/if}
				<AreaEditor
					src={image}
					box={active[part] ?? emptyBox}
					areas={overlays}
					selectedId={part}
					onselect={(id) => {
						part = id as OfficeAreaKind;
					}}
					onchange={(id, value) => {
						if (locked) return;
						const kind = id as OfficeAreaKind;
						if (kind !== 'office' && !value.width && !value.height && !value.x && !value.y)
							delete active[kind];
						else active[kind] = value;
					}}
					disabled={locked}
				/>
			</div>
		</div>
	{:else if !detecting}
		<p
			class="rounded-xl border border-dashed border-base-300 bg-base-200/30 p-6 text-sm text-base-content/65"
		>
			No offices added. Detect rows or add them manually to enable student clearance checks.
		</p>
	{/if}
	{#if !valid.success}
		<p role="alert" class="text-xs text-error">{valid.error.issues[0]?.message}</p>
	{/if}
	{#if error}
		<p role="alert" class="text-sm text-error">{error}</p>
	{/if}
</section>
