<script lang="ts">
	import { previewStudentCsv, importStudentCsv } from '#lib/actions/user.remote.js';
	import { STUDENT_CSV_MAX_BYTES, STUDENT_CSV_TEMPLATE } from '#lib/student-csv.js';
	import { getErrorMessage } from '#lib/errors.js';
	import { refreshAll } from '$app/navigation';
	import { Download, Upload, X } from '@lucide/svelte';
	let dialog: HTMLDialogElement;
	let csv = $state(''),
		filename = $state(''),
		error = $state('');
	let busy = $state<'preview' | 'import' | null>(null);
	let preview = $state<Awaited<ReturnType<typeof previewStudentCsv>>>();
	let outcome = $state<Awaited<ReturnType<typeof importStudentCsv>>>();
	const created = $derived(outcome?.results.filter((row) => row.status === 'created').length ?? 0);
	export function open() {
		if (busy) return;
		csv = '';
		filename = '';
		error = '';
		preview = undefined;
		outcome = undefined;
		dialog.showModal();
	}
	async function choose(event: Event) {
		const input = event.currentTarget as HTMLInputElement,
			file = input.files?.[0];
		input.value = '';
		if (!file || busy) return;
		csv = '';
		filename = file.name;
		error = '';
		preview = undefined;
		outcome = undefined;
		if (file.size > STUDENT_CSV_MAX_BYTES) {
			error = 'CSV must be 256 KB or smaller.';
			return;
		}
		if (!file.name.toLowerCase().endsWith('.csv')) {
			error = 'Choose a .csv file.';
			return;
		}
		busy = 'preview';
		try {
			csv = await file.text();
			preview = await previewStudentCsv({ csv });
		} catch (cause) {
			error = getErrorMessage(cause, 'Could not validate this CSV. Check the file and try again.');
		} finally {
			busy = null;
		}
	}
	async function importRows() {
		if (busy || !preview?.rows.length || preview.issues.length || outcome) return;
		busy = 'import';
		error = '';
		try {
			outcome = await importStudentCsv({ csv });
			if (outcome.issues.length) preview = { rows: preview.rows, issues: outcome.issues };
			try {
				await refreshAll();
			} catch {
				error =
					'Import results are shown below, but the student list could not refresh. Reload the list before retrying any rows.';
			}
		} catch (cause) {
			error = getErrorMessage(
				cause,
				'Import could not be confirmed. Refresh the student list before retrying; some students may already have been created.'
			);
			// Prevent blind retries after a lost response. Re-select a file after reviewing the list.
			preview = undefined;
			try {
				await refreshAll();
			} catch {
				/* Keep the recovery message visible. */
			}
		} finally {
			busy = null;
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="portal-dialog modal"
	aria-labelledby="student-csv-title"
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
>
	<div
		class="popup-accent-panel portal-dialog-panel modal-box flex max-h-[calc(100dvh-2rem)] max-w-4xl flex-col overflow-hidden p-0"
		aria-busy={!!busy}
	>
		<header class="portal-dialog-header justify-between">
			<div class="flex items-start gap-4">
				<span class="portal-dialog-icon bg-primary/10 text-primary">
					<Upload class="size-6" aria-hidden="true" />
				</span>
				<div>
					<h2 id="student-csv-title" class="portal-dialog-title">Import students from CSV</h2>
					<p class="portal-dialog-description">
						Review required details before creating student accounts.
					</p>
				</div>
			</div>
			<button
				type="button"
				class="btn btn-square btn-ghost btn-sm"
				aria-label="Close CSV import"
				disabled={!!busy}
				onclick={() => dialog.close()}
			>
				<X class="size-4" aria-hidden="true" />
			</button>
		</header>
		<div class="portal-dialog-body space-y-5 overflow-y-auto">
			<div class="space-y-3 rounded-xl border border-base-300 bg-base-200/40 p-4 text-sm">
				<p>
					Required columns: <strong>
						first_name, last_name, email, birth_date, sex, contact_number, address
					</strong>
					.
					<strong>middle_name</strong>
					is optional.
				</p>
				<p class="text-xs text-base-content/65">
					Birth date: YYYY-MM-DD, age 17 or older. Sex: female or male. Contact number: 11 digits;
					keep this column as text to preserve its leading zero. Quote addresses containing commas.
					Maximum 100 students and 256 KB per file.
				</p>
				<p class="text-xs text-base-content/65">
					Student numbers are generated automatically. Accounts are created without enrollment, and
					setup invitations are emailed to each student. Existing emails and duplicate rows must be
					corrected before import.
				</p>
				<a
					class="btn btn-outline btn-sm"
					href={`data:text/csv;charset=utf-8,${encodeURIComponent(STUDENT_CSV_TEMPLATE)}`}
					download="students-template.csv"
				>
					<Download class="size-4" aria-hidden="true" />Download CSV template
				</a>
			</div>
			<label class="block space-y-2">
				<span class="text-sm font-semibold">Student CSV file</span>
				<input
					type="file"
					accept=".csv,text/csv"
					class="file-input w-full bg-base-200"
					disabled={!!busy}
					onchange={choose}
				/>
			</label>
			{#if filename}
				<p class="text-sm font-semibold break-all">{filename}</p>
			{/if}
			{#if busy}
				<p role="status" class="text-sm">
					{busy === 'preview'
						? 'Validating student rows…'
						: 'Creating accounts and sending setup invitations. Keep this page open…'}
				</p>
			{/if}
			{#if error}
				<p role="alert" class="text-sm text-error">{error}</p>
			{/if}
			{#if preview?.issues.length}
				<div role="alert" class="rounded-xl border border-error/30 bg-error/5 p-4">
					<p class="text-sm font-semibold">
						Fix these issues and upload the CSV again. No students were imported.
					</p>
					<ul class="mt-2 list-inside list-disc space-y-1 text-xs">
						{#each preview.issues as issue, index (index)}
							<li>Row {issue.row}: {issue.message}</li>
						{/each}
					</ul>
				</div>
			{:else if preview && !outcome}
				<p class="text-sm font-semibold">{preview.rows.length} students ready to import</p>
				<div class="overflow-x-auto rounded-xl border border-base-300">
					<table class="table table-sm">
						<caption class="sr-only">Student CSV preview</caption>
						<thead>
							<tr>
								<th>Row</th>
								<th>Name</th>
								<th>Email</th>
								<th>Birth date</th>
								<th>Sex</th>
								<th>Contact number</th>
								<th>Address</th>
							</tr>
						</thead>
						<tbody>
							{#each preview.rows as row (row.row)}
								<tr>
									<td>{row.row}</td>
									<td>
										{[row.student.firstName, row.student.middleName, row.student.lastName]
											.filter(Boolean)
											.join(' ')}
									</td>
									<td>{row.student.email}</td>
									<td>{row.student.birthDate}</td>
									<td>{row.student.sex}</td>
									<td>{row.student.contactNumber}</td>
									<td>{row.student.address}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
			{#if outcome?.results.length}
				<p role="status" class="text-sm font-semibold">
					{created} of {outcome.results.length} students created. Review each result before retrying any
					rows.
				</p>
				<div class="overflow-x-auto rounded-xl border border-base-300">
					<table class="table table-sm">
						<caption class="sr-only">Student import results</caption>
						<thead>
							<tr>
								<th>Row</th>
								<th>Email</th>
								<th>Student number</th>
								<th>Result</th>
							</tr>
						</thead>
						<tbody>
							{#each outcome.results as row (row.row)}
								<tr>
									<td>{row.row}</td>
									<td>{row.email}</td>
									<td>{row.studentId ?? '—'}</td>
									<td
										class:text-error={row.status === 'failed'}
										class:text-warning={row.status === 'created' && !row.invitationSent}
									>
										{row.message}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
		<footer class="portal-dialog-footer flex justify-end gap-3 border-t border-base-300 p-5">
			<button
				type="button"
				class="btn btn-outline btn-sm"
				disabled={!!busy}
				onclick={() => dialog.close()}
			>
				{outcome ? 'Close' : 'Cancel'}
			</button>
			<button
				type="button"
				class="btn btn-primary btn-sm"
				disabled={!!busy || !preview?.rows.length || !!preview.issues.length || !!outcome}
				onclick={importRows}
			>
				<Upload class="size-4" aria-hidden="true" />Import students
			</button>
		</footer>
	</div>
</dialog>
