<script lang="ts">
	import { formatBirthDate, formatStudentSex } from '#lib/student-demographics.js';
	import {
		CalendarDays,
		CircleCheck,
		GraduationCap,
		Mail,
		MapPin,
		Phone,
		ShieldCheck,
		UserRound
	} from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const profile = $derived(data.profile);
	const enrollment = $derived(profile.student?.enrollment);
	const initials = $derived(
		profile.name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((name) => name.charAt(0))
			.join('')
			.toUpperCase() || 'U'
	);
	const roleLabel = $derived(
		profile.role === 'admin'
			? 'Administrator'
			: profile.role === 'registrar'
				? 'Registrar'
				: 'Student'
	);
	const formatter = new Intl.DateTimeFormat('en-PH', {
		timeZone: 'Asia/Manila',
		dateStyle: 'medium'
	});
</script>

<svelte:head><title>My profile | BPC Enrollment System</title></svelte:head>

<div class="w-full space-y-6">
	<header class="portal-page-header">
		<div class="h-1 bg-primary" aria-hidden="true"></div>
		<div class="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
			<div class="flex min-w-0 items-center gap-4 sm:gap-5">
				{#if profile.image}
					<img
						src={profile.image}
						alt={profile.name}
						class="size-16 shrink-0 rounded-2xl border border-base-300 object-cover sm:size-20"
					/>
				{:else}
					<span
						class="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-primary/10 bg-primary/10 text-2xl font-bold text-primary sm:size-20 sm:text-3xl"
						aria-hidden="true"
					>
						{initials}
					</span>
				{/if}
				<div class="min-w-0">
					<h1 class="text-2xl font-bold tracking-tight wrap-anywhere sm:text-3xl">
						{profile.name}
					</h1>
					<p class="mt-1 text-sm wrap-anywhere text-base-content/60">{profile.email}</p>
					{#if profile.student}
						<p class="mt-2 font-mono text-xs text-base-content/55">{profile.student.studentId}</p>
					{/if}
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-2 sm:shrink-0">
				<span class="badge gap-1.5 border-primary/15 bg-primary/5 text-primary">
					<UserRound class="size-3.5" aria-hidden="true" />{roleLabel}
				</span>
				<span
					class={`badge gap-1.5 ${profile.setupComplete ? 'border-success/30 bg-success/15 text-base-content' : 'border-warning/50 bg-warning/20 text-base-content'}`}
				>
					{#if profile.setupComplete}
						<CircleCheck class="size-3.5" aria-hidden="true" />
					{/if}
					{profile.setupComplete ? 'Account setup complete' : 'Account setup required'}
				</span>
			</div>
		</div>
	</header>

	<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
		<section class="portal-panel min-w-0 p-5 shadow-sm sm:p-6" aria-labelledby="personal-heading">
			<h2 id="personal-heading" class="flex items-center gap-2 text-lg font-bold">
				<UserRound class="size-5 text-primary" aria-hidden="true" />Personal information
			</h2>
			<p class="mt-1 text-xs text-base-content/60">Your name and contact details on record.</p>
			<dl class="mt-6 grid gap-x-6 gap-y-6 text-sm sm:grid-cols-2">
				<div>
					<dt class="text-xs text-base-content/55">Full name</dt>
					<dd class="mt-2 font-semibold wrap-anywhere">{profile.name}</dd>
				</div>
				<div>
					<dt class="flex items-center gap-1.5 text-xs text-base-content/55">
						<Phone class="size-3.5" aria-hidden="true" />Contact number
					</dt>
					<dd class="mt-2 font-semibold">{profile.contactNumber || 'Not recorded'}</dd>
				</div>
				{#if profile.student}
					<div>
						<dt class="text-xs text-base-content/55">Birth date</dt>
						<dd class="mt-2 font-semibold">{formatBirthDate(profile.birthDate)}</dd>
					</div>
					<div>
						<dt class="text-xs text-base-content/55">Sex</dt>
						<dd class="mt-2 font-semibold">{formatStudentSex(profile.sex)}</dd>
					</div>
				{/if}
				<div class="sm:col-span-2">
					<dt class="flex items-center gap-1.5 text-xs text-base-content/55">
						<Mail class="size-3.5" aria-hidden="true" />Email address
					</dt>
					<dd class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
						<span class="min-w-0 font-semibold wrap-anywhere">{profile.email}</span>
						<span
							class={`badge badge-sm ${profile.emailVerified ? 'border-success/30 bg-success/15 text-base-content' : 'border-base-300 bg-base-200 text-base-content/65'}`}
						>
							{profile.emailVerified ? 'Verified' : 'Not verified'}
						</span>
					</dd>
				</div>
				<div class="border-t border-base-300 pt-5 sm:col-span-2">
					<dt class="flex items-center gap-1.5 text-xs text-base-content/55">
						<MapPin class="size-3.5" aria-hidden="true" />Address
					</dt>
					<dd class="mt-2 leading-relaxed font-semibold wrap-anywhere whitespace-pre-line">
						{profile.address || 'Not recorded'}
					</dd>
				</div>
			</dl>
		</section>

		<section class="portal-panel p-5 shadow-sm sm:p-6" aria-labelledby="account-heading">
			<h2 id="account-heading" class="flex items-center gap-2 text-lg font-bold">
				<ShieldCheck class="size-5 text-primary" aria-hidden="true" />Account details
			</h2>
			<p class="mt-1 text-xs text-base-content/60">
				Your account role and registration information.
			</p>
			<dl class="mt-6 divide-y divide-base-300 text-sm">
				<div class="flex flex-wrap items-center justify-between gap-2 pb-4">
					<dt class="text-base-content/60">Account role</dt>
					<dd class="font-semibold">{roleLabel}</dd>
				</div>
				<div class="flex flex-wrap items-center justify-between gap-2 py-4">
					<dt class="flex items-center gap-1.5 text-base-content/60">
						<CalendarDays class="size-3.5" aria-hidden="true" />Date joined
					</dt>
					<dd class="font-semibold">{formatter.format(profile.createdAt)}</dd>
				</div>
				<div class="flex flex-wrap items-center justify-between gap-2 pt-4">
					<dt class="text-base-content/60">Last updated</dt>
					<dd class="font-semibold">{formatter.format(profile.updatedAt)}</dd>
				</div>
			</dl>
		</section>
	</div>

	{#if profile.student}
		<section class="portal-panel overflow-hidden" aria-labelledby="student-heading">
			<header
				class="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 p-5 sm:px-6"
			>
				<div>
					<h2 id="student-heading" class="flex items-center gap-2 text-lg font-bold">
						<GraduationCap class="size-5 text-primary" aria-hidden="true" />Student information
					</h2>
					<p class="mt-1 text-xs text-base-content/60">
						Your student number and current enrollment.
					</p>
				</div>
				{#if enrollment}
					<span class="badge badge-outline capitalize">{enrollment.status}</span>
				{/if}
			</header>
			<dl class="grid gap-6 p-5 text-sm sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
				<div>
					<dt class="text-xs text-base-content/55">Student number</dt>
					<dd class="mt-2 font-mono font-semibold">{profile.student.studentId}</dd>
				</div>
				{#if enrollment}
					<div class="sm:col-span-2">
						<dt class="text-xs text-base-content/55">Program</dt>
						<dd class="mt-2 font-semibold">
							{enrollment.curriculum.programCode}{enrollment.curriculum.program
								? ` — ${enrollment.curriculum.program.name}`
								: ''}
						</dd>
					</div>
					{#each [['School year', `${enrollment.schoolYearStart}–${enrollment.schoolYearStart + 1}`], ['Semester', String(enrollment.semester)], ['Year level / section', `Year ${enrollment.yearLevel} · Section ${enrollment.section}`]] as [label, value] (label)}
						<div>
							<dt class="text-xs text-base-content/55">{label}</dt>
							<dd class="mt-2 font-semibold">{value}</dd>
						</div>
					{/each}
				{:else}
					<div class="sm:col-span-2">
						<dt class="text-xs text-base-content/55">Current enrollment</dt>
						<dd class="mt-2 text-base-content/60">No current enrollment assigned.</dd>
					</div>
				{/if}
			</dl>
		</section>
	{/if}
</div>
