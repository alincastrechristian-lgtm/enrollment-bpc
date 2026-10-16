<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		ArrowRight,
		Bell,
		BellRing,
		BookOpen,
		CalendarClock,
		Check,
		CheckCheck,
		CircleAlert,
		CircleCheck,
		Clock3,
		GraduationCap,
		Info,
		ShieldCheck
	} from '@lucide/svelte';

	import type { StudentDashboardData } from '#lib/server/student-dashboard.js';

	let { data }: { data: StudentDashboardData } = $props();
	const semester = $derived(data.enrollment);
	const subjects = $derived(data.subjects);
	const passedCount = $derived(data.passedCount);
	const attentionCount = $derived(data.attentionCount);
	const totalUnits = $derived(data.totalUnits);
	const dateFormatter = new Intl.DateTimeFormat('en-PH', {
		timeZone: 'Asia/Manila',
		dateStyle: 'medium'
	});

	// Notifications remain sample data until the notification system is implemented.
	let notifications = $state([
		{
			id: 'grades',
			title: 'Your grades have been finalized',
			message: 'Final grades for the 1st Semester are now available in your enrollment record.',
			time: 'Today · 9:30 AM',
			kind: 'grades',
			unread: true
		},
		{
			id: 'failed',
			title: 'A subject needs your attention',
			message:
				'IS102 received a failing grade. Contact the Registrar’s Office to discuss your next steps.',
			time: 'Today · 9:30 AM',
			kind: 'failed',
			unread: true
		},
		{
			id: 'incomplete',
			title: 'Incomplete grade in GE103',
			message:
				'Your grade is marked INC. Check with your instructor about outstanding requirements.',
			time: 'Today · 9:30 AM',
			kind: 'incomplete',
			unread: true
		},
		{
			id: 'enrollment',
			title: 'You’re officially enrolled',
			message: 'Your enrollment for SY 2026–2027, 1st Semester has been confirmed.',
			time: 'Oct 5 · 10:15 AM',
			kind: 'enrollment',
			unread: false
		}
	]);
	let notificationFilter = $state<'all' | 'unread'>('all');
	const unreadCount = $derived(notifications.filter((item) => item.unread).length);
	const visibleNotifications = $derived(
		notifications.filter((item) => notificationFilter === 'all' || item.unread)
	);

	function markAllRead() {
		for (const item of notifications) item.unread = false;
	}
</script>

<svelte:head><title>Student dashboard | BPC Enrollment System</title></svelte:head>

<div class="w-full space-y-6">
	<header class="portal-panel relative overflow-hidden">
		<div class="h-1 bg-primary" aria-hidden="true"></div>
		<div class="flex flex-col justify-between gap-6 p-5 sm:p-7 lg:flex-row lg:items-center">
			<div class="min-w-0">
				<div class="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
					<span class="tracking-widest text-primary">YOUR STUDENT SPACE</span>
				</div>
				<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
					Welcome back, {data.studentName}.
				</h1>
				<p class="mt-2 max-w-lg text-sm leading-relaxed text-base-content/65">
					A little clarity for your next step. Keep up with your enrollment, grades, and campus
					updates.
				</p>
				<p class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/60">
					<span class="font-mono">{data.studentNumber ?? 'No student number assigned'}</span>
					{#if semester}
						<span class="h-3 w-px bg-base-300" aria-hidden="true"></span>
						<span>
							{semester.programCode} · Year {semester.yearLevel} · Section {semester.section}
						</span>
					{/if}
				</p>
			</div>
			<div class="shrink-0 rounded-xl border border-primary/10 bg-primary/5 p-4 lg:min-w-60">
				<div class="flex items-center justify-between gap-5">
					<span class="text-xs font-semibold text-base-content/60">CURRENT ENROLLMENT</span>
					<span
						class={`badge badge-sm capitalize ${semester?.status === 'enrolled' ? 'border-success/30 bg-success/15' : 'border-base-300 bg-base-100'} text-base-content`}
					>
						{semester?.status ?? 'Not assigned'}
					</span>
				</div>
				<p class="mt-3 font-bold">
					{#if semester}
						{semester.term}
						<span class="font-normal text-base-content/50">&middot;</span>
						{semester.schoolYear}
					{:else}
						No current enrollment
					{/if}
				</p>
				<a
					href={resolve('/user/enrollment')}
					class="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
				>
					View enrollment <ArrowRight class="size-4" aria-hidden="true" />
				</a>
			</div>
		</div>
	</header>

	{#each data.droppedEnrollments as droppedEnrollment (droppedEnrollment.id)}
		<section
			class="rounded-2xl border border-warning/40 bg-base-100 p-5 shadow-sm sm:p-6"
			aria-labelledby={`dropped-${droppedEnrollment.id}`}
		>
			<p class="text-xs font-semibold text-base-content/60">{droppedEnrollment.term}</p>
			<h2 id={`dropped-${droppedEnrollment.id}`} class="mt-1 text-lg font-bold">
				{droppedEnrollment.isCurrent
					? 'Your enrollment has been dropped'
					: 'A previous enrollment was dropped'}
			</h2>
			<p class="mt-2 text-sm text-base-content/70">
				{droppedEnrollment.isCurrent
					? "Contact the Registrar's Office if you have questions or want to enroll again. Your term and subject list have been retained."
					: 'The dropped enrollment and its subjects remain available in your enrollment history.'}
			</p>
			{#if droppedEnrollment.droppedAt}
				<p class="mt-3 text-xs text-base-content/55">
					Dropped {dateFormatter.format(droppedEnrollment.droppedAt)}
				</p>
			{/if}
			<a
				class="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
				href={resolve('/user/enrollment')}
			>
				View enrollment history<ArrowRight class="size-4" aria-hidden="true" />
			</a>
		</section>
	{/each}

	{#each data.meetingRequests as meeting (meeting.id)}
		<section
			class="overflow-hidden rounded-2xl border border-warning/40 bg-base-100 shadow-sm"
			aria-labelledby={`meeting-${meeting.id}`}
		>
			<div class="flex items-start gap-4 p-5 sm:p-6">
				<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-warning/20">
					<CalendarClock class="size-5" aria-hidden="true" />
				</span>
				<div class="min-w-0 flex-1">
					<p class="text-xs font-semibold text-base-content/60">{meeting.term}</p>
					<h2 id={`meeting-${meeting.id}`} class="mt-1 text-lg font-bold">
						A meeting has been requested
					</h2>
					<p class="mt-2 text-sm leading-relaxed text-base-content/70">
						Please contact the Registrar's Office to arrange a time to discuss your failing or
						incomplete grades and enrollment options. Check your email for the request.
					</p>
					<p class="mt-3 text-xs text-base-content/55">
						Request sent {dateFormatter.format(meeting.sentAt)} · {meeting.failedCount} failing · {meeting.incompleteCount}
						incomplete
					</p>
					<a
						href={resolve('/user/enrollment')}
						class="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
					>
						Review enrollment history <ArrowRight class="size-4" aria-hidden="true" />
					</a>
				</div>
			</div>
		</section>
	{/each}

	<section class="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" aria-label="Semester summary">
		{#each [{ label: 'Current subjects', value: subjects.length, detail: semester ? `${totalUnits} units this semester` : 'No current enrollment', icon: BookOpen, tone: 'bg-primary/10 text-primary' }, { label: 'Subjects passed', value: passedCount ?? '\u2014', detail: semester?.finalizedGrades ? 'Final grades released' : 'Awaiting final grades', icon: CircleCheck, tone: 'bg-success/20 text-base-content' }, { label: 'Need attention', value: attentionCount, detail: `${data.failedCount} failed \u00b7 ${data.incompleteCount} incomplete`, icon: CircleAlert, tone: 'bg-warning/35 text-warning-content' }, { label: 'Unread updates', value: unreadCount, detail: 'Sample notifications', icon: BellRing, tone: 'bg-secondary/10 text-secondary' }] as item (item.label)}
			<article class="portal-panel p-4 shadow-sm sm:p-5">
				<div class="flex items-start justify-between gap-2">
					<p class="text-xs font-medium text-base-content/65 sm:text-sm">{item.label}</p>
					<span class={`flex size-8 shrink-0 items-center justify-center rounded-lg ${item.tone}`}>
						<item.icon class="size-4" aria-hidden="true" />
					</span>
				</div>
				<p class="mt-2 text-3xl font-bold tracking-tight tabular-nums">{item.value}</p>
				<p class="mt-1 text-xs leading-relaxed text-base-content/55">{item.detail}</p>
			</article>
		{/each}
	</section>

	<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
		<div class="min-w-0 space-y-6">
			<section class="portal-panel overflow-hidden" aria-labelledby="grades-heading">
				<header
					class="flex flex-wrap items-start justify-between gap-3 border-b border-base-300 p-5 sm:p-6"
				>
					<div>
						<h2 id="grades-heading" class="flex items-center gap-2 text-lg font-bold">
							<GraduationCap class="size-5 text-primary" aria-hidden="true" />Your academic overview
						</h2>
						<p class="mt-1 text-xs text-base-content/60">
							{semester
								? `${semester.term} \u00b7 SY ${semester.schoolYear}`
								: 'No current enrollment assigned'}
						</p>
					</div>
					{#if semester?.finalizedGrades}
						<span class="badge gap-1.5 border-success/30 bg-success/15 badge-sm text-base-content">
							<ShieldCheck class="size-3.5" aria-hidden="true" />Grades finalized
						</span>
					{:else if semester}
						<span class="badge badge-outline badge-sm">Grades pending</span>
					{/if}
				</header>
				{#if attentionCount > 0}
					<div
						class="m-4 flex items-start gap-3 rounded-xl border border-warning/60 bg-warning/15 p-4 sm:mx-6 sm:mt-5"
					>
						<CircleAlert class="mt-0.5 size-5 shrink-0 text-base-content/75" aria-hidden="true" />
						<div>
							<h3 class="text-sm font-semibold">
								{attentionCount}
								{attentionCount === 1 ? 'subject needs' : 'subjects need'} your attention
							</h3>
							<p class="mt-1 text-xs leading-relaxed text-base-content/70">
								{data.failedCount} failed &middot; {data.incompleteCount} incomplete. Review the details
								below and reach out for guidance.
							</p>
						</div>
					</div>
				{:else if semester && !semester.finalizedGrades}
					<p
						class="mx-5 my-4 rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm text-base-content/70 sm:mx-6"
					>
						Your grades will appear here once they have been finalized.
					</p>
				{/if}
				{#if subjects.length}
					<div class="overflow-x-auto">
						<table class="table w-full">
							<caption class="sr-only">Subjects and grades for the current enrollment</caption>
							<thead class="bg-base-200/50">
								<tr>
									<th scope="col" class="pl-5 sm:pl-6">Subject</th>
									<th scope="col" class="text-center">Grade</th>
									<th scope="col" class="pr-5 text-right sm:pr-6">Result</th>
								</tr>
							</thead>
							<tbody>
								{#each subjects as subject (subject.id)}
									<tr>
										<td class="py-3.5 pl-5 sm:pl-6">
											<p class="text-xs font-semibold sm:text-sm">{subject.name}</p>
											<p class="mt-1 font-mono text-[11px] text-base-content/50">
												{subject.code} · {subject.units} units
											</p>
										</td>
										<td class="text-center text-sm font-semibold tabular-nums">{subject.grade}</td>
										<td class="pr-5 text-right sm:pr-6">
											<span
												class={`badge border-0 badge-sm ${subject.status === 'Failed' ? 'bg-error/20 text-base-content' : subject.status === 'Incomplete' ? 'bg-warning/35 text-base-content' : subject.status === 'Passed' ? 'bg-success/15 text-base-content/80' : 'bg-base-200 text-base-content/60'}`}
											>
												{subject.status}
											</span>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<p class="p-6 text-sm text-base-content/60">
						{semester
							? 'No subjects recorded for this enrollment.'
							: 'No current enrollment assigned. View enrollment history or contact the Registrar for assistance.'}
					</p>
				{/if}
				<footer
					class="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 bg-base-200/30 px-5 py-4 sm:px-6"
				>
					<p class="text-xs text-base-content/60">INC means incomplete.</p>
					<a
						href={resolve('/user/enrollment')}
						class="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
					>
						Full enrollment history <ArrowRight class="size-3.5" aria-hidden="true" />
					</a>
				</footer>
			</section>

			<section class="portal-panel p-5 shadow-sm sm:p-6" aria-labelledby="next-steps-heading">
				<h2 id="next-steps-heading" class="text-lg font-bold">Your next steps</h2>
				<p class="mt-1 text-xs text-base-content/60">
					Small actions to keep your studies moving forward.
				</p>
				<div class="mt-5 space-y-5">
					{#each data.nextSteps as step, index (step.id)}
						<div class="flex gap-3">
							<span
								class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/5 font-mono text-xs font-semibold text-primary"
							>
								{String(index + 1).padStart(2, '0')}
							</span>
							<div>
								<h3 class="text-sm font-semibold">{step.title}</h3>
								<p class="mt-1 text-xs leading-relaxed text-base-content/65">{step.detail}</p>
							</div>
						</div>
					{/each}
				</div>
			</section>
		</div>

		<aside class="min-w-0 space-y-6">
			<section class="portal-panel overflow-hidden" aria-labelledby="notifications-heading">
				<header class="p-5 pb-0 sm:px-6 sm:pt-6">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<h2 id="notifications-heading" class="flex items-center gap-2 text-lg font-bold">
							<Bell class="size-5 text-primary" aria-hidden="true" />Notifications
							<span
								class="rounded-full border border-base-300 px-2 py-0.5 text-[10px] font-medium text-base-content/50"
							>
								Sample updates
							</span>
							<span
								class="badge border-0 bg-primary/10 badge-sm text-primary"
								aria-label={`${unreadCount} unread notifications`}
							>
								{unreadCount}
							</span>
						</h2>
						<button
							type="button"
							class="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:cursor-default disabled:text-base-content/35 disabled:no-underline"
							disabled={!unreadCount}
							onclick={markAllRead}
						>
							<CheckCheck class="size-3.5" aria-hidden="true" />Mark all read
						</button>
					</div>
					<p class="mt-2 text-xs text-base-content/55">Sample notifications for preview.</p>
					<div class="mt-5 flex gap-5 border-b border-base-300" aria-label="Notification filters">
						{#each [{ value: 'all', label: 'All updates' }, { value: 'unread', label: 'Unread' }] as filter (filter.value)}
							<button
								type="button"
								aria-pressed={notificationFilter === filter.value}
								onclick={() => (notificationFilter = filter.value as 'all' | 'unread')}
								class={`border-b-2 px-0.5 pb-3 text-xs font-semibold transition-colors ${notificationFilter === filter.value ? 'border-primary text-primary' : 'border-transparent text-base-content/55 hover:text-base-content'}`}
							>
								{filter.label}{filter.value === 'unread' ? ` (${unreadCount})` : ''}
							</button>
						{/each}
					</div>
				</header>
				<ul class="divide-y divide-base-300" aria-label="Student notifications">
					{#each visibleNotifications as item (item.id)}
						<li class={`flex gap-3 p-5 sm:px-6 ${item.unread ? 'bg-primary/[0.025]' : ''}`}>
							<span
								class={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${item.kind === 'failed' ? 'bg-error/15' : item.kind === 'incomplete' ? 'bg-warning/30' : 'bg-primary/10 text-primary'}`}
							>
								{#if item.kind === 'grades'}
									<ShieldCheck class="size-4" aria-hidden="true" />
								{:else if item.kind === 'failed'}
									<CircleAlert class="size-4" aria-hidden="true" />
								{:else if item.kind === 'incomplete'}
									<Clock3 class="size-4" aria-hidden="true" />
								{:else}
									<GraduationCap class="size-4" aria-hidden="true" />
								{/if}
							</span>
							<div class="min-w-0 flex-1">
								<div class="flex items-start justify-between gap-2">
									<h3 class="text-sm leading-snug font-semibold">{item.title}</h3>
									{#if item.unread}
										<span
											class="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
											aria-label="Unread"
										></span>
									{/if}
								</div>
								<p class="mt-1.5 text-xs leading-relaxed text-base-content/65">{item.message}</p>
								<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
									<p class="text-[11px] text-base-content/50">{item.time}</p>
									{#if item.unread}
										<button
											type="button"
											aria-label={`Mark ${item.title} as read`}
											class="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
											onclick={() => (item.unread = false)}
										>
											<Check class="size-3" aria-hidden="true" />Mark as read
										</button>
									{/if}
								</div>
							</div>
						</li>
					{:else}
						<li class="px-6 py-12 text-center">
							<span
								class="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/5 text-primary"
							>
								<CheckCheck class="size-6" aria-hidden="true" />
							</span>
							<p class="mt-3 text-sm font-semibold">You’re all caught up</p>
							<p class="mt-1 text-xs text-base-content/60">No unread notifications right now.</p>
						</li>
					{/each}
				</ul>
				<p class="sr-only" role="status">{unreadCount} unread notifications</p>
			</section>

			<section class="portal-panel flex gap-3 p-5 shadow-sm" aria-labelledby="help-heading">
				<Info class="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
				<div>
					<h2 id="help-heading" class="text-sm font-semibold">
						You don’t have to figure it out alone.
					</h2>
					<p class="mt-2 text-xs leading-relaxed text-base-content/65">
						For questions about grades or enrollment, visit the Registrar’s Office. Your instructor
						can help with subject requirements.
					</p>
				</div>
			</section>
		</aside>
	</div>
</div>
