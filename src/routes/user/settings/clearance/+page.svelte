<script lang="ts">
	import {
		getClearanceSettings,
		uploadClearanceTemplate,
		reuseClearanceTemplate,
		activateClearanceTemplate,
		deleteClearanceTemplate
	} from '#lib/actions/clearance.remote.js';
	import {
		showError,
		showLoading,
		showSuccess,
		showYesNo
	} from '#lib/components/Popup/Popup.svelte.js';
	import { getErrorMessage } from '#lib/errors.js';
	import { resolve } from '$app/paths';
	import { ClipboardCheck, FileImage, RotateCcw, Save, Upload, Trash2 } from '@lucide/svelte';
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
	let selectedId = $state(0);
	let creating = $state(false);
	let reusing = $state(false);
	let dirty = $state(false);
	let reset = $state(0);
	let semester = $state('2');
	let schoolYearStart = $state(new Date().getFullYear());
	let sourceRevision = $state('');
	let preserveAreas = $state(false);
	const templates = $derived(settings.current?.templates ?? []);
	const selected = $derived(
		templates.find((template) => template.id === selectedId) ?? templates[0] ?? null
	);
	const current = $derived(
		settings.current
			? { configured: settings.current.configured, template: creating ? null : selected }
			: null
	);
	function beginNew(reuse = false) {
		if (locked || dirty) return;
		clearSelection();
		replacing = false;
		reusing = reuse;
		creating = !reuse;
		semester = String(selected?.semester ?? 2);
		schoolYearStart = selected?.schoolYearStart ?? new Date().getFullYear();
		sourceRevision =
			(selected?.definition
				? selected.revision
				: templates.find((template) => template.definition)?.revision) ?? '';
	}
	async function reuse() {
		if (locked || dirty) return;
		busy = true;
		try {
			const result = await reuseClearanceTemplate({
				revision: sourceRevision,
				semester: Number(semester),
				schoolYearStart: Number(schoolYearStart)
			});
			selectedId = result.id;
			reusing = false;
			creating = false;
			workspace = 'setup';
			setupStep = 'printed';
			showSuccess(
				'Draft created with copied area mappings. Review the reference image and boxes before activation.'
			);
		} catch (cause) {
			showError(getErrorMessage(cause, 'Could not reuse the template.'));
		} finally {
			busy = false;
		}
	}
	async function activate() {
		if (!selected || locked || dirty) return;
		busy = true;
		try {
			const active = templates.find(
				(template) =>
					template.active &&
					template.semester === selected.semester &&
					template.schoolYearStart === selected.schoolYearStart
			);
			await activateClearanceTemplate({
				revision: selected.revision,
				activeRevision: active?.revision ?? ''
			});
			workspace = 'test';
			showSuccess(
				'Template activated for this term. Other terms and previous submissions are unchanged.'
			);
		} catch (cause) {
			showError(getErrorMessage(cause, 'Could not activate the template.'));
		} finally {
			busy = false;
		}
	}
	async function removeTemplate() {
		if (!selected || locked || dirty || selected.inUse) return;
		const template = selected;
		busy = true;
		try {
			const confirmed = await showYesNo({
				title: 'Delete clearance template?',
				message: `Delete ${template.filename} (version #${template.id}) for ${template.schoolYearStart ? `SY ${template.schoolYearStart}-${template.schoolYearStart + 1}, Semester ${template.semester}` : 'the unassigned term'}?`,
				warning: true,
				hintText: template.active
					? 'This is the active template. Students in this term will be unable to upload clearance until another template is activated. This deletion cannot be undone.'
					: 'This permanently removes this template version. Student submissions and images shared by other versions are kept.',
				yesText: 'Delete template',
				noText: 'Cancel'
			});
			if (!confirmed) return;
			showLoading('Deleting template...');
			const result = await deleteClearanceTemplate({
				revision: template.revision,
				confirmed: 'yes'
			});
			selectedId = 0;
			workspace = 'setup';
			clearSelection();
			showSuccess(
				result.cleanupWarning
					? 'Template deleted. Its unused image could not be removed from storage.'
					: 'Template deleted.'
			);
		} catch (cause) {
			showError(getErrorMessage(cause, 'Could not delete the template. Refresh and try again.'));
		} finally {
			busy = false;
		}
	}
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
	{:else if current}
		<div class="portal-panel space-y-4 p-4 sm:p-5">
			<div class="flex flex-wrap items-end gap-3">
				<label class="min-w-0 flex-1 basis-64 space-y-2 text-sm font-semibold">
					<span>Template versions</span>
					<select
						aria-label="Template versions"
						class="select w-full"
						value={selected?.id ?? ''}
						disabled={locked || dirty || creating || reusing || replacing || !templates.length}
						onchange={(event) => {
							selectedId = Number(event.currentTarget.value);
							workspace = templates.find((template) => template.id === selectedId)?.activatedAt
								? 'test'
								: 'setup';
						}}
					>
						{#if !templates.length}
							<option value="">No templates yet</option>
						{/if}
						{#each templates as template (template.id)}
							<option value={template.id}>
								{template.schoolYearStart
									? `${template.schoolYearStart}-${template.schoolYearStart + 1} · Semester ${template.semester}`
									: 'Unassigned term'} · {template.active
									? 'Active'
									: template.activatedAt
										? 'Previous version'
										: 'Draft'} · #{template.id}
							</option>
						{/each}
					</select>
				</label>
				<button
					type="button"
					class="btn btn-outline btn-sm"
					disabled={locked || dirty || creating || reusing || replacing || !current.configured}
					onclick={() => beginNew()}
				>
					Add template
				</button>
				<button
					type="button"
					class="btn btn-outline btn-sm"
					disabled={locked ||
						dirty ||
						creating ||
						reusing ||
						replacing ||
						!templates.some((template) => template.definition)}
					onclick={() => beginNew(true)}
				>
					Reuse existing template
				</button>
			</div>
			<p class="text-xs text-base-content/65">
				One active template per school year and semester. Published versions stay read-only; edits
				belong in a new draft.
			</p>
			{#if dirty}
				<div
					class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warning/10 p-3 text-xs"
				>
					<p>Save or discard your edits before switching versions or activating.</p>
					<button
						type="button"
						class="btn btn-ghost btn-xs"
						disabled={locked}
						onclick={() => {
							dirty = false;
							reset += 1;
						}}
					>
						Discard unsaved edits
					</button>
				</div>
			{/if}
		</div>
		{#if reusing}
			<form
				class="portal-panel space-y-4 p-5"
				onsubmit={(event) => {
					event.preventDefault();
					void reuse();
				}}
			>
				<h2 class="font-bold">Reuse template mappings</h2>
				<p class="text-sm text-base-content/65">
					Copies printed areas, office rows, checkboxes, signatures and personal input boxes into a
					draft. A different term requires a new reference image with the correct printed semester
					and year.
				</p>
				<label class="block space-y-2 text-sm">
					<span>Source template</span>
					<select
						aria-label="Source template"
						class="select w-full"
						bind:value={sourceRevision}
						disabled={locked}
						required
					>
						<option value="" disabled>Choose a saved template</option>
						{#each templates.filter((template) => template.definition) as template (template.id)}
							<option value={template.revision}>
								{template.schoolYearStart}-{(template.schoolYearStart ?? 0) + 1} · Semester {template.semester}
								· #{template.id} · {template.filename}
							</option>
						{/each}
					</select>
				</label>
				<div class="grid gap-3 sm:grid-cols-2">
					<label class="space-y-2 text-sm">
						<span>Target school year start</span>
						<input
							class="input w-full"
							type="number"
							min="2000"
							max="2098"
							step="1"
							bind:value={schoolYearStart}
							disabled={locked}
							required
						/>
					</label>
					<label class="space-y-2 text-sm">
						<span>Target semester</span>
						<select
							aria-label="Target semester"
							class="select w-full"
							bind:value={semester}
							disabled={locked}
						>
							<option value="1">1st Semester</option>
							<option value="2">2nd Semester</option>
						</select>
					</label>
				</div>
				<div class="flex justify-end gap-2">
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						disabled={locked}
						onclick={() => (reusing = false)}
					>
						Cancel reuse
					</button>
					<button type="submit" class="btn btn-primary btn-sm" disabled={locked || !sourceRevision}>
						Create draft
					</button>
				</div>
			</form>
		{/if}
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
					<p class="text-xs font-semibold tracking-wide text-primary uppercase">
						{current.template.active
							? 'Active template'
							: current.template.activatedAt
								? 'Previous published version'
								: 'Draft template'}
					</p>
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
					disabled={locked || dirty || replacing || reusing || !!current.template.activatedAt}
					onclick={() => {
						replacing = true;
						preserveAreas = !!current.template?.definition;
					}}
				>
					<Upload size={15} aria-hidden="true" />Replace image
				</button>
				<button
					type="button"
					class="btn btn-ghost text-error btn-sm"
					disabled={locked || dirty || replacing || reusing || current.template.inUse}
					onclick={removeTemplate}
					aria-describedby={current.template.inUse ? 'template-delete-protection' : undefined}
				>
					<Trash2 size={15} aria-hidden="true" />Delete template
				</button>
			</div>
			{#if current.template.inUse}
				<p id="template-delete-protection" class="text-xs text-base-content/65">
					This version is used by student submissions and cannot be deleted. It is retained for
					clearance history.
				</p>
			{/if}
			{#if current.template.needsImageUpdate}
				<p role="status" class="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
					Upload an updated reference image showing this draft's semester and school year. Existing
					area mappings can be kept, then reviewed before activation.
				</p>
			{/if}
			{#if !current.template.activatedAt}
				<div
					class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"
				>
					<p class="text-sm">This draft is not available to students until activated.</p>
					<button
						type="button"
						class="btn btn-primary btn-sm"
						disabled={locked ||
							dirty ||
							replacing ||
							reusing ||
							!current.template.definition ||
							current.template.needsImageUpdate}
						onclick={activate}
					>
						Activate for this term
					</button>
				</div>
			{/if}
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
								creating = false;
								if (form.result?.id) selectedId = form.result.id;
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
					<input
						{...uploadClearanceTemplate.fields.preserveAreas.as(
							'hidden',
							preserveAreas && replacing ? 'yes' : 'no'
						)}
					/>
					{#if current.template}
						<input
							{...uploadClearanceTemplate.fields.semester.as(
								'hidden',
								String(current.template.semester ?? 2)
							)}
						/>
						<input
							{...uploadClearanceTemplate.fields.schoolYearStart.as(
								'hidden',
								String(current.template.schoolYearStart ?? schoolYearStart)
							)}
						/>
					{:else}
						<input
							{...uploadClearanceTemplate.fields.schoolYearStart.as(
								'hidden',
								String(schoolYearStart)
							)}
						/>
					{/if}
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
						{#if !current.template}
							<div class="grid gap-3 sm:grid-cols-2">
								<label class="space-y-2 text-sm">
									<span>School year start</span>
									<input
										type="number"
										class="input w-full"
										min="2000"
										max="2098"
										step="1"
										bind:value={schoolYearStart}
										disabled={busy}
										required
									/>
								</label>
								<label class="space-y-2 text-sm">
									<span>Semester</span>
									<select
										name="semester"
										aria-label="Semester"
										class="select w-full"
										bind:value={semester}
										disabled={busy}
									>
										<option value="1">1st Semester</option>
										<option value="2">2nd Semester</option>
									</select>
								</label>
							</div>
							<p class="text-xs text-base-content/65">
								School year {schoolYearStart}-{Number(schoolYearStart) + 1}. Upload a reference
								printed for this term.
							</p>
						{/if}
						{#if current.template}
							<p class="rounded-lg bg-warning/10 p-3 text-sm text-base-content/75">
								This replaces only the draft image. Published templates and student submissions stay
								unchanged.
							</p>
							{#if current.template.definition}
								<label class="flex items-center gap-3 text-sm">
									<input
										type="checkbox"
										class="checkbox checkbox-sm"
										bind:checked={preserveAreas}
										disabled={busy}
									/>
									Keep existing area mappings (same layout)
								</label>
							{/if}
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
						{:else if creating && selected}
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								disabled={busy}
								onclick={() => {
									clearSelection();
									creating = false;
								}}
							>
								Cancel new template
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
			<div hidden={replacing || reusing} class="space-y-4">
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
				{#key `${current.template.revision}:${reset}`}
					<div hidden={workspace !== 'setup'}>
						{#if current.template.activatedAt}
							<p class="portal-panel p-5 text-sm text-base-content/65">
								Published templates are read-only. Choose Reuse existing template to edit a copy, or
								open Test clearance to check a file.
							</p>
						{:else}
							<TemplateSetup
								template={current.template}
								bind:step={setupStep}
								disabled={busy || testBusy || replacing}
								onbusychange={(value) => {
									setupBusy = value;
								}}
								ondirtychange={(value) => (dirty = value)}
							/>
						{/if}
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
