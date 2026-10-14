<script lang="ts">
	import CatalogPage from '#lib/components/Catalog/CatalogPage.svelte';
	import CatalogToolbar from '#lib/components/Catalog/CatalogToolbar.svelte';
	import Dropdown from '#lib/components/Dropdown/Dropdown.svelte';
	import { showError, showLoading, showSuccess } from '#lib/components/Popup/Popup.svelte.js';
	import PopupCard from '#lib/components/Popup/PopupCard.svelte';
	import { filterUserSchema } from '#lib/schema.js';
	import { Eye, MailCheck, Pencil, Settings, Trash2, X } from '@lucide/svelte';
	import { resendMagicLink } from '../../../lib/actions/user.remote.js';

	let { data } = $props();

	const students = $derived(data.users);
	let viewDialog: HTMLDialogElement;
	let selectedStudent = $state<(typeof students)[number] | null>(null);
	let resending = $state(false);

	function viewStudent(student: (typeof students)[number]) {
		selectedStudent = student;
		viewDialog.showModal();
	}

	async function resend(email: string) {
		if (resending) return;
		resending = true;
		showLoading();

		await resendMagicLink({ email })
			.then(() => {
				showSuccess('Verification email sent successfully');
			})
			.catch((error) => {
				showError(error?.message ?? 'Failed to send verification email');
			})
			.finally(() => {
				resending = false;
			});
	}
</script>

<CatalogPage
	title="Students"
	description="Manage and maintain student accounts and access"
	total={data.total}
	itemLabel="students"
>
	{#snippet toolbar()}
		<CatalogToolbar
			search={data.search}
			placeholder="Search by name, account ID or email..."
			searchLabel="Search students"
			filterSchema={filterUserSchema}
			filters={data.filters}
		></CatalogToolbar>
	{/snippet}

	{#snippet header()}
		<tr
			class="border-b border-base-300 bg-base-200 text-[11px] font-extrabold tracking-wider text-base-content/60 uppercase"
		>
			<th class="py-4 pl-5">Student</th>
			<th>Program</th>
			<th>Year Level</th>
			<th>Section</th>
			<th>Verification</th>
			<th class="pr-5 text-right">Actions</th>
		</tr>
	{/snippet}

	{#each students as student (student.id)}
		<tr class="border-b border-base-200 transition-colors last:border-0 hover:bg-base-200/80">
			<!-- Student -->
			<td class="py-4 pl-5">
				<div class="flex items-center gap-3">
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary"
					>
						{student.name.charAt(0)}
					</div>

					<div class="min-w-0">
						<p class="truncate font-bold text-base-content">
							{student.name}
						</p>

						<p class="mt-0.5 text-xs text-base-content/50">
							{student.email}
						</p>
					</div>
				</div>
			</td>

			<!-- Program -->
			<td>
				<span class="font-semibold text-base-content/70">
					{student.applicant?.programCode || 'N/A'}
				</span>
			</td>

			<!-- Year Level -->
			<td class="text-sm font-medium text-base-content/60">
				{student.applicant?.yearLevel || 'N/A'}
			</td>

			<!-- Section -->
			<td class="pr-5 text-sm font-semibold text-base-content/70">N/A</td>

			<!-- Verification -->
			<td>
				<span
					class={`badge gap-1.5 border-none px-3 font-bold ${
						student.setupComplete ? 'badge-success' : 'badge-warning'
					}`}
				>
					<span class="h-1.5 w-1.5 rounded-full bg-current"></span>

					{student.setupComplete ? 'Verified' : 'Setup required'}
				</span>
			</td>

			<!-- Actions -->
			<td class="pr-5">
				<div class="flex justify-end pr-2">
					<Dropdown id={`student-${student.id}`} label={`Actions for ${student.name}`}>
						{#snippet trigger()}
							<Settings class="h-4 w-4" />
						{/snippet}

						<ul class="menu w-full p-0">
							<li>
								<button type="button" onclick={() => viewStudent(student)}>
									<Eye class="h-4 w-4" />
									View
								</button>
							</li>

							<li>
								<button type="button" disabled title="Editing is not available yet">
									<Pencil class="h-4 w-4" />
									Edit
								</button>
							</li>

							{#if !student.setupComplete}
								<li>
									<button type="button" disabled={resending} onclick={() => resend(student.email)}>
										<MailCheck class="h-4 w-4" />
										Resend verification
									</button>
								</li>
							{/if}

							<li class="text-error">
								<button type="button" disabled title="Deletion is not available yet">
									<Trash2 class="h-4 w-4" />
									Delete
								</button>
							</li>
						</ul>
					</Dropdown>
				</div>
			</td>
		</tr>
	{/each}
</CatalogPage>

<dialog bind:this={viewDialog} class="z-0" aria-labelledby="view-student-title">
	<PopupCard onClose={() => viewDialog.close()}>
		<div class="card-body gap-6 p-6">
			<div class="flex items-center justify-between gap-4">
				<h2 id="view-student-title" class="text-lg font-semibold">Student details</h2>
				<button
					type="button"
					class="btn btn-circle btn-ghost btn-sm"
					aria-label="Close student details"
					onclick={() => viewDialog.close()}
				>
					<X class="size-4" aria-hidden="true" />
				</button>
			</div>
			{#if selectedStudent}
				<dl class="space-y-4">
					<div>
						<dt class="text-sm text-base-content/60">Name</dt>
						<dd class="font-semibold">{selectedStudent.name}</dd>
					</div>
					<div>
						<dt class="text-sm text-base-content/60">Email</dt>
						<dd class="break-all">{selectedStudent.email}</dd>
					</div>
					<div>
						<dt class="text-sm text-base-content/60">Account ID</dt>
						<dd class="font-mono text-sm break-all">{selectedStudent.id}</dd>
					</div>
					<div>
						<dt class="text-sm text-base-content/60">Verification</dt>
						<dd>{selectedStudent.setupComplete ? 'Verified' : 'Setup required'}</dd>
					</div>
				</dl>
			{/if}
		</div>
	</PopupCard>
</dialog>
