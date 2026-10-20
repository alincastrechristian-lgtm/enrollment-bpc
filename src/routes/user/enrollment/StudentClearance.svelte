<script lang="ts">
	import {
		getStudentClearance,
		uploadClearance,
		requestEnrollment
	} from '#lib/actions/clearance.remote.js';
	import BorderEditor from '#lib/clearance/BorderEditor.svelte';
	import { getStudentDocuments } from '#lib/actions/documents.remote.js';
	import ClearanceFindings from '#lib/clearance/ClearanceFindings.svelte';
	import {
		clearanceCanSubmit,
		clearanceNeedsIdentityReview,
		hasCurrentClearanceChecks,
		type ClearanceReport
	} from '#lib/clearance/report.js';
	import { UNIT_CORNERS, validCorners, type Corners } from '#lib/clearance/clearance.js';
	import { clearanceTermFromEnrollment, getTemplateSetupIssue } from '#lib/clearance/definition.js';
	import { resolve } from '$app/paths';
	import { isHttpError } from '@sveltejs/kit';
	import { getErrorMessage } from '#lib/errors.js';
	import { withDeadline, CLEARANCE_CLIENT_TIMEOUT_MS } from '#lib/clearance/deadline.js';
	import { onDestroy } from 'svelte';
	import { ArrowRight, ClipboardCheck, FileImage, Upload } from '@lucide/svelte';
	const progress = getStudentClearance();
	const documents = getStudentDocuments();
	const documentBlock = $derived(documents.current?.uploadBlock);
	let image = $state(''),
		corners = $state<Corners>(structuredClone(UNIT_CORNERS));
	let aligning = $state(false);
	let detection = $state<'found' | 'missing' | null>(null);
	let loading = $state(false),
		busy = $state(false),
		drawing = $state(false),
		dragging = $state(false);
	let report = $state<ClearanceReport>(),
		message = $state('');
	let input = $state<HTMLInputElement>();
	let replacing = $state(false);
	let needsStatusRefresh = $state(false);
	const lifetime = new AbortController();
	onDestroy(() => lifetime.abort());
	const current = $derived(progress.current?.current);
	const submission = $derived(progress.current?.submission);
	const template = $derived(progress.current?.template);
	const automatedClearanceVerificationEnabled = $derived(
		progress.current?.automatedClearanceVerificationEnabled !== false
	);
	const term = $derived(current ? clearanceTermFromEnrollment(current) : null);
	const templateSetupIssue = $derived(
		getTemplateSetupIssue(
			template?.definition,
			progress.current?.personalInfoVerificationEnabled !== false
		)
	);
	const templateReady = $derived(!templateSetupIssue);
	const currentChecks = $derived(!submission || hasCurrentClearanceChecks(submission.report));
	const allowed = $derived(
		!!current?.finalizedGrades &&
			!['dropped', 'voided'].includes(current.status) &&
			!current.submittedClearance &&
			(!['requested', 'verified'].includes(submission?.status ?? '') ||
				(submission?.status === 'requested' && !currentChecks))
	);
	const ready = $derived(submission?.status === 'ready' && clearanceCanSubmit(submission.report));
	const identityReviewNeeded = $derived(
		!!submission && clearanceNeedsIdentityReview(submission.report)
	);
	const statusLabel = $derived(
		current?.submittedClearance || submission?.status === 'verified'
			? 'Verified by staff'
			: submission?.status === 'requested' && currentChecks
				? 'Awaiting review'
				: !current?.finalizedGrades
					? 'Awaiting grades'
					: ready
						? identityReviewNeeded
							? 'Identity review needed'
							: 'Ready to request'
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
			detection = found ? 'found' : 'missing';
		} catch (cause) {
			message = getErrorMessage(cause, 'Could not open clearance image.');
			if (input) input.value = '';
		} finally {
			loading = false;
		}
	}
	async function request() {
		if (
			!submission ||
			needsStatusRefresh ||
			busy ||
			loading ||
			aligning ||
			!documents.current ||
			documents.error ||
			documentBlock
		)
			return;
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

{#if !automatedClearanceVerificationEnabled}
	<section
		id="clearance"
		class="portal-panel p-5 sm:p-6"
		aria-label="Clearance and enrollment request"
	>
		<h2 class="text-lg font-bold">Paper clearance</h2>
		<p class="mt-2 text-sm text-base-content/65">
			{current?.submittedClearance
				? 'Your clearance has been verified. Contact the Registrar for your next enrollment.'
				: 'Submit your completed paper clearance to the Registrar. Registrar/admin must receive and verify it before your next enrollment. Online upload is currently disabled.'}
		</p>
	</section>
{:else}
	<section
		id="clearance"
		class="portal-panel scroll-mt-6 overflow-hidden"
		aria-label="Clearance and enrollment request"
		aria-busy={busy || loading || aligning}
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
					Your first enrollment is handled by the Registrar. Clearance upload becomes available
					after grades for an assigned enrollment are finalized.
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
								disabled={busy || loading || aligning}
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
				{#if allowed && templateReady && template && (!ready || replacing)}
					<form
						{...uploadClearance.enhance(async (form) => {
							if (
								busy ||
								needsStatusRefresh ||
								loading ||
								aligning ||
								drawing ||
								dragging ||
								!image ||
								!validCorners(corners)
							)
								return;
							busy = true;
							message = '';
							report = undefined;
							try {
								if (
									await withDeadline(
										() => form.submit(),
										CLEARANCE_CLIENT_TIMEOUT_MS,
										lifetime.signal
									)
								) {
									report = form.result?.report ?? undefined;
									if (form.result?.success) {
										image = '';
										replacing = false;
										form.element.reset();
										message =
											report && clearanceNeedsIdentityReview(report)
												? 'Clearance saved. Student name or number needs manual verification. Send your enrollment request for Registrar/admin review.'
												: 'Clearance checks passed and file saved. You can now request enrollment.';
									} else if (form.result && 'failure' in form.result) {
										const failure = form.result.failure;
										message = `${failure.message} Reference: ${failure.code}.`;
										needsStatusRefresh = failure.refreshRequired;
									} else
										message =
											'Clearance did not pass all checks. Review the findings and upload a clearer or completed form.';
								} else message = 'Check the selected image and outline.';
							} catch (cause) {
								if (lifetime.signal.aborted) return;
								if (
									(cause instanceof Error && cause.name === 'TimeoutError') ||
									isHttpError(cause, 408)
								) {
									needsStatusRefresh = true;
									message =
										'Clearance checking is taking too long. Its saved status is unknown. Refresh clearance status before uploading again.';
								} else if (isHttpError(cause, 413)) {
									message =
										'The server rejected the upload size. Try a smaller JPG, PNG or WebP image, or contact the Registrar. Reference: CLR-SIZE.';
								} else if (isHttpError(cause) && cause.status < 500) {
									message = getErrorMessage(cause, 'Check your image and try again.');
								} else {
									needsStatusRefresh = true;
									message =
										'No clearance result was received. Check your connection and refresh clearance status before uploading again. Reference: CLR-CONNECTION.';
								}
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
									Use the clearance form for Semester {term?.semester}, SY {term?.schoolYear}. Make
									sure every required office has checked Cleared and signed or stamped your form.
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
								disabled={busy || loading || aligning}
								onchange={open}
							/>
						</label>
						<p id="student-clearance-file-help" class="text-xs text-base-content/65">
							JPG, PNG or WebP up to 10 MiB. Include all office marks and keep the form border
							visible. Only the name and student-number crops are sent to the configured AI provider
							for recognition; they are compared with your student record.
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
									{template}
									{detection}
									bind:detecting={aligning}
									bind:corners
									bind:drawing
									bind:dragging
									onchange={() => {
										report = undefined;
										detection = null;
									}}
									disabled={busy || loading || aligning}
								/>
							</div>
						{/if}
						<div class="flex flex-wrap items-center gap-3 border-t border-base-300 pt-4">
							{#if replacing}
								<button
									type="button"
									class="btn btn-ghost btn-sm"
									disabled={busy || loading || aligning}
									onclick={cancelReplacement}
								>
									Cancel replacement
								</button>
							{/if}
							<button
								type="submit"
								class="btn btn-primary btn-sm"
								disabled={busy ||
									needsStatusRefresh ||
									loading ||
									aligning ||
									!image ||
									drawing ||
									dragging ||
									!validCorners(corners)}
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
				{:else if allowed && !templateReady}
					<p class="text-sm text-warning" role="status">
						{templateSetupIssue?.message} Reference: {templateSetupIssue?.code}.
					</p>
				{/if}
				{#if ready}
					{#if documentBlock}
						<p role="alert" class="rounded-xl bg-warning/10 p-4 text-sm">
							{documentBlock}
							<a class="link font-semibold" href="#required-documents">Upload required documents</a>
						</p>
					{:else if documents.error}
						<p role="alert" class="text-sm text-error">
							Could not check required documents. Refresh before requesting enrollment.
						</p>
					{/if}
					<div
						class="flex flex-col gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"
					>
						<div>
							<h3 class="text-sm font-bold">
								{identityReviewNeeded
									? 'Manual identity review needed'
									: 'Ready for Registrar review'}
							</h3>
							<p class="mt-1 text-xs text-base-content/70">
								{identityReviewNeeded
									? 'Template and office checks passed. Send your request so the Registrar/admin can check your name and student number. They may ask for another upload. Enrollment waits for their verification.'
									: 'Send your request to continue. The Registrar reviews your clearance before completing enrollment.'}
							</p>
						</div>
						<button
							type="button"
							class="btn shrink-0 btn-primary btn-sm"
							disabled={busy ||
								needsStatusRefresh ||
								!documents.current ||
								!!documents.error ||
								!!documentBlock ||
								loading ||
								aligning ||
								!!image ||
								(!!report && !clearanceCanSubmit(report))}
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
				{#if report}
					<ClearanceFindings {report} staffVerified={submission?.status === 'verified'} />
				{:else if submission && !image && !loading}
					<details class="rounded-xl border border-base-300 p-4" open>
						<summary class="cursor-pointer text-sm font-semibold">
							Saved clearance check results
						</summary>
						<p class="mt-3 text-xs text-base-content/65">
							These results belong to your previously saved clearance, not a new upload.
						</p>
						<div class="mt-3">
							<ClearanceFindings
								report={submission.report}
								staffVerified={submission.status === 'verified'}
							/>
						</div>
					</details>
				{:else if image && !loading}
					<p class="text-xs text-base-content/65">
						No check results for this selected image yet. Choose Check and save clearance to
						validate it.
					</p>
				{/if}
			{/if}
			{#if message}
				<p role="status" class="rounded-xl bg-base-200/60 p-4 text-sm">{message}</p>
			{/if}
			{#if needsStatusRefresh}
				<button
					type="button"
					class="btn btn-outline btn-sm"
					onclick={() => window.location.reload()}
				>
					Refresh clearance status
				</button>
			{/if}
		</div>
	</section>
{/if}
