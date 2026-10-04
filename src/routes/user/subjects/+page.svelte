<script lang="ts">
	import Table from '#lib/components/Table/Table.svelte';
	import { Plus, Search, SlidersHorizontal } from '@lucide/svelte';

	const subjects = [
		{
			id: 'SUB-101',
			name: 'Introduction to Programming',
			code: 'CS101',
			units: '3',
			program: 'BSIS'
		},
		{
			id: 'SUB-102',
			name: 'Database Management Systems',
			code: 'CS204',
			units: '3',
			program: 'BSIS'
		},
		{ id: 'SUB-103', name: 'Computer Fundamentals', code: 'ACT100', units: '3', program: 'ACT' },
		{ id: 'SUB-104', name: 'Hospitality Operations', code: 'HRM210', units: '4', program: 'DHRMT' },
		{ id: 'SUB-105', name: 'Business Communication', code: 'BUS110', units: '3', program: 'BSBA' },
		{ id: 'SUB-106', name: 'Teaching Strategies', code: 'EDU220', units: '3', program: 'BSEd' }
	];
</script>

<section class="space-y-6">
	<!-- Toolbar -->
	<div class="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5">
		<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
			<!-- Search -->
			<label class="input-bordered input flex w-full items-center gap-3 bg-base-200 lg:max-w-md">
				<Search class="h-4 w-4 text-base-content/50" />

				<input type="text" placeholder="Search by subject name or code..." class="grow text-sm" />
			</label>

			<!-- Actions -->
			<div class="flex flex-wrap gap-2">
				<button class="btn gap-2 border-base-300 bg-base-100 btn-outline btn-sm">
					<SlidersHorizontal class="h-4 w-4" />
					Filter
				</button>

				<button class="btn gap-2 bg-primary text-primary-content btn-sm hover:bg-primary/80">
					<Plus class="h-4 w-4" />
					New Subject
				</button>
			</div>
		</div>
	</div>

	<Table
		title="Subjects"
		description="Manage the catalog of subjects offered"
		count={subjects.length}
		itemLabel="subjects"
	>
		{#snippet header()}
			<tr
				class="border-b border-base-300 bg-base-200 text-[11px] font-extrabold tracking-wider text-base-content/60 uppercase"
			>
				<th class="py-4 pl-5">Subject</th>
				<th>Code</th>
				<th>Units</th>
				<th class="pr-5">Program</th>
			</tr>
		{/snippet}

		{#each subjects as row (row.id)}
			<tr class="border-b border-base-200 transition-colors last:border-0 hover:bg-base-200/80">
				<!-- Subject -->
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

				<!-- Units -->
				<td class="text-sm font-medium text-base-content/60">{row.units}</td>

				<!-- Program -->
				<td class="pr-5 text-sm font-semibold text-base-content/70">{row.program}</td>
			</tr>
		{/each}
	</Table>
</section>
