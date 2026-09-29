<script lang="ts">
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
	<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
		<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
			<!-- Search -->
			<label class="input-bordered input flex w-full items-center gap-3 bg-slate-50 lg:max-w-md">
				<Search class="h-4 w-4 text-slate-400" />

				<input type="text" placeholder="Search by program name or code..." class="grow text-sm" />
			</label>

			<!-- Actions -->
			<div class="flex flex-wrap gap-2">
				<button class="btn gap-2 border-slate-300 bg-white btn-outline btn-sm">
					<SlidersHorizontal class="h-4 w-4" />
					Filter
				</button>

				<button class="btn gap-2 bg-emerald-700 text-white btn-sm hover:bg-emerald-800">
					<Plus class="h-4 w-4" />
					New Program
				</button>
			</div>
		</div>
	</div>

	<!-- Table Card -->
	<div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
		<!-- Table header -->
		<div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
			<div>
				<h2 class="font-bold text-slate-800">Programs</h2>
				<p class="mt-0.5 text-xs text-slate-400">Manage degree and program offerings</p>
			</div>

			<span class="badge badge-ghost font-semibold text-slate-500">
				{programs.length} records
			</span>
		</div>

		<!-- Responsive table -->
		<div class="overflow-x-auto">
			<table class="table w-full">
				<thead>
					<tr
						class="border-b border-slate-200 bg-slate-50 text-[11px] font-extrabold tracking-wider text-slate-500 uppercase"
					>
						<th class="py-4 pl-5">Program</th>
						<th>Code</th>
						<th>Degree</th>
						<th class="pr-5">Duration</th>
					</tr>
				</thead>

				<tbody>
					{#each programs as row (row.id)}
						<tr
							class="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80"
						>
							<!-- Program -->
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

							<!-- Degree -->
							<td class="text-sm font-medium text-slate-500">{row.degree}</td>

							<!-- Duration -->
							<td class="pr-5 text-sm font-semibold text-slate-600">{row.duration}</td>
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
				Showing <span class="font-bold text-slate-700">1–{programs.length}</span>
				of <span class="font-bold text-slate-700">{programs.length}</span> programs
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
