<script lang="ts">
	import {
		createCurriculum,
		updateCurriculum,
		type CurriculumUpdateSchema
	} from '#lib/actions/curriculum.remote.js';
	import CatalogRecordDialog, {
		type CatalogRecord
	} from '#lib/components/Catalog/CatalogRecordDialog.svelte';
	import SearchableSelect from '#lib/components/Dropdown/SearchableSelect.svelte';
	import { showError, showSuccess } from '#lib/components/Popup/Popup.svelte.js';
	import type { Curriculum, curriculumSubject } from '#lib/schema.js';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { BookOpen, GraduationCap, Layers, Plus, Save, Trash2 } from '@lucide/svelte';
	import { untrack } from 'svelte';

	type CatalogOption = Omit<CatalogRecord, 'description'>;
	type DraftEntry = {
		key: string;
		id?: string;
		subjectId: string;
		yearLevel: number | undefined;
		semester: number;
		units: number | undefined;
	};
	let {
		curriculum = null,
		entries = [],
		programs,
		subjects
	}: {
		curriculum?: Curriculum | null;
		entries?: (typeof curriculumSubject.$inferSelect)[];
		programs: CatalogOption[];
		subjects: CatalogOption[];
	} = $props();
	let name = $state(untrack(() => curriculum?.name ?? ''));
	let programId = $state(untrack(() => curriculum?.programId ?? ''));
	let rows = $state<DraftEntry[]>(
		untrack(() =>
			entries.map((entry) => ({
				key: entry.id,
				id: entry.id,
				subjectId: entry.subjectId,
				yearLevel: entry.yearLevel,
				semester: entry.semester,
				units: entry.units
			}))
		)
	);
	const initial = untrack(() => JSON.stringify({ name, programId, rows }));
	const dirty = $derived(JSON.stringify({ name, programId, rows }) !== initial);
	const totalUnits = $derived(rows.reduce((total, entry) => total + (Number(entry.units) || 0), 0));
	const termCount = $derived(
		new Set(
			rows.filter((entry) => entry.yearLevel).map((entry) => `${entry.yearLevel}-${entry.semester}`)
		).size
	);
	let busy = $state(false);
	let saved = $state(false);
	let error = $state('');
	let catalogBusy = $state(false);
	let programDialog: CatalogRecordDialog;
	let subjectDialog: CatalogRecordDialog;
	let subjectTarget = $state<string | null>(null);
	let addedPrograms = $state<CatalogRecord[]>([]);
	let addedSubjects = $state<CatalogRecord[]>([]);
	const programOptions = $derived([
		...programs,
		...addedPrograms.filter((record) => !programs.some((item) => item.id === record.id))
	]);
	const subjectOptions = $derived([
		...subjects,
		...addedSubjects.filter((record) => !subjects.some((item) => item.id === record.id))
	]);
	const selectedProgram = $derived(programOptions.find((record) => record.id === programId));
	function optionLabel(record: CatalogOption) {
		return `${record.code} — ${record.name}${record.isActive ? '' : ' (Inactive)'}`;
	}
	function programCreated(record: CatalogRecord) {
		addedPrograms.push(record);
		programId = record.id;
	}
	function subjectCreated(record: CatalogRecord) {
		addedSubjects.push(record);
		const entry = rows.find((row) => row.key === subjectTarget);
		if (entry) entry.subjectId = record.id;
		subjectTarget = null;
	}

	beforeNavigate(({ cancel, willUnload }) => {
		if (!dirty || saved) return;
		if (busy || catalogBusy) {
			cancel();
			return;
		}
		if (willUnload || !window.confirm('Discard unsaved curriculum changes?')) cancel();
	});

	function addSubject() {
		if (busy || catalogBusy || saved) return;
		rows.push({ key: crypto.randomUUID(), subjectId: '', yearLevel: 1, semester: 1, units: 3 });
	}
	function removeSubject(key: string) {
		if (!busy && !catalogBusy && !saved) rows = rows.filter((entry) => entry.key !== key);
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy || catalogBusy || saved) return;
		if (curriculum?.publishedAt) return;
		error = '';
		const payloadSubjects: CurriculumUpdateSchema['subjects'] = rows.map(
			({ id, subjectId, yearLevel, semester, units }) => ({
				...(id ? { id } : {}),
				subjectId,
				yearLevel: Number(yearLevel),
				semester: Number(semester),
				units: Number(units)
			})
		);
		if (new Set(payloadSubjects.map((entry) => entry.subjectId)).size !== rows.length) {
			error = 'Each subject can only appear once in the curriculum.';
			return;
		}
		busy = true;
		try {
			const details = { name, programId, subjects: payloadSubjects };
			const result = curriculum
				? await updateCurriculum({ ...details, id: curriculum.id })
				: await createCurriculum(details);
			saved = true;
			await goto(resolve('/user/curriculum/[curriculumId]', { curriculumId: result.id }), {
				refreshAll: true
			});
			showSuccess(`Curriculum ${curriculum ? 'updated' : 'created'} successfully`);
		} catch (cause) {
			error = saved
				? 'Curriculum saved. Return to the curriculum list to view it.'
				: cause instanceof Error
					? cause.message
					: 'Failed to save curriculum';
			showError(error);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head
	><title>{curriculum ? 'Edit' : 'New'} Curriculum | BPC Enrollment System</title></svelte:head
>
<form class="mx-auto max-w-7xl space-y-6" onsubmit={save}>
	<div class="flex justify-end">
		<div class="flex items-center gap-2">
			<a
				class="btn border-base-300 btn-outline btn-sm"
				href={curriculum
					? resolve('/user/curriculum/[curriculumId]', { curriculumId: curriculum.id })
					: resolve('/user/curriculum')}>Cancel</a
			>
			<button
				type="submit"
				class="btn gap-2 btn-primary btn-sm"
				disabled={busy || catalogBusy || saved || !programOptions.length}
			>
				{#if busy}<span class="loading loading-sm loading-spinner" aria-hidden="true"
					></span>{:else}<Save class="size-4" aria-hidden="true" />{/if}{busy
					? 'Saving...'
					: 'Save curriculum'}
			</button>
		</div>
	</div>
	{#if error}<p
			role="alert"
			class="rounded-xl border border-error/20 bg-error/10 p-4 text-sm text-error"
		>
			{error}
		</p>{/if}
	<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
		<div class="min-w-0 space-y-6">
			<section class="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm sm:p-6">
				<div class="mb-5 flex items-center gap-3">
					<span
						class="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"
						><Layers class="size-5" aria-hidden="true" /></span
					>
					<div>
						<h2 class="font-bold">Curriculum details</h2>
						<p class="mt-0.5 text-xs text-base-content/50">
							Name the curriculum and choose its program.
						</p>
					</div>
				</div>
				<fieldset disabled={busy || catalogBusy || saved} class="grid gap-5 sm:grid-cols-2">
					<div class="space-y-2">
						<label for="curriculum-name" class="block text-sm font-semibold">Curriculum name</label
						><input
							id="curriculum-name"
							class="input w-full bg-base-200 text-sm"
							bind:value={name}
							minlength="2"
							required
							placeholder="e.g. 2026 Curriculum"
						/>
					</div>
					<div class="space-y-2">
						<label for="curriculum-program" class="block text-sm font-semibold">Program</label
						><SearchableSelect
							id="curriculum-program"
							label="Program"
							bind:value={programId}
							options={programOptions.map((record) => ({
								value: record.id,
								label: optionLabel(record)
							}))}
							placeholder="Select a program"
							searchLabel="Search programs"
							createLabel="New Program"
							oncreate={() => programDialog.open()}
							disabled={busy || catalogBusy || saved}
							required
						/>
					</div>
				</fieldset>
				{#if !programOptions.length}<p class="mt-4 text-sm text-base-content/60">
						Add a program before creating a curriculum. <a
							class="link link-primary"
							href={resolve('/user/programs')}>Open programs</a
						>
					</p>{/if}
			</section>
			<section class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
				<div class="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 p-5">
					<div class="flex items-center gap-3">
						<span
							class="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"
							><BookOpen class="size-5" aria-hidden="true" /></span
						>
						<div>
							<h2 class="font-bold">Subjects</h2>
							<p class="mt-0.5 text-xs text-base-content/50">
								Set the year, semester, and units for each subject.
							</p>
						</div>
					</div>
					<button
						type="button"
						class="btn gap-2 border-base-300 btn-outline btn-sm"
						disabled={busy || catalogBusy || saved}
						onclick={addSubject}><Plus class="size-4" aria-hidden="true" />Add subject</button
					>
				</div>
				{#if rows.length}
					<fieldset disabled={busy || catalogBusy || saved} class="min-w-0 overflow-x-auto">
						<table class="table w-full">
							<thead
								><tr class="bg-base-200 text-xs text-base-content/55"
									><th class="pl-5">Subject</th><th>Year</th><th>Semester</th><th>Units</th><th
										><span class="sr-only">Remove</span></th
									></tr
								></thead
							><tbody>
								{#each rows as entry, index (entry.key)}
									{@const selected = subjectOptions.find((record) => record.id === entry.subjectId)}
									<tr class="border-b border-base-200 last:border-0">
										<td class="min-w-64 py-4 pl-5">
											{#if entry.id}<p class="text-sm font-semibold">
													{selected?.code} — {selected?.name}
												</p>
												<p class="mt-1 text-[11px] text-base-content/50">
													Remove and re-add to replace this subject.
												</p>
											{:else}<SearchableSelect
													id={`curriculum-subject-${entry.key}`}
													label={`Subject ${index + 1}`}
													bind:value={entry.subjectId}
													options={subjectOptions.map((record) => ({
														value: record.id,
														label: optionLabel(record),
														disabled: rows.some(
															(other) => other.key !== entry.key && other.subjectId === record.id
														)
													}))}
													placeholder="Select a subject"
													searchLabel="Search subjects"
													createLabel="New Subject"
													oncreate={() => {
														subjectTarget = entry.key;
														subjectDialog.open();
													}}
													disabled={busy || catalogBusy || saved}
													small
													required
												/>{/if}
										</td>
										<td
											><input
												aria-label={`Year for subject ${index + 1}`}
												class="input w-20 bg-base-200 input-sm"
												type="number"
												min="1"
												step="1"
												bind:value={entry.yearLevel}
												required
											/></td
										>
										<td
											><select
												aria-label={`Semester for subject ${index + 1}`}
												class="select w-36 bg-base-200 select-sm"
												bind:value={entry.semester}
												><option value={1}>1st semester</option><option value={2}
													>2nd semester</option
												><option value={3}>Summer</option>{#if entry.semester > 3}<option
														value={entry.semester}>Semester {entry.semester}</option
													>{/if}</select
											></td
										>
										<td
											><input
												aria-label={`Units for subject ${index + 1}`}
												class="input w-20 bg-base-200 input-sm"
												type="number"
												min="1"
												step="1"
												bind:value={entry.units}
												required
											/></td
										>
										<td class="pr-5"
											><button
												type="button"
												aria-label={`Remove subject ${index + 1}`}
												class="btn btn-square btn-ghost text-error btn-sm"
												onclick={() => removeSubject(entry.key)}
												><Trash2 class="size-4" aria-hidden="true" /></button
											></td
										>
									</tr>
								{/each}
							</tbody>
						</table>
					</fieldset>
				{:else}<div class="px-5 py-12 text-center">
						<BookOpen class="mx-auto mb-3 size-8 text-base-content/25" aria-hidden="true" />
						<p class="text-sm font-semibold">No subjects added</p>
						<p class="mt-1 text-xs text-base-content/50">
							{subjectOptions.length
								? 'Add subjects to start building the curriculum.'
								: 'Add subjects to the subject catalog first.'}
						</p>
						{#if !subjectOptions.length}<a
								class="btn mt-4 btn-outline btn-sm"
								href={resolve('/user/subjects')}>Open subjects</a
							>{/if}
					</div>{/if}
			</section>
		</div>
		<aside
			class="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm xl:sticky xl:top-6"
			aria-label="Curriculum summary"
		>
			<div class="flex items-center gap-2 font-bold">
				<GraduationCap class="size-5 text-primary" aria-hidden="true" />Draft summary
			</div>
			<p class="mt-3 text-sm font-semibold">{selectedProgram?.code ?? 'No program selected'}</p>
			<p class="mt-1 text-xs text-base-content/50">
				{selectedProgram?.name ?? 'Choose a program for this curriculum.'}
			</p>
			<dl class="mt-5 space-y-3 border-t border-base-300 pt-5 text-sm">
				<div class="flex justify-between">
					<dt class="text-base-content/60">Subjects</dt>
					<dd class="font-bold">{rows.length}</dd>
				</div>
				<div class="flex justify-between">
					<dt class="text-base-content/60">Total units</dt>
					<dd class="font-bold">{totalUnits}</dd>
				</div>
				<div class="flex justify-between">
					<dt class="text-base-content/60">Year / semester groups</dt>
					<dd class="font-bold">{termCount}</dd>
				</div>
			</dl>
			<p class="mt-5 rounded-xl bg-base-200 p-3 text-xs leading-relaxed text-base-content/55">
				Changes are saved together. Each subject can appear once in this curriculum.
			</p>
		</aside>
	</div>
</form>

<CatalogRecordDialog
	bind:this={programDialog}
	kind="program"
	bind:busy={catalogBusy}
	oncreated={programCreated}
/>
<CatalogRecordDialog
	bind:this={subjectDialog}
	kind="subject"
	bind:busy={catalogBusy}
	oncreated={subjectCreated}
/>
