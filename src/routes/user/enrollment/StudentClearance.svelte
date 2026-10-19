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
	import { resolve } from '$app/paths';
	import { getErrorMessage } from '#lib/errors.js';
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
	const current = $derived(progress.current?.current);
	const submission = $derived(progress.current?.submission);
	const template = $derived(progress.current?.template);
	const currentChecks = $derived(!submission || hasCurrentOfficeChecks(submission.report));
	const allowed = $derived(
		!!current?.finalizedGrades &&
			!['dropped', 'voided'].includes(current.status) &&
			!current.submittedClearance &&
			(!['requested', 'verified'].includes(submission?.status ?? '') ||
				(submission?.status === 'requested' && !currentChecks))
	);
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
	class="portal-panel space-y-4 p-5 sm:p-6"
	aria-label="Clearance and enrollment request"
	aria-busy={busy || loading}
>
	<h2 class="text-lg font-bold">Clearance and next enrollment</h2>
	<p class="text-sm text-base-content/65">
		Finalize grades → upload clearance → template and office checks → request enrollment → staff
		verifies clearance → Registrar/admin enrolls you.
	</p>
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
		<ol class="flex flex-wrap gap-2 text-xs" aria-label="Enrollment progress">
			<li class={`badge ${current.finalizedGrades ? 'badge-success' : 'badge-ghost'}`}>
				1. Grades {current.finalizedGrades ? 'finalized' : 'pending'}
			</li>
			<li
				class={`badge ${submission && currentChecks && submission.status !== 'invalidated' ? 'badge-success' : 'badge-ghost'}`}
			>
				2. Upload and checks
			</li>
			<li class={`badge ${submission?.requestedAt ? 'badge-success' : 'badge-ghost'}`}>
				3. Enrollment request
			</li>
			<li class={`badge ${current.submittedClearance ? 'badge-success' : 'badge-ghost'}`}>
				4. Staff verification
			</li>
			<li class="badge badge-ghost">5. Staff enrollment</li>
		</ol>
		{#if !current.finalizedGrades}
			<p class="text-sm text-base-content/65">
				Wait for staff to finalize your grades before uploading clearance.
			</p>
		{/if}
		{#if submission}
			<div class="space-y-2 rounded-xl border border-base-300 p-4">
				<p class="text-sm font-semibold">Saved clearance: {submission.filename}</p>
				<p class="text-sm">
					Status: <strong>{submission.status}</strong>
				</p>
				<a
					class="link text-sm"
					href={resolve('/user/clearance-files/[id]', { id: submission.id })}
					target="_blank"
					rel="noreferrer"
				>
					View saved clearance
				</a>
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
		{#if allowed && template?.definition}
			<form
				{...uploadClearance.enhance(async (form) => {
					if (busy || loading || drawing || dragging || !image || !validCorners(corners)) return;
					busy = true;
					message = '';
					report = undefined;
					try {
						if (await form.submit()) {
							report = form.result?.report;
							if (form.result?.success) {
								image = '';
								form.element.reset();
								message = 'Clearance checks passed and file saved. You can now request enrollment.';
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
				class="space-y-3"
			>
				<input {...uploadClearance.fields.enrollmentId.as('hidden', current.id)} />
				<input {...uploadClearance.fields.revision.as('hidden', String(current.revision))} />
				<input {...uploadClearance.fields.templateRevision.as('hidden', template.revision)} />
				<input {...uploadClearance.fields.corners.as('hidden', JSON.stringify(corners))} />
				<label class="block space-y-2 text-sm font-semibold">
					Upload clearance
					<input
						{...uploadClearance.fields.file.as('file')}
						bind:this={input}
						accept="image/jpeg,image/png,image/webp"
						class="file-input w-full"
						disabled={busy || loading}
						onchange={open}
					/>
				</label>
				<p class="text-xs text-base-content/65">
					JPG, PNG or WebP up to 10 MiB. Include all office marks and keep the form border visible.
					Checks run on the server; the saved file is private.
				</p>
				{#if image}
					<div class="max-w-3xl">
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
				<button
					type="submit"
					class="btn btn-primary btn-sm"
					disabled={busy || loading || !image || drawing || dragging || !validCorners(corners)}
				>
					{busy ? 'Checking clearance…' : 'Check and save clearance'}
				</button>
			</form>
		{:else if allowed}
			<p class="text-sm text-warning">
				Clearance template setup is not ready. Contact the Registrar.
			</p>
		{/if}
		{#if submission?.status === 'ready' && currentChecks}
			<button
				type="button"
				class="btn btn-primary"
				disabled={busy || loading || !!image || (!!report && !clearancePassed(report))}
				onclick={request}
			>
				Request enrollment
			</button>
		{/if}
		{#if current.submittedClearance && !submission}
			<p class="text-sm text-success">
				Your clearance was already verified by staff. Contact the Registrar to complete enrollment.
			</p>
		{/if}
		{#if report}
			<ClearanceFindings {report} />
		{:else if submission}
			<ClearanceFindings report={submission.report} />
		{:else}
			<p class="rounded-lg bg-base-200 p-3 text-xs text-base-content/65">
				Personal information verification is reserved for later. Name and student number are not
				checked yet.
			</p>
		{/if}
	{/if}
	{#if message}
		<p role="status" class="text-sm">{message}</p>
	{/if}
</section>
