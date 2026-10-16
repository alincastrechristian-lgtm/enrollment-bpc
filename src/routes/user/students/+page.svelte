<script lang="ts">
	import { getErrorMessage } from '#lib/errors.js';
	import CatalogPage from '#lib/components/Catalog/CatalogPage.svelte';
	import CatalogToolbar from '#lib/components/Catalog/CatalogToolbar.svelte';
	import Dropdown from '#lib/components/Dropdown/Dropdown.svelte';
	import { showError, showLoading, showSuccess } from '#lib/components/Popup/Popup.svelte.js';
	import { resolve } from '$app/paths';
	import { filterStudentSchema } from '#lib/schema.js';
	import {
		Eye,
		GraduationCap,
		MailCheck,
		Pencil,
		Ellipsis,
		Trash2,
		UserPlus
	} from '@lucide/svelte';
	import { resendMagicLink } from '#lib/actions/user.remote.js';

	import StudentDialog from './StudentDialog.svelte';
	let studentDialog = $state<StudentDialog>();
	let { data } = $props();

	const students = $derived(data.users);
	let resending = $state(false);

	async function resend(email: string) {
		if (resending) return;
		resending = true;
		showLoading();

		await resendMagicLink({ email })
			.then(() => {
				showSuccess('Verification email sent successfully');
			})
			.catch((error) => {
				showError(getErrorMessage(error, 'Failed to send verification email'));
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
			placeholder="Search by name, student number or email..."
			searchLabel="Search students"
			filterSchema={filterStudentSchema}
			filterOptions={data.filterOptions}
			filters={data.filters}
		>
			<button
				type="button"
				class="btn gap-2 btn-primary btn-sm"
				onclick={() => studentDialog?.open()}
			>
				<UserPlus class="size-4" aria-hidden="true" />Create student
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
						<a
							href={resolve('/user/students/[userId]', { userId: student.id })}
							class="font-semibold text-base-content hover:text-primary hover:underline"
						>
							{student.name}
						</a>

						<p class="mt-0.5 text-xs text-base-content/50">
							{student.email}
						</p>
						{#if student.studentData}
							<p class="mt-1 font-mono text-xs text-base-content/50">
								{student.studentData.studentId}
							</p>
						{/if}
					</div>
				</div>
			</td>

			<!-- Program -->
			<td>
				<span class="font-semibold text-base-content/70">
					{student.studentData?.currentEnrollment?.curriculum?.programCode ?? 'Not enrolled'}
				</span>
			</td>

			<!-- Year Level -->
			<td class="text-sm font-medium text-base-content/60">
				{student.studentData?.currentEnrollment?.yearLevel ?? 'N/A'}
			</td>

			<!-- Section -->
			<td class="pr-5 text-sm font-semibold text-base-content/70">
				{student.studentData?.currentEnrollment?.section ?? 'N/A'}
			</td>

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
							<Ellipsis class="h-4 w-4" />
						{/snippet}

						<ul class="menu w-full p-0">
							<li>
								<a href={resolve('/user/students/[userId]', { userId: student.id })}>
									<Eye class="h-4 w-4" />
									View
								</a>
							</li>

							{#if student.studentData}
								<li>
									<a href={resolve('/user/students/[userId]/enroll', { userId: student.id })}>
										<GraduationCap class="size-4" aria-hidden="true" />Enroll student
									</a>
								</li>
							{/if}
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

<StudentDialog bind:this={studentDialog} />
