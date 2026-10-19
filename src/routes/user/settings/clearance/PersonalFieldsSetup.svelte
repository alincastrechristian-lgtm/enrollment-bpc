<script lang="ts">
	import { onDestroy } from 'svelte';
	import AreaEditor from '#lib/clearance/AreaEditor.svelte';
	import {
		PERSONAL_FIELD_LABELS,
		personalFieldsSchema,
		type PersonalFieldArea,
		type PersonalFieldKind
	} from '#lib/clearance/definition.js';
	import type { Corners } from '#lib/clearance/clearance.js';
	import type { PersonalFieldSuggestions } from '#lib/clearance/personal-suggestions.js';
	import { getErrorMessage } from '#lib/errors.js';
	import { ScanText, Plus, Trash2 } from '@lucide/svelte';
	let {
		source,
		image,
		corners,
		fields = $bindable(),
		disabled,
		onbusychange
	}: {
		source: HTMLCanvasElement | undefined;
		image: string;
		corners: Corners;
		fields: PersonalFieldArea[];
		disabled: boolean;
		onbusychange: (busy: boolean) => void;
	} = $props();
	let detecting = $state(false),
		progress = $state(''),
		error = $state(''),
		selected = $state(0);
	let pending = $state<PersonalFieldSuggestions>();
	let controller: AbortController | undefined;
	let destroyed = false;
	const displayed = $derived(pending?.fields ?? fields);
	const active = $derived(displayed[selected] ?? displayed[0]);
	const valid = $derived(personalFieldsSchema.safeParse(displayed));
	const locked = $derived(disabled || detecting);
	const kinds = Object.keys(PERSONAL_FIELD_LABELS) as PersonalFieldKind[];
	$effect(() => onbusychange(detecting));
	onDestroy(() => {
		destroyed = true;
		controller?.abort();
		onbusychange(false);
	});
	function unavailable(kind: PersonalFieldKind) {
		return displayed.some(
			(a) =>
				a.field === kind ||
				(kind === 'courseYearSection' && ['course', 'year', 'section'].includes(a.field)) ||
				(['course', 'year', 'section'].includes(kind) && a.field === 'courseYearSection')
		);
	}
	async function detect() {
		if (locked || !source) return;
		detecting = true;
		pending = undefined;
		error = '';
		progress = 'Looking for personal-information labels...';
		controller = new AbortController();
		try {
			const p = await import('#lib/clearance/scan.client.js');
			const result = await p.detectPersonalFields(
				source,
				corners,
				(message) => {
					progress = message;
				},
				controller.signal
			);
			if (!destroyed && !controller.signal.aborted) {
				pending = result;
				selected = 0;
			}
		} catch (cause) {
			error = controller.signal.aborted
				? 'Personal-area detection cancelled. Existing boxes were kept.'
				: getErrorMessage(cause, 'Could not detect personal areas. Mark them manually.');
		} finally {
			detecting = false;
			progress = '';
			controller = undefined;
		}
	}
	function apply() {
		if (locked || !pending || !pending.fields.length || !valid.success) return;
		fields = structuredClone($state.snapshot(pending.fields));
		pending = undefined;
		selected = 0;
	}
	function remove(id: string) {
		if (locked) return;
		const remaining = displayed.filter((a) => a.id !== id);
		if (pending) pending = { ...pending, fields: remaining };
		else fields = remaining;
		selected = Math.max(0, Math.min(selected, remaining.length - 1));
	}
	function add(kind: PersonalFieldKind) {
		if (locked || pending || unavailable(kind) || fields.length >= 5) return;
		fields = [
			...fields,
			{ id: crypto.randomUUID(), field: kind, box: { x: 0, y: 0, width: 0, height: 0 } }
		];
		selected = fields.length - 1;
	}
</script>

<section aria-labelledby="personal-fields-title" class="min-w-0 space-y-5" aria-busy={detecting}>
	<div>
		<h3 id="personal-fields-title" class="text-base font-semibold">
			Personal information input areas
		</h3>
		<p class="mt-1 text-sm text-base-content/65">
			Mark student name and student number for identity verification. Course, year and section are
			optional and are not checked. Include the printed student-number prefix when present.
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
			{detecting ? 'Detecting personal areas...' : 'Auto-detect personal inputs'}
		</button>
		<p class="text-xs text-base-content/65">
			Find writing areas from the printed student labels. Review suggested boxes before using them.
		</p>
		{#if detecting}
			<p role="status" class="text-sm">{progress}</p>
			<button type="button" class="btn btn-ghost btn-sm" onclick={() => controller?.abort()}>
				Cancel personal detection
			</button>
		{/if}
	</div>
	{#if pending}
		<div class="space-y-3 rounded-xl border border-base-300 bg-base-100 p-4">
			<p role="status" class="text-sm font-semibold">
				Found {pending.fields.length} personal input areas
			</p>
			<details class="text-xs text-base-content/65">
				<summary class="cursor-pointer">Detection notes</summary>
				<ul class="mt-2 list-inside list-disc space-y-1">
					{#each pending.hints as hint (hint)}
						<li>{hint}</li>
					{/each}
				</ul>
			</details>
			<p class="text-xs text-base-content/65">
				Review or adjust the suggested boxes below. Use suggestions to replace only the
				personal-area draft; the saved setup stays unchanged until you save.
			</p>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					class="btn btn-primary btn-sm"
					disabled={locked || !pending.fields.length || !valid.success}
					onclick={apply}
				>
					Use personal input suggestions
				</button>
				<button
					type="button"
					class="btn btn-ghost btn-sm"
					disabled={locked}
					onclick={() => {
						pending = undefined;
						selected = 0;
					}}
				>
					Discard personal suggestions
				</button>
			</div>
		</div>
	{/if}
	<div class="rounded-xl border border-base-300 p-4">
		<p class="text-xs font-semibold">Add fields manually</p>
		<div class="mt-3 flex flex-wrap gap-2" aria-label="Add personal input area">
			{#each kinds as kind (kind)}
				<button
					type="button"
					class="btn btn-outline whitespace-normal btn-sm"
					disabled={locked || !!pending || unavailable(kind) || fields.length >= 5}
					onclick={() => add(kind)}
				>
					<Plus size={13} aria-hidden="true" />{PERSONAL_FIELD_LABELS[kind]}
				</button>
			{/each}
		</div>
	</div>
	{#if displayed.length && active}
		<div class="grid min-w-0 items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
			<div class="min-w-0 space-y-4 rounded-xl border border-base-300 bg-base-100 p-4">
				<ul class="max-h-72 space-y-1.5 overflow-y-auto pr-1" aria-label="Personal input areas">
					{#each displayed as area, i (area.id)}
						<li class="flex items-start gap-1 rounded-lg border border-base-300 bg-base-100 p-1">
							<button
								type="button"
								aria-pressed={active.id === area.id}
								class={`min-w-0 flex-1 rounded p-2 text-left text-xs ${active.id === area.id ? 'bg-primary/10 font-semibold' : ''}`}
								disabled={locked}
								onclick={() => {
									selected = i;
								}}
							>
								{PERSONAL_FIELD_LABELS[area.field]}
							</button>
							<button
								type="button"
								class="btn btn-square shrink-0 btn-ghost text-error btn-sm"
								aria-label={`Remove personal ${PERSONAL_FIELD_LABELS[area.field]}`}
								disabled={locked}
								onclick={() => remove(area.id)}
							>
								<Trash2 size={14} aria-hidden="true" />
							</button>
						</li>
					{/each}
				</ul>
				<label class="block text-sm">
					Personal field
					<select
						aria-label="Personal field"
						class="select mt-1 w-full"
						bind:value={active.field}
						disabled={locked}
					>
						{#each kinds as kind (kind)}
							<option value={kind}>{PERSONAL_FIELD_LABELS[kind]}</option>
						{/each}
					</select>
				</label>
				<p class="text-xs text-base-content/65">
					A combined course/year/section box is used when the form has one shared line. Use separate
					boxes only when the inputs are separate.
				</p>
			</div>
			<div class="min-w-0 space-y-3 rounded-xl border border-base-300 bg-base-100 p-4">
				<p class="text-xs font-semibold">{PERSONAL_FIELD_LABELS[active.field]}</p>
				<AreaEditor src={image} bind:box={active.box} disabled={locked} />
			</div>
		</div>
	{:else if !detecting}
		<p
			class="rounded-xl border border-dashed border-base-300 bg-base-200/30 p-6 text-sm text-base-content/65"
		>
			No personal areas selected. Detect them or add fields manually. Student uploads require both
			student name and student number areas.
		</p>
	{/if}
	{#if !valid.success}
		<p role="alert" class="text-xs text-error">{valid.error.issues[0]?.message}</p>
	{/if}
	{#if error}
		<p role="alert" class="text-sm text-error">{error}</p>
	{/if}
</section>
