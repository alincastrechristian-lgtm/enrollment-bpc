<script lang="ts">
	const stats = [
		{ label: 'TOTAL STUDENTS', value: 428, color: 'bg-secondary' },
		{ label: 'APPLICANTS', value: 36, color: 'bg-primary' },
		{ label: 'PENDING REQUIREMENTS', value: 18, color: 'bg-warning' },
		{ label: 'ENROLLED', value: 372, color: 'bg-primary' }
	];

	const recent = [
		{ id: '2026-000428', program: 'BSIS' },
		{ id: '2026-000427', program: 'ACT' },
		{ id: '2026-000426', program: 'DHRMT' }
	];
</script>

<section class="space-y-6">
	<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
		{#each stats as item (item.label)}
			<article class="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm">
				<div class="mb-4 h-1.5 w-14 rounded-full {item.color}"></div>
				<p class="text-xs font-semibold tracking-wide text-base-content/60">{item.label}</p>
				<p class="mt-1 text-4xl font-black tracking-tight text-base-content">{item.value}</p>
			</article>
		{/each}
	</div>

	<div class="grid gap-6 xl:grid-cols-[1fr_340px]">
		<article class="rounded-3xl border border-base-300 bg-base-100 p-6 shadow-sm lg:p-8">
			<h2 class="text-3xl font-extrabold tracking-tight text-base-content">ENROLLMENT STATUS</h2>
			<div class="mt-8 flex flex-wrap items-center justify-center gap-10 lg:justify-start">
				<div
					class="grid h-48 w-48 place-content-center rounded-full border-[2.25rem] border-primary bg-base-100"
				>
					<p class="text-4xl font-black text-base-content">372</p>
				</div>
				<div class="space-y-4 text-sm font-bold tracking-wide">
					<p class="text-primary">ENROLLED</p>
					<p class="text-warning">PENDING</p>
					<p class="text-error">REJECTED</p>
				</div>
			</div>
		</article>

		<article class="rounded-3xl border border-base-300 bg-base-100 p-6 shadow-sm lg:p-8">
			<h2 class="text-2xl font-extrabold tracking-tight text-base-content">RECENT ENROLLED</h2>
			<ul class="mt-8 space-y-8">
				{#each recent as row (row.id)}
					<li class="flex items-center justify-between gap-4">
						<span class="text-sm font-medium text-base-content/70">{row.id}</span>
						<span
							class="badge h-8 rounded-md border-none px-6 font-bold text-base-content badge-info"
							>{row.program}</span
						>
					</li>
				{/each}
			</ul>
		</article>
	</div>
</section>
