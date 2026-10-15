<script lang="ts">
	import { resendMagicLink } from '#lib/actions/user.remote.js';
	import { showError, showSuccess } from '#lib/components/Popup/Popup.svelte.js';
	import { resolve } from '$app/paths';
	import { BookOpen, FileCheck, GraduationCap, MailCheck, RotateCcw, User } from '@lucide/svelte';
	import { semesterLabel } from '../../curriculum/SubjectLayout.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const student = $derived(data.student);
	const record = $derived(student.studentData);
	const profile = $derived(record?.applicant ?? student.applicant);
	const enrollments = $derived(record?.enrollments ?? []);
	const current = $derived(
		enrollments.find((entry) => entry.id === record?.currentEnrollmentId) ?? null
	);
	let historyFilters = $state({ schoolYear: '', semester: '', status: '', programCode: '' });
	const schoolYears = $derived(
		[...new Set(enrollments.map((entry) => entry.schoolYearStart))].sort((a, b) => b - a)
	);
	const semesters = $derived(
		[...new Set(enrollments.map((entry) => entry.semester))].sort((a, b) => a - b)
	);
	const statuses = $derived([...new Set(enrollments.map((entry) => entry.status))].sort());
	const programs = $derived(
		[
			...new Map(
				enrollments.map(
					(entry) => [entry.curriculum.programCode, entry.curriculum.program] as const
				)
			)
		]
			.map(([code, program]) => ({ code, label: program ? `${code} — ${program.name}` : code }))
			.sort((a, b) => a.code.localeCompare(b.code))
	);
	const hasHistoryFilters = $derived(
		Boolean(
			historyFilters.schoolYear ||
			historyFilters.semester ||
			historyFilters.status ||
			historyFilters.programCode
		)
	);
	const filteredEnrollments = $derived(
		enrollments.filter(
			(entry) =>
				(!historyFilters.schoolYear ||
					entry.schoolYearStart === Number(historyFilters.schoolYear)) &&
				(!historyFilters.semester || entry.semester === Number(historyFilters.semester)) &&
				(!historyFilters.status || entry.status === historyFilters.status) &&
				(!historyFilters.programCode || entry.curriculum.programCode === historyFilters.programCode)
		)
	);
	function clearHistoryFilters() {
		historyFilters = { schoolYear: '', semester: '', status: '', programCode: '' };
	}
	$effect(() => {
		// A different student must not inherit the previous student's selections.
		if (student.id) clearHistoryFilters();
	});
	let resending = $state(false);
	const formatter = new Intl.DateTimeFormat('en-PH', {
		timeZone: 'Asia/Manila',
		dateStyle: 'medium'
	});
	const date = (value: Date | null | undefined) =>
		value ? formatter.format(value) : 'Not recorded';
	const details = $derived([
		['Email', student.email],
		['Contact number', profile?.contactNumber ?? 'Not recorded'],
		['Address', profile?.address ?? 'Not recorded'],
		['Application ID', profile?.applicationId ?? 'Not recorded'],
		['Program', current?.curriculum.program?.name ?? profile?.programCode ?? 'Not recorded'],
		['Date applied', date(profile?.dateApplied)]
	]);
	const documents = $derived([
		{ label: 'Birth certificate', received: profile?.hasBirthCertificate },
		{ label: 'Form 138', received: profile?.hasForm138 },
		{ label: 'Good moral certificate', received: profile?.hasGoodMoral },
		{ label: 'Picture', received: profile?.hasPicture }
	]);
	async function resend() {
		if (resending) return;
		resending = true;
		try {
			await resendMagicLink({ email: student.email });
			showSuccess('Account setup email sent successfully');
		} catch (cause) {
			showError(cause instanceof Error ? cause.message : 'Failed to send account setup email');
		} finally {
			resending = false;
		}
	}
</script>

<svelte:head><title>{student.name} | BPC Enrollment System</title></svelte:head>
<section class="mx-auto max-w-7xl space-y-6">
	<header class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
		<div class="h-1.5 bg-primary" aria-hidden="true"></div>
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
				{#if profile}
					<a
						class="btn border-base-300 btn-outline btn-sm"
						href={resolve('/user/applicants/[applicantId]', { applicantId: profile.id })}
					>
						<User class="size-4" aria-hidden="true" />View application
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
			<section
				class="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm sm:p-6"
				aria-labelledby="student-info-heading"
			>
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
				class="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm sm:p-6"
				aria-labelledby="current-enrollment-heading"
			>
				<h2 id="current-enrollment-heading" class="mb-5 flex items-center gap-2 font-bold">
					<GraduationCap class="size-5 text-primary" aria-hidden="true" />Current enrollment
				</h2>
				{#if current}
					<dl class="grid gap-4 text-sm sm:grid-cols-3">
						{#each [['School year', `${current.schoolYearStart}–${current.schoolYearStart + 1}`], ['Year level', `Year ${current.yearLevel}`], ['Semester', semesterLabel(current.semester)], ['Section', current.section], ['Status', current.status], ['Curriculum', current.curriculum.name]] as [label, value] (label)}
							<div>
								<dt class="text-xs text-base-content/50">{label}</dt>
								<dd class="mt-1 font-semibold capitalize">{value}</dd>
							</div>
						{/each}
					</dl>
				{:else}
					<p class="text-sm text-base-content/60">No current enrollment assigned.</p>
				{/if}
			</section>
		</div>
		<aside class="space-y-6">
			<section
				class="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm"
				aria-labelledby="account-heading"
			>
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
			{#if profile}
				<section
					class="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm"
					aria-labelledby="documents-heading"
				>
					<h2 id="documents-heading" class="mb-4 flex items-center gap-2 font-bold">
						<FileCheck class="size-5 text-primary" aria-hidden="true" />Admission documents
					</h2>
					<ul class="space-y-3 text-sm">
						{#each documents as document (document.label)}
							<li class="flex items-center justify-between gap-3">
								<span>{document.label}</span>
								<span
									class={`badge badge-sm ${document.received ? 'badge-success' : 'badge-warning'}`}
								>
									{document.received ? 'Received' : 'Missing'}
								</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		</aside>
	</div>
	<section class="space-y-4" aria-labelledby="history-heading">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 id="history-heading" class="flex items-center gap-2 text-lg font-bold">
				<BookOpen class="size-5 text-primary" aria-hidden="true" />Enrollment history
			</h2>
			{#if enrollments.length}
				<button
					type="button"
					class="btn border-base-300 btn-outline btn-sm"
					disabled={!hasHistoryFilters}
					onclick={clearHistoryFilters}
				>
					<RotateCcw class="size-4" aria-hidden="true" />Clear filters
				</button>
			{/if}
		</div>
		{#if enrollments.length}
			<fieldset
				class="grid gap-4 rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
			>
				<legend class="sr-only">Filter enrollment history</legend>
				<label class="space-y-2">
					<span class="text-sm font-semibold">School year</span>
					<select
						aria-label="School year"
						class="select w-full bg-base-200"
						bind:value={historyFilters.schoolYear}
					>
						<option value="">All school years</option>
						{#each schoolYears as year (year)}
							<option value={String(year)}>{year}–{year + 1}</option>
						{/each}
					</select>
				</label>
				<label class="space-y-2">
					<span class="text-sm font-semibold">Semester</span>
					<select
						aria-label="Semester"
						class="select w-full bg-base-200"
						bind:value={historyFilters.semester}
					>
						<option value="">All semesters</option>
						{#each semesters as semester (semester)}
							<option value={String(semester)}>{semesterLabel(semester)}</option>
						{/each}
					</select>
				</label>
				<label class="space-y-2">
					<span class="text-sm font-semibold">Enrollment status</span>
					<select
						aria-label="Enrollment status"
						class="select w-full bg-base-200"
						bind:value={historyFilters.status}
					>
						<option value="">All statuses</option>
						{#each statuses as status (status)}
							<option value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
						{/each}
					</select>
				</label>
				<label class="space-y-2">
					<span class="text-sm font-semibold">Program</span>
					<select
						aria-label="Program"
						class="select w-full bg-base-200"
						bind:value={historyFilters.programCode}
					>
						<option value="">All programs</option>
						{#each programs as program (program.code)}
							<option value={program.code}>{program.label}</option>
						{/each}
					</select>
				</label>
			</fieldset>
			<p class="text-sm text-base-content/60" role="status">
				Showing {filteredEnrollments.length} of {enrollments.length} enrollments
			</p>
		{/if}
		{#each filteredEnrollments as entry (entry.id)}
			<article
				class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm"
				aria-labelledby={`enrollment-${entry.id}`}
			>
				<div class="flex flex-wrap items-start justify-between gap-3 border-b border-base-300 p-5">
					<div>
						<h3 id={`enrollment-${entry.id}`} class="font-bold">
							{entry.schoolYearStart}–{entry.schoolYearStart + 1} · {semesterLabel(entry.semester)}
						</h3>
						<p class="mt-1 text-sm text-base-content/60">
							Year {entry.yearLevel} · Section {entry.section} · {entry.curriculum.program?.code} · {entry
								.curriculum.name}
						</p>
						<p class="mt-1 text-xs text-base-content/50">
							Recorded {date(entry.enrolledAt)} · {entry.subjects.length} subjects · {entry.subjects.reduce(
								(sum, subject) => sum + subject.units,
								0
							)} units
						</p>
					</div>
					<div class="flex gap-2">
						{#if entry.id === record?.currentEnrollmentId}
							<span class="badge badge-primary">Current</span>
						{/if}
						<span class="badge badge-outline capitalize">{entry.status}</span>
					</div>
				</div>
				{#if entry.subjects.length}
					<div class="overflow-x-auto">
						<table class="table w-full">
							<caption class="sr-only">
								Subjects for school year {entry.schoolYearStart}–{entry.schoolYearStart + 1},
								semester {entry.semester}
							</caption>
							<thead>
								<tr>
									<th>Code</th>
									<th>Subject</th>
									<th>Source</th>
									<th>Units</th>
									<th>Grade</th>
								</tr>
							</thead>
							<tbody>
								{#each entry.subjects as subject (subject.id)}
									<tr>
										<td class="font-mono text-xs">{subject.subjectCode}</td>
										<td class="min-w-48 font-semibold">{subject.subjectName}</td>
										<td>
											<span class="badge badge-outline badge-sm">
												{subject.source === 'curriculum' ? 'Curriculum' : 'Extra'}
											</span>
										</td>
										<td>{subject.units}</td>
										<td>{subject.grade ?? 'No grade'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<p class="p-5 text-sm text-base-content/60">No subjects recorded for this enrollment.</p>
				{/if}
			</article>
		{:else}
			<p class="rounded-2xl border border-base-300 bg-base-100 p-6 text-sm text-base-content/60">
				{enrollments.length
					? 'No enrollments match these filters. Try another selection or clear filters.'
					: 'No enrollment records yet.'}
			</p>
		{/each}
	</section>
</section>
