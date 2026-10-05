<script lang="ts">
	import { deleteApplicant } from '#lib/actions/applicant.remote.js';
	import Dropdown from '#lib/components/Dropdown/Dropdown.svelte';
	import {
		showError,
		showLoading,
		showSuccess,
		showYesNo
	} from '#lib/components/Popup/Popup.svelte.js';
	import Table from '#lib/components/Table/Table.svelte';
	import type { Applicant } from '#lib/server/db/schema.js';
	import { refreshAll } from '$app/navigation';
	import { Eye, Pencil, Plus, Search, Settings, SlidersHorizontal, Trash2 } from '@lucide/svelte';
	import ApplicantDialog from './ApplicantDialog.svelte';
	import { dateValue, getApplicantStatus, statusBadge } from './functions.js';

	let { data } = $props();

	const applicants = $derived(data.applicants);

	let applicantDialog: ReturnType<typeof ApplicantDialog>;

	let busy = $state(false);

	async function removeApplicant(applicant: Applicant) {
		if (busy) return;
		busy = true;
		try {
			const confirmed = await showYesNo({
				title: 'Delete applicant?',
				message: `Delete ${applicant.name} (${applicant.applicationId})?`,
				warning: true,
				yesText: 'Delete',
				noText: 'Cancel'
			});
			if (!confirmed) return;
			showLoading();
			await deleteApplicant(applicant.id);
			await refreshAll();
			showSuccess('Applicant deleted successfully');
		} catch (error) {
			showError(error instanceof Error ? error.message : 'Failed to delete applicant');
		} finally {
			busy = false;
		}
	}
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
					placeholder="Search by name or applicant ID..."
					class="min-w-0 grow text-sm"
				/>
			</label>

			<!-- Actions -->
			<div class="flex shrink-0 flex-row gap-2">
				<button class="btn gap-2 border-base-300 bg-base-100 btn-outline btn-sm">
					<SlidersHorizontal class="h-4 w-4" />
					Filter
				</button>

				<button
					type="button"
					disabled={busy}
					onclick={() => applicantDialog.openApplicant()}
					class="btn gap-2 bg-primary text-primary-content btn-sm hover:bg-primary/80"
				>
					<Plus class="h-4 w-4" />
					New Applicant
				</button>
			</div>
		</div>
	</div>

	<Table
		title="Applicants"
		description="Manage and review applicant records"
		total={data.total}
		itemLabel="applicants"
	>
		{#snippet header()}
			<tr
				class="border-b border-base-300 bg-base-200 text-[11px] font-extrabold tracking-wider text-base-content/60 uppercase"
			>
				<th class="py-4 pl-5">Applicant</th>
				<th>Program</th>
				<th>Status</th>
				<th>Date Applied</th>
				<th class="pr-5 text-right">Actions</th>
			</tr>
		{/snippet}

		{#each applicants as row (row.id)}
			<tr class="border-b border-base-200 transition-colors last:border-0 hover:bg-base-200/80">
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
								{row.applicationId}
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
					<span class={`badge gap-1.5 border-none px-3 font-bold ${statusBadge(row)}`}>
						<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
						{getApplicantStatus(row)}
					</span>
				</td>

				<!-- Date -->
				<td class="text-sm font-medium text-base-content/60">
					{dateValue(row.dateApplied)}
				</td>

				<!-- Actions -->
				<td class="pr-5">
					<div class="flex justify-end pr-2">
						<Dropdown id={`applicants-${row.id}`} label={`Actions for ${row.name}`}>
							{#snippet trigger()}
								<Settings class="h-4 w-4" />
							{/snippet}
							<ul class="menu w-full p-0">
								<li><a href={`/user/applicants/${row.id}`}><Eye class="h-4 w-4" />View</a></li>
								<li>
									<button
										type="button"
										disabled={busy}
										onclick={() => applicantDialog.openApplicant(row)}
										><Pencil class="h-4 w-4" />Edit</button
									>
								</li>
								<li class="text-error">
									<button type="button" disabled={busy} onclick={() => removeApplicant(row)}
										><Trash2 class="h-4 w-4" />Delete</button
									>
								</li>
							</ul>
						</Dropdown>
					</div>
				</td>
			</tr>
		{/each}
	</Table>
</section>

<ApplicantDialog bind:this={applicantDialog} bind:busy />
