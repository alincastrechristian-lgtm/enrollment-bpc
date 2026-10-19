<script lang="ts">
	import { ArrowRight, ClipboardCheck } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { getStudentClearance } from '#lib/actions/clearance.remote.js';
	import { clearancePassed, hasCurrentOfficeChecks } from '#lib/clearance/report.js';
	import { templateTermIssue } from '#lib/clearance/definition.js';

	const progress = getStudentClearance();
	const current = $derived(progress.current?.current);
	const submission = $derived(progress.current?.submission);
	const notice = $derived.by(() => {
		if (
			!current?.finalizedGrades ||
			['dropped', 'voided'].includes(current.status) ||
			current.submittedClearance ||
			submission?.status === 'verified'
		)
			return null;
		const currentChecks = !submission || hasCurrentOfficeChecks(submission.report);
		if (submission?.status === 'requested' && currentChecks)
			return {
				title: 'Enrollment request sent',
				detail:
					'Your clearance is awaiting Registrar review. You do not need to upload it again while your request is being reviewed.',
				action: 'View request',
				waiting: true
			};
		if (!progress.current?.template?.definition)
			return {
				title: 'Clearance upload is not available yet',
				detail: `Your grades are finalized. No active clearance template is available for Semester ${current.semester}, SY ${current.schoolYearStart}-${current.schoolYearStart + 1}. Contact the Registrar before uploading.`,
				action: 'View clearance status',
				waiting: true
			};
		const termIssue = templateTermIssue(progress.current.template.definition, current);
		if (termIssue)
			return {
				title: 'Clearance template needs updating',
				detail: termIssue,
				action: 'View clearance status',
				waiting: true
			};
		if (submission?.status === 'ready' && clearancePassed(submission.report))
			return {
				title: 'Your clearance is ready',
				detail:
					'Your upload passed the checks. Send your enrollment request so the Registrar can review your clearance.',
				action: 'Request enrollment',
				waiting: false
			};
		if (submission)
			return {
				title: 'Upload your clearance again',
				detail:
					'Your clearance needs an update before your next enrollment. Open Enrollment to review the feedback and upload a completed, clear copy.',
				action: 'Review clearance',
				waiting: false
			};
		return {
			title: 'Upload your clearance for next enrollment',
			detail:
				'Your grades are finalized. Upload your completed clearance, then send an enrollment request after the checks pass.',
			action: 'Upload clearance',
			waiting: false
		};
	});
</script>

{#if notice && !progress.error}
	<section
		class="portal-panel border-primary/25 bg-primary/5 p-5 sm:p-6"
		aria-label="Clearance reminder"
	>
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
			<div class="flex min-w-0 flex-1 items-start gap-3">
				<span
					class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
				>
					<ClipboardCheck size={21} aria-hidden="true" />
				</span>
				<div class="min-w-0">
					<p class="text-xs font-semibold text-primary">
						{notice.waiting ? 'CLEARANCE UPDATE' : 'NEXT ENROLLMENT'}
					</p>
					<h2 class="mt-1 text-base font-bold">{notice.title}</h2>
					<p class="mt-1 max-w-2xl text-sm leading-relaxed text-base-content/70">{notice.detail}</p>
				</div>
			</div>
			<a href={`${resolve('/user/enrollment')}#clearance`} class="btn shrink-0 btn-primary btn-sm">
				{notice.action}<ArrowRight size={15} aria-hidden="true" />
			</a>
		</div>
	</section>
{/if}
