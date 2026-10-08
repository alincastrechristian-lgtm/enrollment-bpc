<script lang="ts">
	import Dropdown from '#lib/components/Dropdown/Dropdown.svelte';
	import { showError, showLoading, showSuccess } from '#lib/components/Popup/Popup.svelte.js';
	import PopupCard from '#lib/components/Popup/PopupCard.svelte';
	import CatalogPage from '#lib/components/Catalog/CatalogPage.svelte';
	import CatalogToolbar from '#lib/components/Catalog/CatalogToolbar.svelte';
	import { filterUserSchema } from '#lib/schema.js';
	import { refreshAll } from '$app/navigation';
	import {
		Eye,
		Mail,
		MailCheck,
		Pencil,
		Plus,
		Settings,
		Trash2,
		User,
		UserPlus,
		X
	} from '@lucide/svelte';
	import { createStudent, resendMagicLink } from '../../../lib/actions/user.remote.js';

	let { data } = $props();

	const students = $derived(data.users);
	let studentDialog: HTMLDialogElement;
	let studentForm: HTMLFormElement;
	let viewDialog: HTMLDialogElement;
	let selectedStudent = $state<(typeof students)[number] | null>(null);
	let creating = $state(false);
	let resending = $state(false);

	function viewStudent(student: (typeof students)[number]) {
		selectedStudent = student;
		viewDialog.showModal();
	}

	function openStudentPopup() {
		studentForm.reset();
		studentDialog.showModal();
	}

	async function handleCreateStudent(event: SubmitEvent) {
		event.preventDefault();

		const form = event.currentTarget as HTMLFormElement;
		const formData = new FormData(form);

		const name = formData.get('name')?.toString() ?? '';
		const email = formData.get('email')?.toString() ?? '';

		showLoading();

		try {
			await createStudent({
				name,
				email
			});

			studentDialog.close();
			studentForm.reset();

			await refreshAll();

			showSuccess('Student invitation created successfully');
		} catch (error) {
			showError(error instanceof Error ? error.message : 'Failed to create student');
		}
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
		>
			<button
				type="button"
				class="btn gap-2 bg-primary text-primary-content btn-sm hover:bg-primary/80"
				onclick={openStudentPopup}
			>
				<Plus class="h-4 w-4" />
				New Student
			</button>
		</CatalogToolbar>
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
				<span class="font-semibold text-base-content/70">{student.applicant?.program || 'N/A'}</span
				>
			</td>

			<!-- Year Level -->
			<td class="text-sm font-medium text-base-content/60"
				>{student.applicant?.yearLevel || 'N/A'}</td
			>

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

<dialog
	bind:this={studentDialog}
	class="z-0"
	aria-labelledby="new-student-title"
	aria-describedby="new-student-description"
>
	<PopupCard onClose={() => studentDialog.close()}>
		<form bind:this={studentForm} class="card-body gap-6 p-6" onsubmit={handleCreateStudent}>
			<div class="flex items-start gap-4">
				<div
					class="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
				>
					<UserPlus class="size-7" aria-hidden="true" />
				</div>
				<div class="min-w-0 flex-1">
					<h2 id="new-student-title" class="text-lg font-semibold">New Student</h2>
					<p id="new-student-description" class="mt-1 text-sm text-base-content/60">
						Enter the student's name and email address.
					</p>
				</div>
				<button
					type="button"
					class="btn btn-circle btn-ghost btn-sm"
					aria-label="Close new student popup"
					onclick={() => studentDialog.close()}
				>
					<X class="size-4" aria-hidden="true" />
				</button>
			</div>

			<div class="space-y-4">
				<div class="space-y-2">
					<label for="student-name" class="text-sm font-semibold">Name</label>
					<div class="input-bordered input flex w-full items-center gap-3 bg-base-200">
						<User class="size-4 shrink-0 text-base-content/50" aria-hidden="true" />
						<input
							id="student-name"
							name="name"
							type="text"
							placeholder="Full name"
							autocomplete="name"
							required
							class="min-w-0 grow text-sm"
						/>
					</div>
				</div>
				<div class="space-y-2">
					<label for="student-email" class="text-sm font-semibold">Email</label>
					<div class="input-bordered input flex w-full items-center gap-3 bg-base-200">
						<Mail class="size-4 shrink-0 text-base-content/50" aria-hidden="true" />
						<input
							id="student-email"
							name="email"
							type="email"
							placeholder="student@example.com"
							autocomplete="email"
							required
							class="min-w-0 grow text-sm"
						/>
					</div>
				</div>
			</div>

			<div class="space-y-3">
				<div class="flex flex-col-reverse gap-2 sm:flex-row">
					<button
						type="button"
						class="btn flex-1 border-base-300 btn-outline"
						onclick={() => studentDialog.close()}>Cancel</button
					>
					<button type="submit" disabled={creating} class="btn flex-1 btn-primary">
						<Plus class="size-4" aria-hidden="true" />
						Create Student
					</button>
				</div>
			</div>
		</form>
	</PopupCard>
</dialog>

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
