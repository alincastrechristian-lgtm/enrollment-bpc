<script lang="ts">
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
	<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
		<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
			<!-- Search -->
			<label class="input-bordered input flex w-full items-center gap-3 bg-slate-50 lg:max-w-md">
				<Search class="h-4 w-4 text-slate-400" />

				<input type="text" placeholder="Search by subject name or code..." class="grow text-sm" />
			</label>

			<!-- Actions -->
			<div class="flex flex-wrap gap-2">
				<button class="btn gap-2 border-slate-300 bg-white btn-outline btn-sm">
					<SlidersHorizontal class="h-4 w-4" />
					Filter
				</button>

				<button class="btn gap-2 bg-emerald-700 text-white btn-sm hover:bg-emerald-800">
					<Plus class="h-4 w-4" />
					New Subject
				</button>
			</div>
		</div>
	</div>

	<!-- Table Card -->
	<div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
		<!-- Table header -->
		<div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
			<div>
				<h2 class="font-bold text-slate-800">Subjects</h2>
				<p class="mt-0.5 text-xs text-slate-400">Manage the catalog of subjects offered</p>
			</div>

			<span class="badge badge-ghost font-semibold text-slate-500">
				{subjects.length} records
			</span>
		</div>

		<!-- Responsive table -->
		<div class="overflow-x-auto">
			<table class="table w-full">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-[11px] font-extrabold tracking-wider text-slate-500 uppercase"
					>
						<th class="py-4 pl-5">Subject</th>
						<th>Code</th>
						<th>Units</th>
						<th class="pr-5">Program</th>
					</tr>
				</thead>

				<tbody>
					{#each subjects as row (row.id)}
						<tr
							class="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80"
						>
							<!-- Subject -->
							<td class="py-4 pl-5">
								<div class="flex items-center gap-3">
									<div
										class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700"
									>
										{row.code.charAt(0)}
									</div>

									<div class="min-w-0">
										<p class="truncate font-bold text-slate-800">{row.name}</p>

										<p class="mt-0.5 font-mono text-[11px] text-slate-400">{row.id}</p>
									</div>
								</div>
							</td>

							<!-- Code -->
							<td>
								<span class="font-semibold text-slate-600">{row.code}</span>
							</td>

							<!-- Units -->
							<td class="text-sm font-medium text-slate-500">{row.units}</td>

							<!-- Program -->
							<td class="pr-5 text-sm font-semibold text-slate-600">{row.program}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Footer -->
		<div
			class="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<p class="text-xs font-medium text-slate-500">
				Showing <span class="font-bold text-slate-700">1–{subjects.length}</span>
				of <span class="font-bold text-slate-700">{subjects.length}</span> subjects
			</p>

			<div class="join">
				<button class="btn join-item btn-sm" disabled>«</button>
				<button class="btn join-item bg-emerald-700 text-white btn-sm hover:bg-emerald-800"
					>1</button
				>
				<button class="btn join-item btn-sm">2</button>
				<button class="btn join-item btn-sm">3</button>
				<button class="btn join-item btn-sm">»</button>
			</div>
		</div>
	</div>
</section>
