<script lang="ts">
	import type { StaffDashboardData } from '#lib/server/staff-dashboard.js';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import {
		ArrowDownLeft,
		ArrowRight,
		ArrowUpRight,
		BookOpen,
		CalendarDays,
		Check,
		ChevronRight,
		CircleCheck,
		ClipboardCheck,
		GraduationCap,
		Layers,
		ListChecks,
		Mail,
		ShieldCheck,
		Sparkles,
		UserPlus,
		Users,
		UserShield
	} from '@lucide/svelte';
	import StudentDialog from '../../../../routes/user/students/StudentDialog.svelte';

	let { data, name }: { data: StaffDashboardData; name: string } = $props();
	let studentDialog = $state<StudentDialog>();
	const isAdmin = $derived(data.admin !== null);
	const overview = $derived(data.overview);
	const firstName = $derived(name.trim().split(/\s+/)[0] || 'there');
	const number = new Intl.NumberFormat('en-PH');
	const dateFormatter = new Intl.DateTimeFormat('en-PH', {
		timeZone: 'Asia/Manila',
		dateStyle: 'medium'
	});
	const date = (value: Date | null) => (value ? dateFormatter.format(value) : 'Not recorded');
	const studentLink = (userId: string) => resolve('/user/students/[userId]', { userId });
	const enrollmentLink = (row: { userId: string; enrollmentId: string | null }) =>
		row.enrollmentId
			? resolve('/user/students/[userId]/enrollments/[enrollmentId]', {
					userId: row.userId,
					enrollmentId: row.enrollmentId
				})
			: studentLink(row.userId);
	const stats = $derived(
		isAdmin
			? [
					{
						label: 'Total students',
						value: overview.totalStudents,
						detail: `${number.format(overview.withoutEnrollment)} without an enrollment`,
						icon: Users,
						color: 'bg-primary/10 text-primary',
						href: resolve('/user/students')
					},
					{
						label: 'Actively enrolled',
						value: overview.activeStudents,
						detail: 'Current enrollment is active',
						icon: GraduationCap,
						color: 'bg-info/10 text-info',
						href: resolve('/user/students')
					},
					{
						label: 'Grades to finalize',
						value: overview.awaitingGrades,
						detail: 'Active students with setup complete',
						icon: ClipboardCheck,
						color: 'bg-warning/15 text-warning',
						href: '#worklist'
					},
					{
						label: 'Ready for next term',
						value: overview.readyForNextTerm,
						detail: 'Grades, clearance & required follow-up complete',
						icon: CircleCheck,
						color: 'bg-success/10 text-success',
						href: '#worklist'
					}
				]
			: [
					{
						label: 'Actively enrolled',
						value: overview.activeStudents,
						detail: `${number.format(overview.totalStudents)} student accounts overall`,
						icon: GraduationCap,
						color: 'bg-primary/10 text-primary',
						href: resolve('/user/students')
					},
					{
						label: 'Grades to finalize',
						value: overview.awaitingGrades,
						detail: 'Active students with setup complete',
						icon: ClipboardCheck,
						color: 'bg-warning/15 text-warning',
						href: '#worklist'
					},
					{
						label: 'Clearance to verify',
						value: overview.awaitingClearance,
						detail: 'Finalized grades · awaiting clearance',
						icon: ShieldCheck,
						color: 'bg-info/10 text-info',
						href: '#worklist'
					},
					{
						label: 'Academic follow-ups',
						value: data.followUpCount.total,
						detail: `${number.format(data.followUpCount.sent)} meeting requests awaiting closure`,
						icon: Mail,
						color: 'bg-secondary/10 text-secondary',
						href: '#worklist'
					}
				]
	);
	type Queue = keyof StaffDashboardData['queues'];
	let selectedQueue = $state<Queue>(
		untrack(() =>
			data.overview.awaitingGrades
				? 'grades'
				: data.overview.awaitingClearance
					? 'clearance'
					: data.followUpCount.total
						? 'followUp'
						: data.overview.setupPending
							? 'setup'
							: data.overview.readyForNextTerm
								? 'ready'
								: 'grades'
		)
	);
	const tabs = $derived([
		{
			key: 'grades' as const,
			label: 'Grades',
			count: overview.awaitingGrades,
			icon: ClipboardCheck
		},
		{
			key: 'clearance' as const,
			label: 'Clearance',
			count: overview.awaitingClearance,
			icon: ShieldCheck
		},
		{ key: 'followUp' as const, label: 'Follow-ups', count: data.followUpCount.total, icon: Mail },
		{
			key: 'setup' as const,
			label: 'Account setup',
			count: overview.setupPending,
			icon: UserShield
		},
		{
			key: 'ready' as const,
			label: 'Next term',
			count: overview.readyForNextTerm,
			icon: ArrowRight
		}
	]);
	const queue = $derived(data.queues[selectedQueue]);
	const activeTab = $derived(tabs.find((tab) => tab.key === selectedQueue)!);
	const queueDescription = $derived(
		{
			grades:
				'Current enrollments ready for grade entry or finalization. Account setup is complete.',
			clearance: 'Grades are released. Verify submitted clearance to complete these enrollments.',
			followUp:
				'Finalized failing or INC grades with an open follow-up. Includes historical terms.',
			setup:
				'These students need to finish account setup before staff can edit or finalize grades.',
			ready:
				'Grades and clearance are complete, including any required Registrar meeting for failed grades. Review each student before enrolling them for the next term.'
		}[selectedQueue]
	);
	const trendTotal = $derived(data.trend.reduce((sum, entry) => sum + entry.total, 0));
	const trendMax = $derived(Math.max(1, ...data.trend.map((entry) => entry.total)));
	const currentMonth = $derived(data.trend[data.trend.length - 1]);
	const previousMonth = $derived(data.trend[data.trend.length - 2]);
	const monthDifference = $derived(currentMonth.total - previousMonth.total);
	const programMax = $derived(Math.max(1, ...data.programs.map((entry) => entry.students)));
	const visiblePrograms = $derived(data.programs.slice(0, 5));
	const otherProgramStudents = $derived(
		data.programs.slice(5).reduce((sum, entry) => sum + entry.students, 0)
	);
	const enrollmentMix = $derived([
		{ label: 'Enrolled', value: overview.activeStudents, color: 'bg-primary' },
		{ label: 'Completed', value: overview.completedStudents, color: 'bg-success' },
		{ label: 'Dropped', value: overview.droppedStudents, color: 'bg-warning' },
		{ label: 'No enrollment', value: overview.withoutEnrollment, color: 'bg-base-300' }
	]);
	const percentage = (value: number) =>
		overview.totalStudents ? (value / overview.totalStudents) * 100 : 0;
	const enrolledEnd = $derived(percentage(overview.activeStudents));
	const completedEnd = $derived(enrolledEnd + percentage(overview.completedStudents));
	const droppedEnd = $derived(completedEnd + percentage(overview.droppedStudents));
	const resultsTotal = $derived(
		data.gradeResults.passed + data.gradeResults.failed + data.gradeResults.incomplete
	);
	const gradeResults = $derived([
		{ label: 'Passed', value: data.gradeResults.passed, color: 'bg-success', detail: '1.00–3.00' },
		{ label: 'Failed', value: data.gradeResults.failed, color: 'bg-error', detail: 'Above 3.00' },
		{ label: 'Incomplete', value: data.gradeResults.incomplete, color: 'bg-warning', detail: 'INC' }
	]);
</script>

<svelte:head>
	<title>{isAdmin ? 'Admin' : 'Registrar'} dashboard | BPC Enrollment System</title>
</svelte:head>

<div class="w-full space-y-6">
	<header class="portal-panel relative overflow-hidden">
		<div class="h-1 bg-primary" aria-hidden="true"></div>
		<div
			class="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-primary/5"
			aria-hidden="true"
		></div>
		<div
			class="relative flex flex-col justify-between gap-6 p-5 sm:p-7 lg:flex-row lg:items-center"
		>
			<div>
				<p
					class="mb-3 flex items-center gap-2 text-xs font-bold tracking-widest text-primary uppercase"
				>
					<Layers class="size-4" aria-hidden="true" />{isAdmin
						? 'Administration overview'
						: 'Registrar’s workspace'}
				</p>
				<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Welcome back, {firstName}.</h1>
				<p class="mt-2 max-w-xl text-sm leading-relaxed text-base-content/60">
					{isAdmin
						? 'A clear view of your students, enrollment activity, and the work that keeps everything moving.'
						: 'From enrollment to clearance, see what needs your attention and pick up where you left off.'}
				</p>
				<p class="mt-4 flex items-center gap-2 text-xs text-base-content/55">
					<CalendarDays class="size-3.5" aria-hidden="true" />{date(data.generatedAt)}
					<span class="mx-1 text-base-content/20">/</span>
					Live overview · all terms
				</p>
			</div>
			<div class="flex shrink-0 flex-wrap items-center gap-2">
				<a class="btn gap-2 border-base-300 btn-outline btn-sm" href={resolve('/user/students')}>
					View students<ArrowUpRight class="size-4" aria-hidden="true" />
				</a>
				<button
					type="button"
					class="btn gap-2 btn-primary btn-sm"
					onclick={() => studentDialog?.open()}
				>
					<UserPlus class="size-4" aria-hidden="true" />Create student
				</button>
			</div>
		</div>
	</header>

	<section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Enrollment overview">
		{#each stats as stat (stat.label)}
			<a
				href={stat.href}
				onclick={() => {
					if (stat.label === 'Grades to finalize') selectedQueue = 'grades';
					if (stat.label === 'Clearance to verify') selectedQueue = 'clearance';
					if (stat.label === 'Academic follow-ups') selectedQueue = 'followUp';
					if (stat.label === 'Ready for next term') selectedQueue = 'ready';
				}}
				class="group portal-panel p-5 shadow-sm transition-colors hover:border-primary/40"
			>
				<div class="flex items-center justify-between gap-3">
					<span class="grid size-10 place-items-center rounded-xl {stat.color}">
						<stat.icon class="size-5" aria-hidden="true" />
					</span>
					<ArrowUpRight
						class="size-4 text-base-content/25 transition-colors group-hover:text-primary"
						aria-hidden="true"
					/>
				</div>
				<p class="mt-5 text-sm font-medium text-base-content/60">{stat.label}</p>
				<p class="mt-1 text-3xl font-bold tracking-tight tabular-nums">
					{number.format(stat.value)}
				</p>
				<p class="mt-2 text-xs leading-relaxed text-base-content/50">{stat.detail}</p>
			</a>
		{/each}
	</section>

	<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
		<div class="min-w-0 space-y-6">
			<section
				id="worklist"
				class="portal-panel scroll-mt-6 overflow-hidden"
				aria-labelledby="worklist-title"
			>
				<div class="flex flex-wrap items-center justify-between gap-3 p-5 pb-4 sm:px-6">
					<div>
						<p class="mb-1 text-[11px] font-bold tracking-widest text-primary uppercase">
							Your next steps
						</p>
						<h2 id="worklist-title" class="flex items-center gap-2 text-lg font-bold">
							<ListChecks class="size-5 text-primary" aria-hidden="true" />Enrollment worklist
						</h2>
					</div>
					<span class="rounded-full bg-base-200 px-3 py-1 text-xs font-medium text-base-content/60">
						{number.format(activeTab.count)}
						{selectedQueue === 'followUp' ? 'enrollments' : 'students'}
					</span>
				</div>
				<div
					class="flex flex-wrap gap-1 border-b border-base-300 px-5 pb-3 sm:px-6"
					role="group"
					aria-label="Worklist category"
				>
					{#each tabs as tab (tab.key)}
						<button
							type="button"
							aria-pressed={selectedQueue === tab.key}
							onclick={() => (selectedQueue = tab.key)}
							class="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors {selectedQueue ===
							tab.key
								? 'bg-primary text-primary-content'
								: 'text-base-content/55 hover:bg-base-200'}"
						>
							<tab.icon class="size-3.5" aria-hidden="true" />{tab.label}
							<span
								class="rounded px-1.5 py-0.5 text-[10px] tabular-nums {selectedQueue === tab.key
									? 'bg-primary-content/15'
									: 'bg-base-200'}"
							>
								{number.format(tab.count)}
							</span>
						</button>
					{/each}
				</div>
				<p
					class="border-b border-base-200 bg-base-200/35 px-5 py-3 text-xs leading-relaxed text-base-content/60 sm:px-6"
				>
					{queueDescription}
				</p>
				{#if queue.length}
					<div class="overflow-x-auto">
						<table class="table w-full min-w-[560px] text-sm">
							<caption class="sr-only">
								{activeTab.label} worklist; showing {queue.length} of {activeTab.count}
							</caption>
							<thead>
								<tr
									class="border-base-200 text-[10px] tracking-wider text-base-content/45 uppercase"
								>
									<th class="pl-5 sm:pl-6">Student</th>
									<th>Enrollment</th>
									<th class="pr-5 text-right sm:pr-6">Next action</th>
								</tr>
							</thead>
							<tbody>
								{#each queue as row (`${row.userId}:${row.enrollmentId}`)}
									<tr class="border-base-200 last:border-0 hover:bg-base-200/35">
										<td class="py-4 pl-5 sm:pl-6">
											<a href={studentLink(row.userId)} class="font-semibold hover:text-primary">
												{row.name}
											</a>
											<p class="mt-1 font-mono text-[11px] text-base-content/45">
												{row.studentId ?? 'Student record unavailable'}
											</p>
										</td>
										<td>
											<p class="text-xs font-semibold">
												{row.programCode ?? 'Not enrolled'}{#if row.yearLevel}
													<span class="font-normal text-base-content/40">·</span>
													{row.yearLevel}{row.section}
												{/if}
											</p>
											<p class="mt-1 text-[11px] text-base-content/45">
												{row.schoolYearStart
													? `SY ${row.schoolYearStart}–${row.schoolYearStart + 1} · Sem ${row.semester}`
													: 'No academic details yet'}
											</p>
										</td>
										<td class="pr-5 text-right sm:pr-6">
											<a
												class="inline-flex items-center justify-end gap-1 text-xs font-semibold text-primary hover:underline"
												href={selectedQueue === 'setup' || selectedQueue === 'ready'
													? studentLink(row.userId)
													: enrollmentLink(row)}
											>
												{selectedQueue === 'grades'
													? 'Review grades'
													: selectedQueue === 'clearance'
														? 'Verify clearance'
														: selectedQueue === 'followUp'
															? 'sentAt' in row && row.sentAt
																? 'Review follow-up'
																: 'Request meeting'
															: selectedQueue === 'ready'
																? 'Review student'
																: 'View account'}<ChevronRight
													class="size-3.5 shrink-0"
													aria-hidden="true"
												/>
											</a>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<p class="border-t border-base-200 px-5 py-3 text-[11px] text-base-content/45 sm:px-6">
						Showing {queue.length} of {number.format(activeTab.count)} · Oldest terms first
					</p>
				{:else}
					<div class="px-6 py-12 text-center" role="status">
						<span
							class="mx-auto grid size-12 place-items-center rounded-2xl bg-success/10 text-success"
						>
							<Check class="size-6" aria-hidden="true" />
						</span>
						<h3 class="mt-4 text-sm font-semibold">Nothing waiting here</h3>
						<p class="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-base-content/50">
							No records currently match this worklist. Select another category to review more work.
						</p>
					</div>
				{/if}
			</section>

			<section class="portal-panel p-5 shadow-sm sm:p-6" aria-labelledby="activity-title">
				<div class="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h2 id="activity-title" class="text-lg font-bold">Enrollment activity</h2>
						<p class="mt-1 text-xs text-base-content/50">
							New enrollment records · last six months
						</p>
					</div>
					<span class="rounded-lg bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">
						{number.format(trendTotal)} total
					</span>
				</div>
				<div class="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
					<span class="text-3xl font-bold tracking-tight tabular-nums">
						{number.format(currentMonth.total)}
					</span>
					<span class="text-xs text-base-content/50">in {currentMonth.fullLabel}</span>
					<span class="flex items-center gap-1 text-[11px] text-base-content/50">
						{#if monthDifference >= 0}
							<ArrowUpRight class="size-3" aria-hidden="true" />
						{:else}
							<ArrowDownLeft class="size-3" aria-hidden="true" />
						{/if}
						{Math.abs(monthDifference)}
						{monthDifference >= 0 ? 'more' : 'fewer'} than {previousMonth.label}
						<span class="text-base-content/35">(month to date)</span>
					</span>
				</div>
				<div class="relative mt-6">
					<div
						class="pointer-events-none absolute inset-x-0 top-0 flex h-40 flex-col justify-between"
						aria-hidden="true"
					>
						{#each [0, 1, 2] as line (line)}
							<div class="border-t border-dashed border-base-300"></div>
						{/each}
					</div>
					<div
						class="relative grid grid-cols-6 gap-3 sm:gap-5"
						role="img"
						aria-label={`Monthly enrollment records: ${data.trend.map((entry) => `${entry.fullLabel}: ${entry.total}`).join('; ')}`}
					>
						{#each data.trend as entry, index (entry.key)}
							<div class="min-w-0 text-center">
								<div class="flex h-40 items-end justify-center">
									<div
										class="group relative w-full max-w-14 rounded-t-lg {index === 5
											? 'bg-primary'
											: 'bg-primary/25'} transition-colors hover:bg-primary/70"
										style:height={`${entry.total ? Math.max(5, (entry.total / trendMax) * 85) : 0}%`}
										title={`${entry.fullLabel}: ${number.format(entry.total)} enrollment records`}
									>
										<span
											class="absolute inset-x-0 -top-5 text-[11px] font-semibold text-base-content/65 tabular-nums"
										>
											{entry.total}
										</span>
									</div>
								</div>
								<p
									class="mt-3 text-[11px] {index === 5
										? 'font-bold text-primary'
										: 'text-base-content/50'}"
								>
									{entry.label}
								</p>
							</div>
						{/each}
					</div>
				</div>
				<p class="mt-5 text-[11px] leading-relaxed text-base-content/45">
					Counts enrollment creations, including records later completed or dropped. Manila time;
					records without a date are excluded.
				</p>
			</section>

			<section class="portal-panel overflow-hidden" aria-labelledby="recent-title">
				<div class="flex items-center justify-between gap-3 p-5 sm:px-6">
					<div>
						<h2 id="recent-title" class="text-lg font-bold">Recent enrollments</h2>
						<p class="mt-1 text-xs text-base-content/50">
							The latest six records across all programs
						</p>
					</div>
					<a
						href={resolve('/user/students')}
						class="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
					>
						Students<ArrowUpRight class="size-3.5" aria-hidden="true" />
					</a>
				</div>
				{#if data.recentEnrollments.length}
					<div class="overflow-x-auto">
						<table class="table min-w-[580px]">
							<thead>
								<tr
									class="border-base-200 bg-base-200/35 text-[10px] tracking-wider text-base-content/45 uppercase"
								>
									<th class="pl-5 sm:pl-6">Student / program</th>
									<th>Academic term</th>
									<th>Status</th>
									<th class="pr-5 text-right sm:pr-6">Enrolled</th>
								</tr>
							</thead>
							<tbody>
								{#each data.recentEnrollments as row (row.enrollmentId)}
									<tr class="border-base-200 last:border-0 hover:bg-base-200/35">
										<td class="py-4 pl-5 sm:pl-6">
											<a
												href={enrollmentLink(row)}
												class="text-xs font-semibold hover:text-primary"
											>
												{row.name}
											</a>
											<p class="mt-1 text-[11px] text-base-content/45">
												{row.programCode} · Year {row.yearLevel} · {row.section}
											</p>
										</td>
										<td class="text-xs text-base-content/60">
											{row.schoolYearStart}–{row.schoolYearStart + 1}
											<p class="mt-1 text-[11px] text-base-content/45">Semester {row.semester}</p>
										</td>
										<td>
											<span
												class="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold capitalize {row.status ===
												'enrolled'
													? 'bg-primary/10 text-primary'
													: row.status === 'completed'
														? 'bg-success/15 text-base-content/75'
														: 'bg-warning/15 text-base-content/75'}"
											>
												<span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
												{row.status}
											</span>
										</td>
										<td
											class="pr-5 text-right text-[11px] whitespace-nowrap text-base-content/50 sm:pr-6"
										>
											{date(row.enrolledAt)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div class="border-t border-base-200 px-6 py-10 text-center">
						<GraduationCap class="mx-auto size-8 text-primary/40" aria-hidden="true" />
						<p class="mt-3 text-sm font-semibold">Your first enrollment starts here</p>
						<p class="mt-2 text-xs text-base-content/50">
							Create a student or open an existing student record to begin.
						</p>
					</div>
				{/if}
			</section>
		</div>

		<aside class="min-w-0 space-y-6" aria-label="Enrollment insights">
			<section class="portal-panel p-5 shadow-sm sm:p-6" aria-labelledby="mix-title">
				<h2 id="mix-title" class="font-bold">Student enrollment mix</h2>
				<p class="mt-1 text-xs text-base-content/50">One linked current record per student</p>
				<div
					class="relative mx-auto my-6 grid size-40 place-items-center rounded-full"
					style:background={overview.totalStudents
						? `conic-gradient(var(--color-primary) 0% ${enrolledEnd}%, var(--color-success) ${enrolledEnd}% ${completedEnd}%, var(--color-warning) ${completedEnd}% ${droppedEnd}%, var(--color-base-300) ${droppedEnd}% 100%)`
						: 'var(--color-base-300)'}
					role="img"
					aria-label={enrollmentMix.map((entry) => `${entry.label}: ${entry.value}`).join('; ')}
				>
					<div class="grid size-29 place-content-center rounded-full bg-base-100 text-center">
						<span class="text-3xl font-bold tracking-tight tabular-nums">
							{number.format(overview.totalStudents)}
						</span>
						<span class="mt-1 text-[11px] text-base-content/50">students</span>
					</div>
				</div>
				<div class="space-y-3">
					{#each enrollmentMix as item (item.label)}
						<div class="flex items-center justify-between gap-2 text-xs">
							<span class="flex items-center gap-2 text-base-content/60">
								<span class="size-2 rounded-full {item.color}" aria-hidden="true"></span>
								{item.label}
							</span>
							<span class="font-semibold tabular-nums">
								{number.format(item.value)}
								<span class="ml-2 inline-block w-9 text-right font-normal text-base-content/40">
									{percentage(item.value).toFixed(0)}%
								</span>
							</span>
						</div>
					{/each}
				</div>
			</section>

			<section class="portal-panel p-5 shadow-sm sm:p-6" aria-labelledby="programs-title">
				<div class="flex items-center justify-between gap-2">
					<h2 id="programs-title" class="font-bold">Students by program</h2>
					<BookOpen class="size-4 text-primary/50" aria-hidden="true" />
				</div>
				<p class="mt-1 text-xs text-base-content/50">Active current enrollments · top five</p>
				<div class="mt-6 space-y-5">
					{#each visiblePrograms as entry (entry.code)}
						<a
							href={`${resolve('/user/students')}?${new URLSearchParams({ 'filter.programCode': entry.code })}`}
							class="group block"
							title={entry.name}
						>
							<div class="mb-2 flex items-center justify-between gap-3 text-xs">
								<span class="truncate font-semibold group-hover:text-primary">{entry.code}</span>
								<span class="text-base-content/60 tabular-nums">
									{number.format(entry.students)}
								</span>
							</div>
							<div class="h-1.5 overflow-hidden rounded-full bg-base-200">
								<div
									class="h-full rounded-full bg-primary/65 transition-colors group-hover:bg-primary"
									style:width={`${(entry.students / programMax) * 100}%`}
								></div>
							</div>
							<p class="mt-1.5 truncate text-[10px] text-base-content/40">{entry.name}</p>
						</a>
					{:else}
						<p class="py-3 text-xs leading-relaxed text-base-content/50">
							No programs yet. An administrator can create programs and activate curricula to get
							enrollment started.
						</p>
					{/each}
				</div>
				{#if otherProgramStudents}
					<p class="mt-4 text-[11px] text-base-content/45">
						+{number.format(otherProgramStudents)} active students across other programs
					</p>
				{/if}
				<a
					class="mt-5 flex items-center justify-between border-t border-base-200 pt-4 text-xs font-semibold text-primary hover:underline"
					href={resolve('/user/programs')}
				>
					View all programs<ArrowRight class="size-3.5" aria-hidden="true" />
				</a>
			</section>

			<section class="portal-panel p-5 shadow-sm sm:p-6" aria-labelledby="results-title">
				<h2 id="results-title" class="font-bold">Released grade outcomes</h2>
				<p class="mt-1 text-xs leading-relaxed text-base-content/50">
					Subjects in current, finalized, non-dropped enrollments
				</p>
				{#if resultsTotal}
					<div
						class="mt-5 flex h-2 overflow-hidden rounded-full bg-base-200"
						role="img"
						aria-label={gradeResults.map((item) => `${item.label}: ${item.value}`).join('; ')}
					>
						{#each gradeResults as item (item.label)}
							<div class={item.color} style:width={`${(item.value / resultsTotal) * 100}%`}></div>
						{/each}
					</div>
				{/if}
				<div class="mt-4 space-y-3">
					{#each gradeResults as item (item.label)}
						<div class="flex items-center justify-between text-xs">
							<span class="flex items-center gap-2 text-base-content/60">
								<span class="size-2 rounded-full {item.color}" aria-hidden="true"></span>
								{item.label}
								<span class="text-[10px] text-base-content/35">{item.detail}</span>
							</span>
							<span class="font-semibold tabular-nums">{number.format(item.value)}</span>
						</div>
					{/each}
				</div>
				{#if !resultsTotal}
					<p
						class="mt-4 border-t border-base-200 pt-3 text-[11px] leading-relaxed text-base-content/45"
					>
						Outcomes appear once subject grades are finalized.
					</p>
				{/if}
			</section>
		</aside>
	</div>

	{#if data.admin}
		<section aria-labelledby="health-title" class="space-y-4">
			<div class="flex items-center gap-2">
				<ShieldCheck class="size-5 text-primary" aria-hidden="true" />
				<h2 id="health-title" class="text-lg font-bold">Administration at a glance</h2>
			</div>
			<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<a
					href={resolve('/user/registrars')}
					class="portal-panel p-5 shadow-sm transition-colors hover:border-primary/40"
				>
					<div class="flex items-center justify-between">
						<UserShield class="size-5 text-primary" aria-hidden="true" /><ArrowUpRight
							class="size-4 text-base-content/30"
							aria-hidden="true"
						/>
					</div>
					<p class="mt-4 text-2xl font-bold tabular-nums">
						{number.format(data.admin.registrars.total)}
						<span class="text-sm font-medium text-base-content/60">registrars</span>
					</p>
					<p class="mt-2 text-xs text-base-content/50">
						{data.admin.registrars.setupPending
							? `${data.admin.registrars.setupPending} still need account setup`
							: 'All registrar accounts set up'}
					</p>
				</a>
				<a
					href={resolve('/user/programs')}
					class="portal-panel p-5 shadow-sm transition-colors hover:border-primary/40"
				>
					<div class="flex items-center justify-between">
						<GraduationCap class="size-5 text-primary" aria-hidden="true" /><ArrowUpRight
							class="size-4 text-base-content/30"
							aria-hidden="true"
						/>
					</div>
					<p class="mt-4 text-2xl font-bold tabular-nums">
						{number.format(data.admin.programs.active)}
						<span class="text-sm font-medium text-base-content/60">active programs</span>
					</p>
					<p
						class="mt-2 text-xs {data.admin.programs.missingCurriculum
							? 'font-medium text-error'
							: 'text-base-content/50'}"
					>
						{data.admin.programs.missingCurriculum
							? `${data.admin.programs.missingCurriculum} need an available active curriculum`
							: `${data.admin.programs.total} programs in the catalog`}
					</p>
				</a>
				<a
					href={resolve('/user/curriculum')}
					class="portal-panel p-5 shadow-sm transition-colors hover:border-primary/40"
				>
					<div class="flex items-center justify-between">
						<Layers class="size-5 text-primary" aria-hidden="true" /><ArrowUpRight
							class="size-4 text-base-content/30"
							aria-hidden="true"
						/>
					</div>
					<p class="mt-4 text-2xl font-bold tabular-nums">
						{number.format(data.admin.curricula.total)}
						<span class="text-sm font-medium text-base-content/60">curricula</span>
					</p>
					<p class="mt-2 text-xs text-base-content/50">
						{data.admin.curricula.drafts} unarchived drafts to review
					</p>
				</a>
				<a
					href={resolve('/user/subjects')}
					class="portal-panel p-5 shadow-sm transition-colors hover:border-primary/40"
				>
					<div class="flex items-center justify-between">
						<BookOpen class="size-5 text-primary" aria-hidden="true" /><ArrowUpRight
							class="size-4 text-base-content/30"
							aria-hidden="true"
						/>
					</div>
					<p class="mt-4 text-2xl font-bold tabular-nums">
						{number.format(data.admin.subjects.active)}
						<span class="text-sm font-medium text-base-content/60">active subjects</span>
					</p>
					<p class="mt-2 text-xs text-base-content/50">
						{data.admin.subjects.total} subjects in the catalog
					</p>
				</a>
			</div>
		</section>
	{:else}
		<section
			class="flex flex-col justify-between gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:flex-row sm:items-center sm:p-6"
			aria-labelledby="ready-title"
		>
			<div class="flex items-start gap-3">
				<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-base-100 text-primary">
					<Sparkles class="size-5" aria-hidden="true" />
				</span>
				<div>
					<h2 id="ready-title" class="font-bold">
						{overview.readyForNextTerm
							? `${number.format(overview.readyForNextTerm)} students ready for their next term`
							: 'Keep the next term moving'}
					</h2>
					<p class="mt-1 text-xs leading-relaxed text-base-content/60">
						{overview.readyForNextTerm
							? 'Grades, clearance, and required Registrar follow-ups are complete. Review academic concerns before reenrolling.'
							: 'Students appear here after grades, clearance, and any required Registrar meeting for failed grades are complete.'}
					</p>
				</div>
			</div>
			<a
				href="#worklist"
				onclick={() => (selectedQueue = 'ready')}
				class="inline-flex shrink-0 items-center gap-2 text-xs font-bold text-primary hover:underline"
			>
				Review next term<ArrowRight class="size-4" aria-hidden="true" />
			</a>
		</section>
	{/if}
</div>

<StudentDialog bind:this={studentDialog} />
