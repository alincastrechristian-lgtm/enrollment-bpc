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
	let replacing = $state(false);
	let workspace = $state<'setup' | 'test'>('setup');
	let setupStep = $state<'outline' | 'printed' | 'offices' | 'personal'>('printed');
	const locked = $derived(busy || testBusy || setupBusy);
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
		{#if current.template}
			<div class="portal-panel flex flex-wrap items-center gap-4 p-4 sm:p-5">
				<a
					href={imageUrl(current.template.revision)}
					target="_blank"
					rel="noopener noreferrer"
					class="shrink-0 overflow-hidden rounded-lg border border-base-300 bg-white"
					aria-label="Open saved clearance template"
				>
					<img
						src={imageUrl(current.template.revision)}
						alt="Saved blank clearance template"
						class="h-20 w-24 object-contain"
					/>
				</a>
				<div class="min-w-0 flex-1 basis-48 space-y-1">
					<p class="text-xs font-semibold tracking-wide text-primary uppercase">Current template</p>
					<p class="text-sm font-bold break-all">{current.template.filename}</p>
					<p class="text-xs text-base-content/60">
						Updated {uploaded(current.template.uploadedAt)} · {(
							current.template.size /
							1024 /
							1024
						).toFixed(2)} MiB
					</p>
					{#if current.template.definition}
						<p class="text-xs text-base-content/70">
							Semester {current.template.definition.semester} · {current.template.definition
								.schoolYear} · {current.template.definition.areas.length} printed areas · {current
								.template.definition.officeRows?.length ?? 0} offices
						</p>
					{:else}
						<p class="text-xs text-warning">
							Set up the form outline and checking areas to get started.
						</p>
					{/if}
				</div>
				<button
					type="button"
					class="btn btn-outline btn-sm"
					disabled={locked || replacing}
					onclick={() => {
						replacing = true;
					}}
				>
					<Upload size={15} aria-hidden="true" />Replace image
				</button>
			</div>
		{/if}
		{#if !current.template || replacing}
			<div>
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
								replacing = false;
								workspace = 'setup';
								setupStep = 'outline';
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
								<h2 class="font-bold">
									{current.template ? 'Replace reference image' : 'Upload reference template'}
								</h2>
								<p class="text-xs text-base-content/60">Upload a clean, unfilled clearance form.</p>
							</div>
						</div>
						{#if current.template}
							<p class="rounded-lg bg-warning/10 p-3 text-sm text-base-content/75">
								Replacing the image clears its saved areas. Your current template stays active until
								you save the replacement.
							</p>
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
						{#if current.template}
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								disabled={busy}
								onclick={(event) => {
									event.currentTarget.closest('form')?.reset();
									clearSelection();
									replacing = false;
								}}
							>
								Cancel replacement
							</button>
						{/if}
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
			</div>
		{/if}
		{#if current.template}
			<div hidden={replacing} class="space-y-4">
				<nav
					aria-label="Clearance workspace"
					class="flex flex-wrap gap-1 rounded-xl border border-base-300 bg-base-200/50 p-1"
				>
					<button
						type="button"
						class={`btn flex-1 btn-sm sm:flex-none ${workspace === 'setup' ? 'bg-base-100 shadow-sm' : 'btn-ghost'}`}
						aria-pressed={workspace === 'setup'}
						disabled={locked}
						onclick={() => {
							workspace = 'setup';
						}}
					>
						<ClipboardCheck size={16} aria-hidden="true" />Template setup
					</button>
					<button
						type="button"
						class={`btn flex-1 btn-sm sm:flex-none ${workspace === 'test' ? 'bg-base-100 shadow-sm' : 'btn-ghost'}`}
						aria-pressed={workspace === 'test'}
						disabled={locked}
						onclick={() => {
							workspace = 'test';
						}}
					>
						<FileImage size={16} aria-hidden="true" />Test clearance
					</button>
				</nav>
				{#key current.template.revision}
					<div hidden={workspace !== 'setup'}>
						<TemplateSetup
							template={current.template}
							bind:step={setupStep}
							disabled={busy || testBusy || replacing}
							onbusychange={(value) => {
								setupBusy = value;
							}}
						/>
					</div>
					<div hidden={workspace !== 'test'}>
						<ClearanceTest
							template={current.template}
							disabled={busy || setupBusy || replacing}
							onbusychange={(value) => {
								testBusy = value;
							}}
						/>
					</div>
				{/key}
			</div>
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
