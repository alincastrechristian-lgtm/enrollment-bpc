<script lang="ts">
	import { getClearanceSettings, uploadClearanceTemplate } from '#lib/actions/clearance.remote.js';
	import { showError, showLoading, showSuccess } from '#lib/components/Popup/Popup.svelte.js';
	import { getErrorMessage } from '#lib/errors.js';
	import { resolve } from '$app/paths';
	import { ClipboardCheck, FileImage, RotateCcw, Save, Upload } from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import ClearanceTest from './ClearanceTest.svelte';
	import TemplateSetup from './TemplateSetup.svelte';

	const settings = getClearanceSettings();
	let busy = $state(false);
	let testBusy = $state(false);
	let setupBusy = $state(false);
	let preview = $state('');
	let selectedName = $state('');
	let previewError = $state(false);
	let feedback = $state('');
	function clearSelection() {
		if (preview) URL.revokeObjectURL(preview);
		preview = '';
		selectedName = '';
		previewError = false;
	}
	function selectFile(event: Event) {
		clearSelection();
		feedback = '';
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		if (
			!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
			file.size > 10 * 1024 * 1024 ||
			!file.size
		) {
			(event.currentTarget as HTMLInputElement).value = '';
			showError('Choose a JPG, PNG or WebP image up to 10 MiB.');
			return;
		}
		preview = URL.createObjectURL(file);
		selectedName = file.name;
	}
	onDestroy(clearSelection);
	function imageUrl(revision: string) {
		return `${resolve('/user/clearance-template')}?${new URLSearchParams({ revision })}`;
	}
	function uploaded(value: string) {
		return new Intl.DateTimeFormat('en-PH', {
			timeZone: 'Asia/Manila',
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}
</script>

<svelte:head><title>Clearance Settings | BPC Enrollment System</title></svelte:head>

<section class="space-y-6" aria-label="Clearance template settings">
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold">Clearance settings</h1>
			<p class="mt-1 text-sm text-base-content/65">
				Manage the blank form used as the clearance reference.
			</p>
		</div>
	</header>
	{#if settings.error}
		<div class="alert alert-error" role="alert">
			Could not load clearance settings. Refresh the page and try again.
		</div>
	{:else if settings.current}
		{@const current = settings.current}
		{#if !current.configured}
			<p class="alert alert-warning" role="status">
				File storage is not configured. Configure storage before uploading a template.
			</p>
		{/if}
		<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
			<form
				{...uploadClearanceTemplate.enhance(async (form) => {
					if (busy || testBusy || setupBusy || previewError) return;
					busy = true;
					feedback = '';
					showLoading('Saving clearance template...');
					try {
						if (await form.submit()) {
							form.element.reset();
							clearSelection();
							feedback = form.result?.cleanupWarning
								? 'Template saved. The previous file could not be removed from storage.'
								: 'Clearance template saved successfully.';
							showSuccess(feedback);
						} else showError('Choose a supported image up to 10 MiB.');
					} catch (caught) {
						showError(
							getErrorMessage(
								caught,
								'Could not save the template. Check storage connectivity and try again.'
							)
						);
					} finally {
						busy = false;
					}
				})}
				enctype="multipart/form-data"
				aria-busy={busy}
				class="portal-panel min-w-0"
			>
				<input
					{...uploadClearanceTemplate.fields.revision.as(
						'hidden',
						current.template?.revision ?? ''
					)}
				/>
				<div class="space-y-5 p-5 sm:p-6">
					<div class="flex items-center gap-3">
						<div class="rounded-xl bg-primary/10 p-2.5 text-primary">
							<ClipboardCheck size={22} aria-hidden="true" />
						</div>
						<div>
							<h2 class="font-bold">Reference template</h2>
							<p class="text-xs text-base-content/60">Upload a clean, unfilled clearance form.</p>
						</div>
					</div>
					{#if current.template}
						<div class="space-y-3 rounded-xl border border-base-300 bg-base-200/50 p-4">
							<div class="flex items-start gap-2">
								<FileImage size={18} class="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
								<div class="min-w-0">
									<p class="text-sm font-semibold break-all">{current.template.filename}</p>
									<p class="mt-1 text-xs text-base-content/60">
										{(current.template.size / 1024 / 1024).toFixed(2)} MiB · Updated {uploaded(
											current.template.uploadedAt
										)}
									</p>
								</div>
							</div>
							<a
								href={imageUrl(current.template.revision)}
								target="_blank"
								rel="noopener noreferrer"
								class="block overflow-hidden rounded-lg border border-base-300 bg-white"
								aria-label="Open saved clearance template"
							>
								<img
									src={imageUrl(current.template.revision)}
									alt="Saved blank clearance template"
									class="max-h-96 w-full object-contain"
								/>
							</a>
						</div>
					{:else}
						<div
							class="rounded-xl border border-dashed border-base-300 bg-base-200/40 p-8 text-center"
						>
							<FileImage size={36} class="mx-auto text-base-content/35" aria-hidden="true" />
							<h3 class="mt-3 text-sm font-semibold">No template uploaded</h3>
							<p class="mt-1 text-xs text-base-content/60">
								Add the official blank clearance form to get started.
							</p>
						</div>
					{/if}
					<label class="block space-y-2">
						<span class="text-sm font-semibold">Choose template image</span>
						<input
							{...uploadClearanceTemplate.fields.file.as('file')}
							type="file"
							accept="image/jpeg,image/png,image/webp"
							class="file-input w-full border-base-300 bg-base-200"
							onchange={selectFile}
							disabled={busy || testBusy || setupBusy || !current.configured}
							required
							aria-describedby="template-file-help"
						/>
					</label>
					<p id="template-file-help" class="text-xs text-base-content/60">
						JPG, PNG or WebP · Maximum 10 MiB. Include the complete form, with readable printed
						headings and no student details.
					</p>
					{#if preview}
						<div class="space-y-2">
							<p class="text-sm font-semibold break-all">New template: {selectedName}</p>
							<img
								src={preview}
								alt="Selected clearance template preview"
								class="max-h-96 w-full rounded-lg border border-base-300 bg-white object-contain"
								onerror={() => {
									previewError = true;
								}}
							/>
							{#if previewError}
								<p class="text-sm text-error" role="alert">
									This image could not be opened. Choose another file.
								</p>
							{/if}
						</div>
					{/if}
					{#each uploadClearanceTemplate.fields.allIssues() ?? [] as issue (issue.message)}
						<p role="alert" class="text-sm text-error">{issue.message}</p>
					{/each}
					{#if feedback}
						<p role="status" class="text-sm text-success">{feedback}</p>
					{/if}
				</div>
				<div
					class="flex flex-wrap items-center justify-end gap-3 border-t border-base-300 bg-base-200/30 px-5 py-4 sm:px-6"
				>
					<button
						type="reset"
						class="btn btn-ghost btn-sm"
						onclick={clearSelection}
						disabled={busy || testBusy || setupBusy || !preview}
					>
						<RotateCcw size={15} aria-hidden="true" />Discard
					</button>
					<button
						type="submit"
						class="btn btn-primary btn-sm"
						disabled={busy ||
							testBusy ||
							setupBusy ||
							!current.configured ||
							!preview ||
							previewError}
					>
						{#if busy}
							<span class="loading loading-xs loading-spinner" aria-hidden="true"></span>
						{:else}
							<Save size={16} aria-hidden="true" />
						{/if}
						{busy ? 'Saving...' : current.template ? 'Replace template' : 'Save template'}
					</button>
				</div>
			</form>
			<aside class="portal-panel space-y-4 p-5 sm:p-6" aria-label="Template guidance">
				<div class="flex items-center gap-2 text-sm font-bold">
					<Upload size={18} class="text-primary" aria-hidden="true" />Before uploading
				</div>
				<p class="text-sm leading-relaxed text-base-content/70">
					Use the official blank clearance form. Keep all four borders visible and the image
					upright.
				</p>
				<p class="text-sm leading-relaxed text-base-content/70">
					After uploading, mark the printed details and save their areas below. Replacing the image
					clears its previous area setup.
				</p>
				<div class="rounded-lg bg-base-200 p-3 text-xs leading-relaxed text-base-content/65">
					Only administrators can upload or replace this template. The file is stored privately in
					Garage.
				</div>
			</aside>
		</div>
		{#if current.template}
			{#key current.template.revision}
				<TemplateSetup
					template={current.template}
					disabled={busy || testBusy}
					onbusychange={(value) => {
						setupBusy = value;
					}}
				/>
				<ClearanceTest
					template={current.template}
					disabled={busy || setupBusy}
					onbusychange={(value) => {
						testBusy = value;
					}}
				/>
			{/key}
		{:else}
			<div class="portal-panel p-5 text-sm text-base-content/65 sm:p-6">
				Save a reference template to enable clearance testing here.
			</div>
		{/if}
	{:else}
		<div role="status" class="portal-panel flex items-center gap-3 p-6 text-sm">
			<span class="loading loading-sm loading-spinner" aria-hidden="true"></span>
			Loading clearance settings...
		</div>
	{/if}
</section>
