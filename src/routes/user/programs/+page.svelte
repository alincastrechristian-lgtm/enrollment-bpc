<script lang="ts">
	import Table from '#lib/components/Table/Table.svelte';
	import { Plus, Search, SlidersHorizontal } from '@lucide/svelte';

	const programs = [
		{
			id: 'PRG-001',
			name: 'Bachelor of Science in Information Systems',
			code: 'BSIS',
			degree: 'Bachelor',
			duration: '4 years'
		},
		{
			id: 'PRG-002',
			name: 'Associate in Computer Technology',
			code: 'ACT',
			degree: 'Associate',
			duration: '2 years'
		},
		{
			id: 'PRG-003',
			name: 'Diploma in Hotel and Restaurant Management',
			code: 'DHRMT',
			degree: 'Diploma',
			duration: '2 years'
		},
		{
			id: 'PRG-004',
			name: 'Bachelor of Science in Business Administration',
			code: 'BSBA',
			degree: 'Bachelor',
			duration: '4 years'
		},
		{
			id: 'PRG-005',
			name: 'Bachelor of Elementary Education',
			code: 'BEE',
			degree: 'Bachelor',
			duration: '4 years'
		},
		{
			id: 'PRG-006',
			name: 'Bachelor of Secondary Education',
			code: 'BSEd',
			degree: 'Bachelor',
			duration: '4 years'
		}
	];
</script>

<section class="space-y-6">
	<!-- Toolbar -->
	<div class="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5">
		<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
			<!-- Search -->
			<label
				class="input-bordered input flex w-full min-w-0 items-center gap-3 bg-base-200 lg:flex-1"
			>
				<Search class="h-4 w-4 shrink-0 text-base-content/50" />

				<input
					type="text"
					placeholder="Search by program name or code..."
					class="min-w-0 grow text-sm"
				/>
			</label>

			<!-- Actions -->
			<div class="flex shrink-0 flex-row gap-2">
				<button class="btn gap-2 border-base-300 bg-base-100 btn-outline btn-sm">
					<SlidersHorizontal class="h-4 w-4" />
					Filter
				</button>

				<button class="btn gap-2 bg-primary text-primary-content btn-sm hover:bg-primary/80">
					<Plus class="h-4 w-4" />
					New Program
				</button>
			</div>
		</div>
	</div>

	<Table
		title="Programs"
		description="Manage degree and program offerings"
		total={programs.length}
		itemLabel="programs"
	>
		{#snippet header()}
			<tr
				class="border-b border-base-300 bg-base-200 text-[11px] font-extrabold tracking-wider text-base-content/60 uppercase"
			>
				<th class="py-4 pl-5">Program</th>
				<th>Code</th>
				<th>Degree</th>
				<th class="pr-5">Duration</th>
			</tr>
		{/snippet}

		{#each programs as row (row.id)}
			<tr class="border-b border-base-200 transition-colors last:border-0 hover:bg-base-200/80">
				<!-- Program -->
				<td class="py-4 pl-5">
					<div class="flex items-center gap-3">
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary"
						>
							{row.code.charAt(0)}
						</div>

						<div class="min-w-0">
							<p class="truncate font-bold text-base-content">{row.name}</p>

							<p class="mt-0.5 font-mono text-[11px] text-base-content/50">{row.id}</p>
						</div>
					</div>
				</td>

				<!-- Code -->
				<td>
					<span class="font-semibold text-base-content/70">{row.code}</span>
				</td>

				<!-- Degree -->
				<td class="text-sm font-medium text-base-content/60">{row.degree}</td>

				<!-- Duration -->
				<td class="pr-5 text-sm font-semibold text-base-content/70">{row.duration}</td>
			</tr>
		{/each}
	</Table>
</section>
