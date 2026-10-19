<script lang="ts">
	import type { ClearanceReport } from './report';
	import { overall } from './clearance';
	import TemplateFindings from './TemplateFindings.svelte';
	let { report, showReference = false }: { report: ClearanceReport; showReference?: boolean } =
		$props();
	const badges = { pass: 'badge-success', fail: 'badge-error', review: 'badge-warning' };
</script>

<div class="space-y-3">
	<TemplateFindings checks={report.template} {showReference} />
	<details class="rounded-lg border border-base-300 p-3" open={overall(report.offices) !== 'pass'}>
		<summary class="cursor-pointer text-sm font-semibold">
			Office checkboxes and signatures
			<span class={`ml-2 badge badge-sm ${badges[overall(report.offices)]}`}>
				{report.offices.length ? overall(report.offices) : 'Not checked'}
			</span>
		</summary>
		<ul class="mt-3 divide-y divide-base-300">
			{#each report.offices as check (check.label)}
				<li class="space-y-1 py-2">
					<p class="flex flex-wrap justify-between gap-2 text-xs font-semibold">
						{check.label}
						<span class={`badge badge-sm ${badges[check.verdict]}`}>{check.verdict}</span>
					</p>
					<p class="text-xs text-base-content/65">{check.detail}</p>
				</li>
			{/each}
		</ul>
	</details>
	<p class="rounded-lg bg-base-200 p-3 text-xs text-base-content/65">
		Personal information verification: reserved for a later update. Student name and number are not
		checked in this flow yet.
	</p>
</div>
