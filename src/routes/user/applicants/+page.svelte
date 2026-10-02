<script lang="ts">
	import { Eye, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from '@lucide/svelte';

	const applicants = [
		{ id: '2026-000428', name: 'Ana Cruz', program: 'BSIS', status: 'Pending', date: '2026-09-28' },
		{
			id: '2026-000427',
			name: 'Juan Reyes',
			program: 'ACT',
			status: 'Approved',
			date: '2026-09-27'
		},
		{
			id: '2026-000426',
			name: 'Maria Santos',
			program: 'DHRMT',
			status: 'Pending',
			date: '2026-09-26'
		},
		{
			id: '2026-000425',
			name: 'Pedro Garcia',
			program: 'BSIS',
			status: 'Rejected',
			date: '2026-09-25'
		},
		{
			id: '2026-000424',
			name: 'Laura Mendoza',
			program: 'ACT',
			status: 'Approved',
			date: '2026-09-24'
		},
		{
			id: '2026-000423',
			name: 'Tom Lee',
			program: 'DHRMT',
			status: 'Pending',
			date: '2026-09-23'
		}
	];

	const statusBadge = (status: string) => {
		switch (status) {
			case 'Approved':
				return 'badge-success';
			case 'Rejected':
				return 'badge-error';
			default:
				return 'badge-warning';
		}
	};
</script>

<section class="space-y-6">
	<!-- Toolbar -->
	<div class="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5">
		<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
			<!-- Search -->
			<label class="input-bordered input flex w-full items-center gap-3 bg-base-200 lg:max-w-md">
				<Search class="h-4 w-4 text-base-content/50" />

				<input type="text" placeholder="Search by name or applicant ID..." class="grow text-sm" />
			</label>

			<!-- Actions -->
			<div class="flex flex-wrap gap-2">
				<button class="btn gap-2 border-base-300 bg-base-100 btn-outline btn-sm">
					<SlidersHorizontal class="h-4 w-4" />
					Filter
				</button>

				<button class="btn gap-2 bg-primary text-primary-content btn-sm hover:bg-primary/80">
					<Plus class="h-4 w-4" />
					New Applicant
				</button>
			</div>
		</div>
	</div>

	<!-- Table Card -->
	<div class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
		<!-- Table header -->
		<div class="flex items-center justify-between border-b border-base-300 px-5 py-4">
			<div>
				<h2 class="font-bold text-base-content">Applicants</h2>
				<p class="mt-0.5 text-xs text-base-content/50">Manage and review applicant records</p>
			</div>

			<span class="badge badge-ghost font-semibold text-base-content/60">
				{applicants.length} records
			</span>
		</div>

		<!-- Responsive table -->
		<div class="overflow-x-auto">
			<table class="table w-full">
				<thead>
					<tr
						class="border-b border-base-300 bg-base-200 text-[11px] font-extrabold tracking-wider text-base-content/60 uppercase"
					>
						<th class="py-4 pl-5">Applicant</th>
						<th>Program</th>
						<th>Status</th>
						<th>Date Applied</th>
						<th class="pr-5 text-right">Actions</th>
					</tr>
				</thead>

				<tbody>
					{#each applicants as row (row.id)}
						<tr
							class="border-b border-base-200 transition-colors last:border-0 hover:bg-base-200/80"
						>
							<!-- Applicant -->
							<td class="py-4 pl-5">
								<div class="flex items-center gap-3">
									<div
										class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary"
									>
										{row.name.charAt(0)}
									</div>

									<div class="min-w-0">
										<p class="truncate font-bold text-base-content">
											{row.name}
										</p>

										<p class="mt-0.5 font-mono text-[11px] text-base-content/50">
											{row.id}
										</p>
									</div>
								</div>
							</td>

							<!-- Program -->
							<td>
								<span class="font-semibold text-base-content/70">
									{row.program}
								</span>
							</td>

							<!-- Status -->
							<td>
								<span class={`badge gap-1.5 border-none px-3 font-bold ${statusBadge(row.status)}`}>
									<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
									{row.status}
								</span>
							</td>

							<!-- Date -->
							<td class="text-sm font-medium text-base-content/60">
								{row.date}
							</td>

							<!-- Actions -->
							<td class="pr-5">
								<div class="flex justify-end gap-1">
									<a
										href="/user/applicants/view"
										class="btn btn-square btn-ghost text-base-content/60 btn-sm hover:bg-primary/10 hover:text-primary"
										aria-label="View applicant"
										title="View"
									>
										<Eye class="h-4 w-4" />
									</a>

									<button
										class="btn btn-square btn-ghost text-base-content/60 btn-sm hover:bg-info/10 hover:text-info"
										aria-label="Edit applicant"
										title="Edit"
									>
										<Pencil class="h-4 w-4" />
									</button>

									<button
										class="btn btn-square btn-ghost text-base-content/50 btn-sm hover:bg-error/10 hover:text-error"
										aria-label="Delete applicant"
										title="Delete"
									>
										<Trash2 class="h-4 w-4" />
									</button>
								</div>
							</td>
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
				Showing <span class="font-bold text-base-content/80">1–{applicants.length}</span>
				of <span class="font-bold text-base-content/80">{applicants.length}</span> applicants
			</p>

			<div class="join">
				<button class="btn join-item btn-sm" disabled>«</button>
				<button class="btn join-item bg-primary text-primary-content btn-sm hover:bg-primary/80">
					1
				</button>
				<button class="btn join-item btn-sm">2</button>
				<button class="btn join-item btn-sm">3</button>
				<button class="btn join-item btn-sm">»</button>
			</div>
		</div>
	</div>
</section>
