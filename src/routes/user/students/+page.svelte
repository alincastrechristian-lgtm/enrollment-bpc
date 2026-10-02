<script lang="ts">
	import { Plus, Search, SlidersHorizontal } from '@lucide/svelte';

	const students = [
		{
			id: '2026-100214',
			name: 'Mark Dela Cruz',
			program: 'BSIS',
			yearLevel: '3rd Year',
			section: 'A'
		},
		{
			id: '2026-100213',
			name: 'Jessa Navarro',
			program: 'ACT',
			yearLevel: '2nd Year',
			section: 'B'
		},
		{
			id: '2026-100212',
			name: 'Alyssa Reyes',
			program: 'DHRMT',
			yearLevel: '4th Year',
			section: 'A'
		},
		{
			id: '2026-100211',
			name: 'Kiel Santos',
			program: 'BSIS',
			yearLevel: '1st Year',
			section: 'C'
		},
		{
			id: '2026-100210',
			name: 'Paula Garcia',
			program: 'ACT',
			yearLevel: '3rd Year',
			section: 'B'
		},
		{
			id: '2026-100209',
			name: 'Noel Mendoza',
			program: 'DHRMT',
			yearLevel: '2nd Year',
			section: 'A'
		}
	];
</script>

<section class="space-y-6">
	<!-- Toolbar -->
	<div class="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5">
		<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
			<!-- Search -->
			<label class="input-bordered input flex w-full items-center gap-3 bg-base-200 lg:max-w-md">
				<Search class="h-4 w-4 text-base-content/50" />

				<input
					type="text"
					placeholder="Search by name, student ID, or program..."
					class="grow text-sm"
				/>
			</label>

			<!-- Actions -->
			<div class="flex flex-wrap gap-2">
				<button class="btn gap-2 border-base-300 bg-base-100 btn-outline btn-sm">
					<SlidersHorizontal class="h-4 w-4" />
					Filter
				</button>

				<button class="btn gap-2 bg-primary text-primary-content btn-sm hover:bg-primary/80">
					<Plus class="h-4 w-4" />
					New Student
				</button>
			</div>
		</div>
	</div>

	<!-- Table Card -->
	<div class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
		<!-- Table header -->
		<div class="flex items-center justify-between border-b border-base-300 px-5 py-4">
			<div>
				<h2 class="font-bold text-base-content">Students</h2>
				<p class="mt-0.5 text-xs text-base-content/50">View enrolled student records</p>
			</div>

			<span class="badge badge-ghost font-semibold text-base-content/60">
				{students.length} records
			</span>
		</div>

		<!-- Responsive table -->
		<div class="overflow-x-auto">
			<table class="table w-full">
				<thead>
					<tr
						class="border-b border-base-300 bg-base-200 text-[11px] font-extrabold tracking-wider text-base-content/60 uppercase"
					>
						<th class="py-4 pl-5">Student</th>
						<th>Program</th>
						<th>Year Level</th>
						<th class="pr-5">Section</th>
					</tr>
				</thead>

				<tbody>
					{#each students as row (row.id)}
						<tr
							class="border-b border-base-200 transition-colors last:border-0 hover:bg-base-200/80"
						>
							<!-- Student -->
							<td class="py-4 pl-5">
								<div class="flex items-center gap-3">
									<div
										class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary"
									>
										{row.name.charAt(0)}
									</div>

									<div class="min-w-0">
										<p class="truncate font-bold text-base-content">{row.name}</p>

										<p class="mt-0.5 font-mono text-[11px] text-base-content/50">{row.id}</p>
									</div>
								</div>
							</td>

							<!-- Program -->
							<td>
								<span class="font-semibold text-base-content/70">{row.program}</span>
							</td>

							<!-- Year Level -->
							<td class="text-sm font-medium text-base-content/60">{row.yearLevel}</td>

							<!-- Section -->
							<td class="pr-5 text-sm font-semibold text-base-content/70">{row.section}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Footer -->
		<div
			class="flex flex-col gap-3 border-t border-base-300 bg-base-200/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<p class="text-xs font-medium text-base-content/60">
				Showing <span class="font-bold text-base-content/80">1–{students.length}</span>
				of <span class="font-bold text-base-content/80">{students.length}</span> students
			</p>

			<div class="join">
				<button class="btn join-item btn-sm" disabled>«</button>
				<button class="btn join-item bg-primary text-primary-content btn-sm hover:bg-primary/80"
					>1</button
				>
				<button class="btn join-item btn-sm">2</button>
				<button class="btn join-item btn-sm">3</button>
				<button class="btn join-item btn-sm">»</button>
			</div>
		</div>
	</div>
</section>
