<script lang="ts">
	import {
		getStudentClearance,
		uploadClearance,
		requestEnrollment
	} from '#lib/actions/clearance.remote.js';
	import BorderEditor from '#lib/clearance/BorderEditor.svelte';
	import ClearanceFindings from '#lib/clearance/ClearanceFindings.svelte';
	import {
		clearancePassed,
		hasCurrentOfficeChecks,
		type ClearanceReport
	} from '#lib/clearance/report.js';
	import { UNIT_CORNERS, validCorners, type Corners } from '#lib/clearance/clearance.js';
	import { templateTermIssue } from '#lib/clearance/definition.js';
	import { resolve } from '$app/paths';
	import { getErrorMessage } from '#lib/errors.js';
	import { ArrowRight, ClipboardCheck, FileImage, Upload } from '@lucide/svelte';
	const progress = getStudentClearance();
	let image = $state(''),
		corners = $state<Corners>(structuredClone(UNIT_CORNERS));
	let loading = $state(false),
		busy = $state(false),
		drawing = $state(false),
		dragging = $state(false);
	let report = $state<ClearanceReport>(),
		message = $state('');
	let input = $state<HTMLInputElement>();
	let replacing = $state(false);
	const current = $derived(progress.current?.current);
	const submission = $derived(progress.current?.submission);
	const template = $derived(progress.current?.template);
	const termIssue = $derived(
		current && template?.definition ? templateTermIssue(template.definition, current) : null
	);
	const currentChecks = $derived(!submission || hasCurrentOfficeChecks(submission.report));
	const allowed = $derived(
		!!current?.finalizedGrades &&
			!['dropped', 'voided'].includes(current.status) &&
			!current.submittedClearance &&
			(!['requested', 'verified'].includes(submission?.status ?? '') ||
				(submission?.status === 'requested' && !currentChecks))
	);
	const ready = $derived(submission?.status === 'ready' && currentChecks && !termIssue);
	const statusLabel = $derived(
		current?.submittedClearance || submission?.status === 'verified'
			? 'Verified by staff'
			: submission?.status === 'requested' && currentChecks
				? 'Awaiting review'
				: !current?.finalizedGrades
					? 'Awaiting grades'
					: termIssue
						? 'Template unavailable'
						: ready
							? 'Ready to request'
							: submission
								? 'Upload needed'
								: 'Not uploaded'
	);
	function cancelReplacement() {
		replacing = false;
		image = '';
		report = undefined;
		message = '';
		if (input) input.value = '';
	}
	async function open(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		image = '';
		report = undefined;
		message = '';
		if (!file) return;
		loading = true;
		try {
			const p = await import('#lib/clearance/scan.client.js');
			const source = await p.loadUpload(file),
				found = p.detectBorder(source);
			image = source.toDataURL('image/jpeg', 0.95);
			corners = structuredClone(found ?? UNIT_CORNERS);
			drawing = !found;
		} catch (cause) {
			message = getErrorMessage(cause, 'Could not open clearance image.');
			if (input) input.value = '';
		} finally {
			loading = false;
		}
	}
	async function request() {
		if (!submission || busy || loading) return;
		busy = true;
		message = '';
		try {
			await requestEnrollment({ submissionId: submission.id });
			message = 'Enrollment request sent. Wait for clearance verification by the Registrar.';
		} catch (cause) {
			message = getErrorMessage(cause, 'Could not request enrollment.');
		} finally {
			busy = false;
		}
	}
</script>

<section
	id="clearance"
	class="portal-panel scroll-mt-6 overflow-hidden"
	aria-label="Clearance and enrollment request"
	aria-busy={busy || loading}
>
	<header class="flex flex-wrap items-start gap-3 border-b border-base-300 p-5 sm:p-6">
		<span class="rounded-xl bg-primary/10 p-2.5 text-primary">
			<ClipboardCheck size={23} aria-hidden="true" />
		</span>
		<div class="min-w-0 flex-1 basis-52">
			<h2 class="text-lg font-bold">Clearance and next enrollment</h2>
			<p class="mt-1 text-sm text-base-content/65">
				Submit your completed clearance to start your next enrollment.
			</p>
		</div>
		{#if current}
			<span class="badge badge-outline text-xs">{statusLabel}</span>
		{/if}
	</header>
	<div class="space-y-5 p-5 sm:p-6">
		{#if progress.error}
			<p role="alert" class="text-sm text-error">
				Could not load clearance status. Refresh and try again.
			</p>
		{:else if !progress.current}
			<p role="status" class="text-sm">Loading clearance status…</p>
		{:else if !current}
			<p class="text-sm text-base-content/65">
				Your first enrollment is handled by the Registrar. Clearance upload becomes available after
				grades for an assigned enrollment are finalized.
			</p>
		{:else}
			<ol class="grid gap-2 sm:grid-cols-3" aria-label="Enrollment progress">
				{#each [{ title: 'Upload clearance', detail: 'Complete all office requirements', done: !!submission && currentChecks && ['ready', 'requested', 'verified'].includes(submission.status) }, { title: 'Request enrollment', detail: 'Send after your checks pass', done: !!submission && currentChecks && ['requested', 'verified'].includes(submission.status) }, { title: 'Registrar review', detail: 'Staff verifies and enrolls you', done: !!current.submittedClearance }] as step, i (step.title)}
					<li
						class={`flex items-start gap-3 rounded-xl border p-3 ${step.done ? 'border-primary/20 bg-primary/5' : 'border-base-300'}`}
					>
						<span
							class={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${step.done ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content/60'}`}
						>
							{step.done ? '✓' : i + 1}
						</span>
						<div>
							<p class="text-xs font-semibold">{step.title}</p>
							<p class="mt-1 text-xs text-base-content/60">{step.detail}</p>
						</div>
					</li>
				{/each}
			</ol>
			{#if !current.finalizedGrades}
				<p class="rounded-xl bg-base-200/60 p-4 text-sm text-base-content/65">
					Wait for staff to finalize your grades before uploading clearance.
				</p>
			{/if}
			{#if allowed && termIssue}
				<div role="alert" class="space-y-1 rounded-xl border border-warning/30 bg-warning/10 p-4">
					<p class="text-sm font-semibold">Clearance template needs updating</p>
					<p class="text-sm text-base-content/75">{termIssue}</p>
					<p class="text-xs text-base-content/65">
						New uploads cannot be checked or saved until a template matches your enrollment term.
					</p>
				</div>
			{/if}
			{#if submission}
				<div class="space-y-2 rounded-xl border border-base-300 p-4">
					<p class="flex items-center gap-2 text-xs font-semibold text-base-content/60">
						<FileImage size={16} aria-hidden="true" />SAVED CLEARANCE
					</p>
					<p class="text-sm font-semibold break-all">{submission.filename}</p>
					<a
						class="link text-sm"
						href={resolve('/user/clearance-files/[id]', { id: submission.id })}
						target="_blank"
						rel="noreferrer"
					>
						View saved clearance
					</a>
					{#if ready && allowed && !replacing}
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							disabled={busy || loading}
							onclick={() => (replacing = true)}
						>
							Replace saved clearance
						</button>
					{/if}
					{#if submission.rejectionReason}
						<p role="alert" class="text-sm text-error">
							Correction requested: {submission.rejectionReason}
						</p>
					{/if}
					{#if submission.status === 'invalidated'}
						<p class="text-sm text-warning">
							Grades or enrollment changed. Upload clearance again after grades are finalized.
						</p>
					{/if}
					{#if submission.status === 'requested' && currentChecks}
						<p role="status" class="text-sm">
							Your enrollment request is awaiting Registrar/admin clearance review.
						</p>
					{/if}
					{#if submission.status === 'verified'}
						<p role="status" class="text-sm text-success">
							Clearance verified. The Registrar/admin can now complete your enrollment, subject to
							academic requirements.
						</p>
					{/if}
				</div>
			{/if}
			{#if allowed && template?.definition && !termIssue && (!ready || replacing)}
				<form
					{...uploadClearance.enhance(async (form) => {
						if (
							busy ||
							loading ||
							drawing ||
							dragging ||
							termIssue ||
							!image ||
							!validCorners(corners)
						)
							return;
						busy = true;
						message = '';
						report = undefined;
						try {
							if (await form.submit()) {
								report = form.result?.report;
								if (form.result?.success) {
									image = '';
									replacing = false;
									form.element.reset();
									message =
										'Clearance checks passed and file saved. You can now request enrollment.';
								} else
									message =
										'Clearance did not pass all checks. Review the findings and upload a clearer or completed form.';
							} else message = 'Check the selected image and outline.';
						} catch (cause) {
							message = getErrorMessage(cause, 'Could not check clearance. Try again.');
						} finally {
							busy = false;
						}
					})}
					enctype="multipart/form-data"
					class="space-y-4 rounded-xl border border-base-300 p-4 sm:p-5"
				>
					<input {...uploadClearance.fields.enrollmentId.as('hidden', current.id)} />
					<input {...uploadClearance.fields.revision.as('hidden', String(current.revision))} />
					<input {...uploadClearance.fields.templateRevision.as('hidden', template.revision)} />
					<input {...uploadClearance.fields.corners.as('hidden', JSON.stringify(corners))} />
					<div class="flex items-start gap-3">
						<Upload size={20} class="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
						<div>
							<h3 class="text-sm font-bold">
								{replacing ? 'Replace your clearance' : 'Upload your completed clearance'}
							</h3>
							<p class="mt-1 text-xs leading-relaxed text-base-content/65">
								Use the clearance form for your current semester and school year. Make sure every
								required office has checked Cleared and signed or stamped your form.
							</p>
						</div>
					</div>
					<label class="block space-y-2 text-sm font-semibold">
						Upload clearance
						<input
							{...uploadClearance.fields.file.as('file')}
							bind:this={input}
							accept="image/jpeg,image/png,image/webp"
							class="file-input w-full"
							aria-describedby="student-clearance-file-help"
							disabled={busy || loading}
							onchange={open}
						/>
					</label>
					<p id="student-clearance-file-help" class="text-xs text-base-content/65">
						JPG, PNG or WebP up to 10 MiB. Include all office marks and keep the form border
						visible.
					</p>
					{#if loading}
						<p role="status" class="flex items-center gap-2 text-sm">
							<span class="loading loading-xs loading-spinner" aria-hidden="true"></span>
							Preparing image…
						</p>
					{/if}
					{#if image}
						<div class="space-y-3">
							<p class="text-xs font-semibold">
								Check the outline covers your complete clearance. Adjust only if needed.
							</p>
							<BorderEditor
								src={image}
								bind:corners
								bind:drawing
								bind:dragging
								onchange={() => {
									report = undefined;
								}}
								disabled={busy || loading}
							/>
						</div>
					{/if}
					<div class="flex flex-wrap items-center gap-3 border-t border-base-300 pt-4">
						{#if replacing}
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								disabled={busy || loading}
								onclick={cancelReplacement}
							>
								Cancel replacement
							</button>
						{/if}
						<button
							type="submit"
							class="btn btn-primary btn-sm"
							disabled={busy || loading || !image || drawing || dragging || !validCorners(corners)}
						>
							{#if busy}
								<span class="loading loading-xs loading-spinner" aria-hidden="true"></span>
							{/if}
							{busy ? 'Checking clearance…' : 'Check and save clearance'}
						</button>
						<p class="text-xs text-base-content/60">
							Checking your file does not send an enrollment request.
						</p>
					</div>
				</form>
			{:else if allowed && !template?.definition}
				<p class="text-sm text-warning">
					No active clearance template is available for Semester {current.semester}, SY {current.schoolYearStart}-{current.schoolYearStart +
						1}. Contact the Registrar.
				</p>
			{/if}
			{#if ready}
				<div
					class="flex flex-col gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"
				>
					<div>
						<h3 class="text-sm font-bold">Ready for Registrar review</h3>
						<p class="mt-1 text-xs text-base-content/70">
							Send your request to continue. The Registrar reviews your clearance before completing
							enrollment.
						</p>
					</div>
					<button
						type="button"
						class="btn shrink-0 btn-primary btn-sm"
						disabled={busy || loading || !!image || (!!report && !clearancePassed(report))}
						onclick={request}
					>
						Request enrollment
						<ArrowRight size={15} aria-hidden="true" />
					</button>
				</div>
			{/if}
			{#if current.submittedClearance && !submission}
				<p class="text-sm text-success">
					Your clearance was already verified by staff. Contact the Registrar to complete
					enrollment.
				</p>
			{/if}
			{#if report && !termIssue}
				<ClearanceFindings {report} />
			{:else if submission && !image && !loading}
				<details class="rounded-xl border border-base-300 p-4" open={!termIssue}>
					<summary class="cursor-pointer text-sm font-semibold">
						Saved clearance check results
					</summary>
					<p class="mt-3 text-xs text-base-content/65">
						These results belong to your previously saved clearance, not a new upload.
					</p>
					<div class="mt-3"><ClearanceFindings report={submission.report} /></div>
				</details>
			{:else if image && !loading}
				<p class="text-xs text-base-content/65">
					No check results for this selected image yet. Choose Check and save clearance to validate
					it.
				</p>
			{/if}
		{/if}
		{#if message}
			<p role="status" class="rounded-xl bg-base-200/60 p-4 text-sm">{message}</p>
		{/if}
	</div>
</section>
