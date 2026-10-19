<script lang="ts">
	import { onDestroy } from 'svelte';
	import { resolve } from '$app/paths';
	import { overall, validCorners, type Check, type Corners } from './clearance';
	import type { TemplateDefinition } from './definition';
	import TemplateFindings from './TemplateFindings.svelte';
	let {
		source,
		corners,
		template,
		definition,
		disabled,
		onbusychange,
		showReference = false
	}: {
		source: HTMLCanvasElement | undefined;
		corners: Corners;
		template: { revision: string; filename: string };
		definition: TemplateDefinition;
		disabled: boolean;
		onbusychange: (busy: boolean) => void;
		showReference?: boolean;
	} = $props();
	let running = $state(false),
		progress = $state(''),
		error = $state('');
	let checks = $state<Check[]>();
	let controller: AbortController | undefined;
	let destroyed = false;
	const verdict = $derived(checks ? overall(checks) : undefined);
	const badges = { pass: 'badge-success', review: 'badge-warning', fail: 'badge-error' };
	const labels = {
		pass: 'Matches saved template',
		review: 'Needs review',
		fail: 'Does not match saved template'
	};
	$effect(() => {
		void source;
		JSON.stringify(corners);
		JSON.stringify(definition);
		checks = undefined;
		error = '';
	});
	onDestroy(() => {
		destroyed = true;
		controller?.abort();
		onbusychange(false);
	});
	async function compare() {
		if (!source || !validCorners(corners) || disabled || running) return;
		running = true;
		checks = undefined;
		error = '';
		progress = 'Loading saved reference...';
		onbusychange(true);
		controller = new AbortController();
		try {
			const p = await import('./scan.client');
			const reference = await p.loadImage(
				`${resolve('/user/clearance-template')}?${new URLSearchParams({ revision: template.revision })}`,
				controller.signal
			);
			if (controller.signal.aborted) return;
			const result = await p.compareDefinedTemplate(
				reference,
				source,
				corners,
				definition,
				(message) => {
					progress = message;
				},
				controller.signal
			);
			if (!controller.signal.aborted && !destroyed) checks = result;
		} catch (cause) {
			error = controller.signal.aborted
				? 'Template check cancelled.'
				: cause instanceof Error
					? cause.message
					: 'Could not compare these images. Refresh the reference or try a clearer scan.';
		} finally {
			running = false;
			progress = '';
			controller = undefined;
			if (!destroyed) onbusychange(false);
		}
	}
</script>

<section
	class="portal-panel min-w-0 space-y-4 p-5 sm:p-6"
	aria-labelledby="defined-template-title"
	aria-busy={running}
>
	<div>
		<h2 id="defined-template-title" class="font-bold">Compare with saved template</h2>
		<p class="mt-1 text-sm text-base-content/65">
			Checks the saved marked areas at their corresponding positions after alignment.
		</p>
	</div>
	<p class="text-sm font-semibold break-all">{template.filename}</p>
	<p class="text-sm">
		Required: {definition.semester === '1' ? '1st' : '2nd'} Semester, {definition.schoolYear}
	</p>
	<details class="rounded-lg border border-base-300 p-3">
		<summary class="cursor-pointer text-sm">
			Saved comparison areas ({definition.areas.length})
		</summary>
		<ul class="mt-2 space-y-2 text-xs text-base-content/65">
			{#each definition.areas as area (area.id)}
				<li>
					<strong>{area.label}</strong>
					— {area.kind === 'text'
						? area.expected
						: area.kind === 'image'
							? 'Visual match'
							: 'Required term'}
				</li>
			{/each}
		</ul>
	</details>
	<button
		type="button"
		class="btn w-full btn-primary"
		disabled={disabled || running || !source || !validCorners(corners)}
		onclick={compare}
	>
		{#if running}
			<span class="loading loading-sm loading-spinner" aria-hidden="true"></span>
		{/if}
		{running ? 'Comparing...' : 'Compare template'}
	</button>
	{#if running}
		<p role="status" class="text-sm">{progress}</p>
		<button type="button" class="btn btn-ghost btn-sm" onclick={() => controller?.abort()}>
			Cancel template check
		</button>
	{/if}
	{#if error}
		<p role="alert" class="text-sm text-error">{error}</p>
	{/if}
	{#if verdict && checks}
		<p role="status"><span class={`badge ${badges[verdict]}`}>{labels[verdict]}</span></p>
		<p class="text-sm">
			{verdict === 'pass'
				? 'The marked printed details, visual areas and required term match.'
				: 'Review each finding. Unclear evidence requires review; it is not approved.'}
		</p>
		<TemplateFindings {checks} {showReference} />
	{:else if !running}
		<p class="text-sm text-base-content/65">
			Choose a clearance and confirm its outline, then compare.
		</p>
	{/if}
	<p class="text-xs text-base-content/60">
		Test images stay in your browser. Matching format does not verify student identity, signatures
		or document authenticity.
	</p>
</section>
