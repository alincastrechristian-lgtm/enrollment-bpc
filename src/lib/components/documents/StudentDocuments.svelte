<script lang="ts">
	import { getStudentDocuments, uploadDocument } from '#lib/actions/documents.remote.js';
	import { DOCUMENT_LABELS, DOCUMENT_STATUS_LABELS } from '#lib/documents.js';
	import { getErrorMessage } from '#lib/errors.js';
	import { resolve } from '$app/paths';
	const documents = getStudentDocuments();
	let message = $state('');
</script>

<section
	id="required-documents"
	class="portal-panel scroll-mt-6 p-5 sm:p-6"
	aria-labelledby="documents-heading"
>
	<h2 id="documents-heading" class="text-lg font-bold">Required documents</h2>
	{#if documents.error}
		<p role="alert" class="mt-3 text-sm text-error">Could not load required documents.</p>
		<button class="btn mt-3 btn-outline btn-sm" onclick={() => documents.refresh().catch(() => {})}>
			Retry
		</button>
	{:else if !documents.current}
		<p class="mt-3 text-sm text-base-content/60" role="status">Loading documents…</p>
	{:else if !documents.current.items.length}
		<p class="mt-3 text-sm text-base-content/60">No documents requested by the Registrar.</p>
	{:else}
		<p class="mt-2 text-sm text-base-content/65">
			Upload every document requested below before requesting enrollment for your final semester.
			The Registrar must verify all copies before enrolling you.
		</p>
		<p class="mt-2 text-xs text-base-content/55">
			PDF, JPG, PNG or WebP · Up to 10 MiB each · Make sure every page is complete and readable.
		</p>
		{#if message}
			<p role="status" class="mt-4 text-sm">{message}</p>
		{/if}
		<div class="mt-5 grid gap-4 xl:grid-cols-2">
			{#each documents.current.items as item (item.id)}
				{@const upload = uploadDocument.for(item.id)}
				<article class="rounded-xl border border-base-300 p-4">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<h3 class="font-semibold">{DOCUMENT_LABELS[item.kind]}</h3>
						<span
							class:badge-success={item.status === 'verified'}
							class:badge-warning={item.status !== 'verified'}
							class="badge badge-sm"
						>
							{DOCUMENT_STATUS_LABELS[item.status]}
						</span>
					</div>
					<p class="mt-2 text-xs text-base-content/60">
						Required for Year {item.dueYearLevel}, Semester {item.dueSemester} enrollment.
					</p>
					{#if item.rejectionReason}
						<p class="mt-3 rounded-lg bg-error/10 p-3 text-sm">
							Registrar’s note: {item.rejectionReason}
						</p>
					{/if}
					{#if item.hasFile}
						<a
							class="mt-3 block truncate text-sm text-primary underline"
							href={resolve('/user/document-files/[id]', { id: item.id })}
						>
							Download {item.filename}
						</a>
					{/if}
					{#if item.status === 'requested' || item.status === 'rejected'}
						<form
							enctype="multipart/form-data"
							class="mt-4 space-y-3"
							{...upload.enhance(async (form) => {
								message = '';
								try {
									if (await form.submit()) {
										form.element.reset();
										message = `${DOCUMENT_LABELS[item.kind]} uploaded. Awaiting verification.`;
									} else message = 'Choose a valid file up to 10 MiB.';
								} catch (cause) {
									message = getErrorMessage(cause, 'Upload failed. Try again.');
								}
							})}
						>
							<input {...upload.fields.id.as('hidden', item.id)} />
							<input {...upload.fields.revision.as('hidden', String(item.revision))} />
							<label class="block text-xs font-semibold" for={`file-${item.id}`}>
								Choose {DOCUMENT_LABELS[item.kind]}
							</label>
							<input
								id={`file-${item.id}`}
								{...upload.fields.file.as('file')}
								accept="application/pdf,image/jpeg,image/png,image/webp"
								required
								class="file-input-bordered file-input w-full"
								disabled={!!upload.pending}
							/>
							<button class="btn btn-primary btn-sm" disabled={!!upload.pending}>
								{upload.pending
									? 'Uploading…'
									: item.status === 'rejected'
										? 'Upload replacement'
										: 'Upload document'}
							</button>
						</form>
					{:else}
						<p class="mt-3 text-xs text-base-content/60">
							{item.status === 'verified'
								? 'Verified by the Registrar. No further action needed.'
								: 'Your copy is awaiting Registrar review.'}
						</p>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</section>
