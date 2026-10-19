<script lang="ts">
	import { overall, type Check } from './clearance';
	let { checks, showReference = false }: { checks: Check[]; showReference?: boolean } = $props();
	const reference = $derived(checks.filter((check) => check.label.startsWith('Reference: ')));
	const uploaded = $derived(checks.filter((check) => !check.label.startsWith('Reference: ')));
	const groups = $derived([
		{ title: 'Uploaded clearance checks', checks: uploaded },
		...(showReference && reference.length
			? [{ title: 'Saved template reference checks', checks: reference }]
			: [])
	]);
	const badges = { pass: 'badge-success', fail: 'badge-error', review: 'badge-warning' };
</script>

<section class="space-y-3 rounded-lg border border-base-300 p-3" aria-label="Template validation">
	<p class="text-sm font-semibold">
		Template validation
		<span class={`ml-2 badge badge-sm ${badges[overall(checks)]}`}>
			{checks.length ? overall(checks) : 'Not checked'}
		</span>
	</p>
	{#if !showReference && reference.some((check) => check.verdict !== 'pass')}
		<p role="alert" class="text-sm text-warning">
			Template setup needs attention. Contact the Registrar before retrying.
		</p>
	{/if}
	{#each groups as group (group.title)}
		<details open={overall(group.checks) !== 'pass'}>
			<summary class="cursor-pointer text-sm font-semibold">
				{group.title}
				<span class={`ml-2 badge badge-sm ${badges[overall(group.checks)]}`}>
					{group.checks.length ? overall(group.checks) : 'Not checked'}
				</span>
			</summary>
			<ul class="mt-3 divide-y divide-base-300">
				{#each group.checks as check (check.label)}
					<li class="space-y-1 py-2">
						<p class="flex flex-wrap justify-between gap-2 text-xs font-semibold">
							{check.label.replace(/^(Reference|Upload): /, '')}
							<span class={`badge badge-sm ${badges[check.verdict]}`}>{check.verdict}</span>
						</p>
						<p class="text-xs text-base-content/65">{check.detail}</p>
					</li>
				{/each}
			</ul>
		</details>
	{/each}
</section>
