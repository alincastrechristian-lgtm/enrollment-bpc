<script lang="ts">
	const applicant = {
		name: 'Maria Santos Dela Cruz',
		id: 'APP-2026-001',
		schoolYear: '2026–2027',
		program: 'BSIS',
		yearLevel: '1st Year',
		email: 'maria@email.com',
		contact: '09XXXXXXXXX',
		address: 'Malolos, Bulacan',
		status: 'PENDING'
	};

	const details = [
		{ label: 'Program', value: applicant.program },
		{ label: 'Year', value: applicant.yearLevel },
		{ label: 'School Year', value: applicant.schoolYear },
		{ label: 'Email', value: applicant.email },
		{ label: 'Contact', value: applicant.contact },
		{ label: 'Address', value: applicant.address }
	];

	const requirements = [
		{ name: 'PSA Birth Certificate', status: 'Received' },
		{ name: 'Form 138 / Report Card', status: 'Received' },
		{ name: 'Good Moral Certificate', status: 'Received' },
		{ name: '2x2 Picture', status: 'Received' }
	];
</script>

<svelte:head>
	<title>Applicant View</title>
</svelte:head>

<section class="mx-auto max-w-7xl">
	<div class="card rounded-2xl border border-base-300 bg-base-100 shadow-sm">
		<div class="card-body gap-8 p-6 sm:p-8 lg:p-10">
			<div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
				<div class="flex items-start gap-5 sm:gap-6">
					<div class="placeholder avatar">
						<div
							class="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-black text-primary-content shadow-sm sm:h-24 sm:w-24"
						>
							<span>M</span>
						</div>
					</div>

					<div class="space-y-2 pt-1">
						<h1 class="text-2xl font-extrabold tracking-tight text-base-content sm:text-3xl">
							{applicant.name}
						</h1>
						<p class="text-sm font-medium text-base-content/60 sm:text-base">
							{applicant.id} <span class="mx-2 text-base-content/30">•</span>
							{applicant.schoolYear}
						</p>
					</div>
				</div>

				<div class="flex lg:justify-end">
					<div
						class="badge border-none px-6 py-4 badge-lg font-bold tracking-[0.2em] text-warning-content uppercase badge-warning"
					>
						{applicant.status}
					</div>
				</div>
			</div>

			<div class="grid gap-4 py-4 md:grid-cols-2">
				{#each details as item (item.label)}
					<div class="grid grid-cols-2 items-start gap-4 sm:grid-cols-[10rem_1fr]">
						<p class="text-sm font-extrabold tracking-wide text-base-content/60 uppercase">
							{item.label}
						</p>
						<p class="text-left text-base font-medium text-base-content/80 sm:text-lg">{item.value}</p>
					</div>
				{/each}
			</div>

			<div class="pt-2">
				<h2 class="text-lg font-extrabold tracking-tight text-base-content/80 uppercase sm:text-xl">
					Physical Requirements Record
				</h2>

				<div class="divider"></div>

				<div class="mt-6 flex flex-col gap-2 overflow-hidden border-base-300 bg-base-200/80">
					{#each requirements as requirement (requirement.name)}
						<div class="flex items-center justify-between gap-4">
							<p class="text-sm font-medium text-base-content/70 sm:text-base">
								{requirement.name}
							</p>

							<div>
								<div
									class="badge border-none bg-primary/10 px-5 badge-lg font-bold tracking-[0.18em] text-primary uppercase badge-success"
								>
									{requirement.status}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</section>
