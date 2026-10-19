<script lang="ts">
	import {
		clearanceNeedsIdentityReview,
		hasCurrentOfficeChecks,
		type ClearanceReport
	} from './report';
	import { overall } from './clearance';
	import TemplateFindings from './TemplateFindings.svelte';
	let {
		report,
		showReference = false,
		staffVerified = false
	}: { report: ClearanceReport; showReference?: boolean; staffVerified?: boolean } = $props();
	const identityReviewed = $derived(staffVerified && clearanceNeedsIdentityReview(report));
	const badges = { pass: 'badge-success', fail: 'badge-error', review: 'badge-warning' };
	const identityLabels = {
		match: 'Matches student record',
		review: 'Needs review',
		mismatch: 'Does not match student record'
	};
</script>

<div class="space-y-3">
	<TemplateFindings checks={report.template} {showReference} />
	{#if hasCurrentOfficeChecks(report)}
		<details
			class="rounded-lg border border-base-300 p-3"
			open={overall(report.offices) !== 'pass'}
		>
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
	{:else}
		<p role="alert" class="rounded-lg bg-warning/10 p-3 text-sm text-warning">
			Office checks are outdated. Upload the clearance again before requesting or verifying it.
		</p>
	{/if}
	{#if report.identityPresence}
		<div class="space-y-2 rounded-lg border border-base-300 p-3">
			<p class="text-sm font-semibold">Personal information writing</p>
			{#each Object.values(report.identityPresence) as finding (finding.label)}
				<p class="flex flex-wrap justify-between gap-2 text-xs font-semibold">
					{finding.label}
					<span class={`badge badge-sm ${badges[finding.verdict]}`}>{finding.verdict}</span>
				</p>
				<p class="text-xs text-base-content/65">{finding.detail}</p>
			{/each}
		</div>
	{:else if !staffVerified}
		<p class="rounded-lg bg-warning/10 p-3 text-xs">
			Writing presence has not been checked. Upload again before requesting or verifying clearance.
		</p>
	{/if}
	{#if typeof report.identity === 'object' && report.identity}
		{@const identity = report.identity}
		<details class="rounded-lg border border-base-300 p-3" open={identity.verdict !== 'match'}>
			<summary class="cursor-pointer text-sm font-semibold">
				Student name and number
				<span
					class={`ml-2 badge badge-sm ${identityReviewed || identity.verdict === 'match' ? badges.pass : identity.verdict === 'mismatch' ? badges.fail : badges.review}`}
				>
					{identityReviewed ? 'Verified by staff' : identityLabels[identity.verdict]}
				</span>
			</summary>
			<p class="mt-3 text-sm">{identity.detail}</p>
			{#if identityReviewed}
				<p class="mt-2 text-sm text-success">
					Automated identity reading needed review. Registrar/admin verified identity using the
					original clearance.
				</p>
			{/if}
			<ul class="mt-3 divide-y divide-base-300">
				{#each ['studentNumber', 'name'] as field (field)}
					{@const key = field as 'studentNumber' | 'name'}
					{@const finding = identity[key]}
					<li class="space-y-1 py-2 text-xs">
						<p class="font-semibold">
							{key === 'name' ? 'Student name' : 'Student number'} · {finding.status}
						</p>
						<p class="break-words">Read: {finding.detected || '(No readable text)'}</p>
						<p class="break-words">Student record: {finding.expected}</p>
						<p class="text-base-content/65">{finding.detail}</p>
						{#if identity.warnings?.[key]}
							<p class="text-warning">{identity.warnings[key]}</p>
						{/if}
					</li>
				{/each}
			</ul>
		</details>
	{:else}
		<p class="rounded-lg bg-base-200 p-3 text-xs text-base-content/65">
			Student name and number have not been read. Template, office and writing-presence checks must
			pass first. Older uploads need rechecking before requesting enrollment.
		</p>
	{/if}
</div>
