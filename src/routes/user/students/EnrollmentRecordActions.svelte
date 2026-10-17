<script lang="ts">
	import { reopenEnrollment, voidEnrollment } from '#lib/actions/enrollment.remote.js';
	import { showError, showSuccess, showYesNo } from '#lib/components/Popup/Popup.svelte.js';
	import { getErrorMessage } from '#lib/errors.js';
	import { refreshAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Ban, History, Pencil, RotateCcw, X } from '@lucide/svelte';
	import type { PageData } from './[userId]/enrollments/[enrollmentId]/$types';
	let { data, disabled = false }: { data: PageData; disabled?: boolean } = $props();
	let dialog: HTMLDialogElement;
	let isOpen = $state(false);

	let action = $state<'voided' | 'reopened'>('voided');
	let reason = $state('');
	let busy = $state(false);
	let message = $state('');
	const date = new Intl.DateTimeFormat('en-PH', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'Asia/Manila'
	});
	function open(kind: typeof action) {
		action = kind;
		reason = '';
		message = '';

		isOpen = true;
		dialog.showModal();
	}
	async function confirm() {
		if (busy || disabled) return;
		if (reason.trim().length < 5) {
			message = 'Explain the reason using at least 5 characters.';
			return;
		}
		busy = true;
		try {
			dialog.close();
			if (
				!(await showYesNo({
					title: action === 'voided' ? 'Void this enrollment?' : 'Reopen this enrollment?',
					message:
						action === 'voided'
							? 'This marks the enrollment as entered in error. Its subjects and grades remain in history, but it no longer counts toward reports or enrollment requirements. The student will be notified.'
							: 'Grades will return to draft. Clearance and academic follow-up verification will reset. Staff must finalize grades and verify clearance again. The student will be notified.',
					warning: true,
					yesText: action === 'voided' ? 'Void enrollment' : 'Reopen enrollment',
					noText: 'Cancel'
				}))
			) {
				dialog.showModal();
				return;
			}
			const input = {
				userId: data.student.id,
				enrollmentId: data.enrollment.id,
				revision: data.enrollment.revision,
				reason: reason.trim()
			};
			const result = await (action === 'voided' ? voidEnrollment(input) : reopenEnrollment(input));
			showSuccess(
				`Enrollment ${action}.${result.notificationSent ? ' Email sent.' : ' Email could not be sent; dashboard notification saved.'}`
			);
			await refreshAll();
		} catch (cause) {
			showError(getErrorMessage(cause, 'Could not update enrollment. Reload and try again.'));
		} finally {
			busy = false;
		}
	}
</script>

<section class="portal-panel p-5 sm:p-6" aria-labelledby="record-actions-heading">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h2 id="record-actions-heading" class="font-bold">Enrollment record</h2>
			<p class="mt-1 text-sm text-base-content/60">
				Correct mistakes with a recorded reason. Voiding is for records entered in error; dropping
				is for withdrawal.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			{#if data.canCorrect}
				<a
					class:btn-disabled={disabled || busy}
					aria-disabled={disabled || busy}
					tabindex={disabled || busy ? -1 : undefined}
					class="btn gap-2 border-base-300 btn-outline btn-sm"
					href={disabled || busy
						? undefined
						: resolve('/user/students/[userId]/enrollments/[enrollmentId]/edit', {
								userId: data.student.id,
								enrollmentId: data.enrollment.id
							})}
				>
					<Pencil class="size-4" aria-hidden="true" />Edit enrollment
				</a>
			{/if}
			{#if data.canReopen}
				<button
					type="button"
					class="btn gap-2 border-base-300 btn-outline btn-sm"
					disabled={disabled || busy}
					onclick={() => open('reopened')}
				>
					<RotateCcw class="size-4" aria-hidden="true" />Reopen enrollment
				</button>
			{/if}
			{#if data.canVoid}
				<button
					type="button"
					class="btn gap-2 btn-ghost text-error btn-sm"
					disabled={disabled || busy}
					onclick={() => open('voided')}
				>
					<Ban class="size-4" aria-hidden="true" />Void enrollment
				</button>
			{/if}
		</div>
	</div>
	{#if data.audit.length}
		<div class="mt-5 space-y-3 border-t border-base-300 pt-5">
			<h3 class="flex items-center gap-2 text-sm font-semibold">
				<History class="size-4 text-primary" aria-hidden="true" />Change history
			</h3>
			{#each data.audit as entry (entry.id)}
				<details class="rounded-xl border border-base-300 bg-base-200/30 p-4">
					<summary class="cursor-pointer text-sm">
						<span class="font-semibold capitalize">{entry.action}</span>
						by {entry.actorName}
						<span class="text-xs text-base-content/55">
							&middot; {date.format(entry.createdAt)}
						</span>
					</summary>
					<p class="mt-3 text-sm break-words whitespace-pre-wrap">{entry.reason}</p>
					<div class="mt-4 grid gap-4 lg:grid-cols-2">
						{#each [{ label: 'Before', snapshot: entry.before }, { label: 'After', snapshot: entry.after }] as version (version.label)}
							<div class="min-w-0 rounded-lg border border-base-300 bg-base-100 p-3">
								<h4 class="text-xs font-bold uppercase">{version.label}</h4>
								<p class="mt-2 text-sm">
									{version.snapshot.curriculum.programCode} &middot; {version.snapshot.enrollment
										.schoolYearStart}–{version.snapshot.enrollment.schoolYearStart + 1} &middot; Semester
									{version.snapshot.enrollment.semester} &middot; Year {version.snapshot.enrollment
										.yearLevel} &middot; Section {version.snapshot.enrollment.section}
								</p>
								<p class="mt-1 text-xs text-base-content/60 capitalize">
									{version.snapshot.enrollment.status} &middot; Grades {version.snapshot.enrollment
										.finalizedGrades
										? 'finalized'
										: 'draft'} &middot; Clearance {version.snapshot.enrollment.submittedClearance
										? 'verified'
										: 'unverified'}
								</p>
								<div class="mt-3 overflow-x-auto">
									<table class="table table-xs">
										<caption class="sr-only">{version.label} subjects and grades</caption>
										<thead>
											<tr>
												<th>Subject</th>
												<th>Units</th>
												<th>Grade</th>
											</tr>
										</thead>
										<tbody>
											{#each version.snapshot.subjects as subject (subject.id)}
												<tr>
													<td>{subject.subjectCode} — {subject.subjectName}</td>
													<td>{subject.units}</td>
													<td>{subject.grade ?? 'No grade'}</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							</div>
						{/each}
					</div>
				</details>
			{/each}
		</div>
	{/if}
</section>

<dialog
	bind:this={dialog}
	class="modal"
	aria-labelledby="change-record-title"
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
	onclose={() => (isOpen = false)}
>
	<div class="portal-panel popup-accent-panel modal-box max-w-lg space-y-5 p-6">
		<header class="flex items-start justify-between gap-3">
			<div>
				<h2 id="change-record-title" class="text-xl font-bold">
					{action === 'voided' ? 'Void enrollment' : 'Reopen enrollment'}
				</h2>
				<p class="mt-2 text-sm text-base-content/60">
					Enter a reason. It will be saved in the audit history and included in the student
					notification.
				</p>
			</div>
			<button
				type="button"
				class="btn btn-square btn-ghost btn-sm"
				aria-label="Close"
				disabled={busy}
				onclick={() => dialog.close()}
			>
				<X class="size-5" />
			</button>
		</header>
		<label class="block space-y-2">
			<span class="text-sm font-semibold">Reason</span>
			<textarea
				class="textarea min-h-28 w-full bg-base-200"
				bind:value={reason}
				maxlength="1000"
				minlength="5"
				required={isOpen}
				disabled={busy}
				placeholder="Explain what needs to be corrected..."></textarea>
		</label>
		{#if message}
			<p role="alert" class="text-sm text-error">{message}</p>
		{/if}
		<footer class="flex justify-end gap-2">
			<button
				type="button"
				class="btn btn-ghost btn-sm"
				disabled={busy}
				onclick={() => dialog.close()}
			>
				Cancel
			</button>
			<button
				type="button"
				class="btn btn-primary btn-sm"
				disabled={busy || reason.trim().length < 5}
				onclick={confirm}
			>
				{busy ? 'Saving...' : 'Continue'}
			</button>
		</footer>
	</div>
</dialog>
