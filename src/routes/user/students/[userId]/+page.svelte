<script lang="ts">
	import { getErrorMessage } from '#lib/errors.js';
	import { getEnrollmentLockReason, getGradeConcerns } from '#lib/enrollment-grades.js';
	import EnrollmentHistory from '#lib/components/EnrollmentHistory.svelte';
	import { resendMagicLink } from '#lib/actions/user.remote.js';
	import { showError, showSuccess } from '#lib/components/Popup/Popup.svelte.js';
	import { resolve } from '$app/paths';
	import { ArrowRight, Eye, GraduationCap, MailCheck } from '@lucide/svelte';
	import { semesterLabel } from '../../curriculum/SubjectLayout.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const student = $derived(data.student);
	const record = $derived(student.studentData);

	const enrollments = $derived(record?.enrollments ?? []);
	const current = $derived(
		enrollments.find((entry) => entry.id === record?.currentEnrollmentId) ?? null
	);
	const enrollmentLockReason = $derived(
		getEnrollmentLockReason(
			current,
			getGradeConcerns(
				current?.subjects ?? [],
				!!current?.finalizedGrades && current.status !== 'dropped'
			).failedCount
		)
	);
	let resending = $state(false);
	const formatter = new Intl.DateTimeFormat('en-PH', {
		timeZone: 'Asia/Manila',
		dateStyle: 'medium'
	});
	const date = (value: Date | null | undefined) =>
		value ? formatter.format(value) : 'Not recorded';
	const details = $derived([
		['Email', student.email],
		['Contact number', record?.contactNumber ?? 'Not recorded'],
		['Address', record?.address ?? 'Not recorded'],
		['Program', current?.curriculum.program?.name ?? 'Not enrolled'],
		['Student since', date(record?.createdAt)]
	]);
	async function resend() {
		if (resending) return;
		resending = true;
		try {
			await resendMagicLink({ email: student.email });
			showSuccess('Account setup email sent successfully');
		} catch (cause) {
			showError(getErrorMessage(cause, 'Failed to send account setup email'));
		} finally {
			resending = false;
		}
	}
</script>

<svelte:head><title>{student.name} | BPC Enrollment System</title></svelte:head>
<section class="w-full space-y-6">
	<header class="portal-page-header">
		<div class="h-1 bg-primary" aria-hidden="true"></div>
		<div class="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
			<div class="flex min-w-0 items-center gap-4">
				{#if student.image}
					<img src={student.image} alt={student.name} class="size-16 rounded-2xl object-cover" />
				{:else}
					<span
						class="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold text-primary"
						aria-hidden="true"
					>
						{student.name.charAt(0)}
					</span>
				{/if}
				<div class="min-w-0">
					<h1 class="text-2xl font-bold wrap-break-word">{student.name}</h1>
					<p class="mt-1 font-mono text-sm text-base-content/60">
						{record?.studentId ?? 'No student record linked'}
					</p>
					<span class={`mt-2 badge ${student.setupComplete ? 'badge-success' : 'badge-warning'}`}>
						{student.setupComplete ? 'Account setup complete' : 'Account setup required'}
					</span>
				</div>
			</div>
			<div class="flex flex-wrap gap-2 sm:shrink-0">
				{#if record}
					<a
						class="btn btn-primary btn-sm"
						href={resolve('/user/students/[userId]/enroll', { userId: student.id })}
					>
						<GraduationCap class="size-4" aria-hidden="true" />Enroll student
					</a>
				{/if}
				{#if !student.setupComplete}
					<button
						class="btn btn-primary btn-sm"
						type="button"
						disabled={resending}
						onclick={resend}
					>
						<MailCheck class="size-4" aria-hidden="true" />{resending
							? 'Sending...'
							: 'Resend setup link'}
					</button>
				{/if}
			</div>
		</div>
	</header>
	<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
		<div class="min-w-0 space-y-6">
			<section class="portal-panel p-5 shadow-sm sm:p-6" aria-labelledby="student-info-heading">
				<h2 id="student-info-heading" class="mb-5 font-bold">Student information</h2>
				<dl class="grid gap-5 text-sm sm:grid-cols-2">
					{#each details as [label, value] (label)}
						<div>
							<dt class="text-xs text-base-content/50">{label}</dt>
							<dd class="mt-1 font-semibold wrap-break-word">{value}</dd>
						</div>
					{/each}
				</dl>
			</section>
			<section
				class="portal-panel p-5 shadow-sm sm:p-6"
				aria-labelledby="current-enrollment-heading"
			>
				<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
					<h2 id="current-enrollment-heading" class="flex items-center gap-2 font-bold">
						<GraduationCap class="size-5 text-primary" aria-hidden="true" />Current enrollment
					</h2>
					{#if current}
						<div class="flex flex-wrap items-center gap-2">
							<a
								class="btn border-base-300 btn-outline btn-sm"
								href={resolve('/user/students/[userId]/enrollments/[enrollmentId]', {
									userId: student.id,
									enrollmentId: current.id
								})}
							>
								<Eye class="size-4" aria-hidden="true" />View
							</a>
							{#if !enrollmentLockReason}
								<a
									class="btn gap-2 btn-primary btn-sm"
									href={resolve('/user/students/[userId]/enroll', { userId: student.id })}
								>
									{current.status === 'dropped'
										? 'Enroll again'
										: 'Enroll for next term'}<ArrowRight class="size-4" aria-hidden="true" />
								</a>
							{/if}
						</div>
					{/if}
				</div>
				{#if current}
					<dl class="grid gap-4 text-sm sm:grid-cols-3">
						{#each [['School year', `${current.schoolYearStart}–${current.schoolYearStart + 1}`], ['Year level', `Year ${current.yearLevel}`], ['Semester', semesterLabel(current.semester)], ['Section', current.section], ['Status', current.status], ['Curriculum', current.curriculum.name]] as [label, value] (label)}
							<div>
								<dt class="text-xs text-base-content/50">{label}</dt>
								<dd class="mt-1 font-semibold capitalize">{value}</dd>
							</div>
						{/each}
					</dl>
					{#if enrollmentLockReason}
						<p
							class="mt-5 rounded-xl border border-warning/30 bg-warning/10 p-4 text-xs leading-relaxed text-base-content/70"
							role="status"
						>
							{enrollmentLockReason}
						</p>
					{/if}
				{:else}
					<p class="text-sm text-base-content/60">No current enrollment assigned.</p>
				{/if}
			</section>
		</div>
		<aside class="space-y-6">
			<section class="portal-panel p-5 shadow-sm" aria-labelledby="account-heading">
				<h2 id="account-heading" class="mb-4 font-bold">Account information</h2>
				<dl class="space-y-4 text-sm">
					<div>
						<dt class="text-xs text-base-content/50">Account ID</dt>
						<dd class="mt-1 font-mono text-xs break-all">{student.id}</dd>
					</div>
					<div>
						<dt class="text-xs text-base-content/50">Email verification</dt>
						<dd>{student.emailVerified ? 'Verified' : 'Not verified'}</dd>
					</div>
					<div>
						<dt class="text-xs text-base-content/50">Access</dt>
						<dd>{student.banned ? 'Suspended' : 'Active'}</dd>
					</div>
					{#if student.banned && student.banReason}
						<div>
							<dt class="text-xs text-base-content/50">Suspension reason</dt>
							<dd>{student.banReason}</dd>
						</div>
					{/if}
					<div>
						<dt class="text-xs text-base-content/50">Created</dt>
						<dd>{date(student.createdAt)}</dd>
					</div>
					<div>
						<dt class="text-xs text-base-content/50">Last updated</dt>
						<dd>{date(student.updatedAt)}</dd>
					</div>
				</dl>
			</section>
		</aside>
	</div>
	{#key student.id}
		<EnrollmentHistory
			{enrollments}
			currentEnrollmentId={record?.currentEnrollmentId}
			studentUserId={student.id}
		/>
	{/key}
</section>
