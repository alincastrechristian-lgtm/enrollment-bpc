<script lang="ts">
	import { onDestroy } from 'svelte';
	import { resolve } from '$app/paths';
	import type { Corners } from '#lib/clearance/clearance.js';
	import type { IdentityResult, IdentityStudent } from '#lib/clearance/identity.js';

	let {
		source,
		corners,
		disabled,
		templatePassed,
		student,
		signedIn,
		onbusychange
	}: {
		source: HTMLCanvasElement | undefined;
		corners: Corners;
		disabled: boolean;
		templatePassed: boolean;
		student: IdentityStudent | null;
		signedIn: boolean;
		onbusychange: (busy: boolean) => void;
	} = $props();
	let result = $state<IdentityResult>();
	let error = $state('');
	let running = $state(false);
	let images = $state<{ name: string; studentNumber: string }>();
	let controller: AbortController | undefined;
	const labels = {
		match: 'Student number matches',
		review: 'Needs confirmation',
		mismatch: 'Details do not match'
	};
	const badges = { match: 'badge-success', review: 'badge-warning', mismatch: 'badge-error' };
	const fieldLabels = {
		exact: 'Exact',
		close: 'Close',
		different: 'Different',
		unreadable: 'Unreadable'
	};
	$effect(() => {
		// An outline adjustment or new photo invalidates all previous identity evidence.
		void source;
		JSON.stringify(corners);
		void templatePassed;
		result = undefined;
		images = undefined;
		error = '';
	});

	async function check() {
		if (!source || disabled || running || !student || !templatePassed) return;
		running = true;
		onbusychange(true);
		result = undefined;
		error = '';
		controller = new AbortController();
		const active = controller;
		try {
			const processor = await import('#lib/clearance/scan.client.js');
			const crops = processor.identityCrops(source, corners);
			images = {
				name: crops.name.toDataURL('image/png'),
				studentNumber: crops.studentNumber.toDataURL('image/png')
			};
			const response = await fetch(resolve('/test/identity'), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				signal: active.signal,
				body: JSON.stringify({
					name: images.name.split(',')[1],
					studentNumber: images.studentNumber.split(',')[1]
				})
			});
			const data = await response.json();
			if (!response.ok)
				throw new Error(data.message || 'Could not complete handwriting check. Retry.');
			if (!active.signal.aborted) result = data;
		} catch (cause) {
			error = active.signal.aborted
				? 'Identity check cancelled.'
				: cause instanceof Error
					? cause.message
					: 'Could not complete handwriting check. Retry.';
		} finally {
			running = false;
			controller = undefined;
			onbusychange(false);
		}
	}
	onDestroy(() => controller?.abort());
</script>

<section class="card border border-base-300 bg-base-100 shadow-sm" aria-labelledby="identity-title">
	<div class="card-body gap-4">
		<div>
			<h2 id="identity-title" class="card-title">Check student identity</h2>
			<p class="mt-1 text-sm text-base-content/65">
				Compare handwriting with the student record. Course and section are not required for this
				check.
			</p>
		</div>
		{#if student}
			{#if !templatePassed}
				<p class="text-sm text-warning">
					Compare the printed template first. Identity checking unlocks after it matches.
				</p>
			{/if}
			<div class="rounded-lg bg-base-200 p-3 text-sm">
				<p class="font-semibold">{student.name}</p>
				<p>{student.studentNumber}</p>
			</div>
			<p class="text-xs text-base-content/65">
				Confirm the form outline, then check. Only the name and number crops are sent to Google
				Gemini for handwriting recognition.
			</p>
			<button
				type="button"
				class="btn btn-primary"
				onclick={check}
				disabled={disabled || running || !source}
			>
				{#if running}
					<span class="loading loading-sm loading-spinner" aria-hidden="true"></span>
				{/if}
				{running ? 'Reading handwriting…' : 'Check student identity'}
			</button>
		{:else if signedIn}
			<p class="text-sm">
				No student record available for this test. Staff use Jonnel’s test record; students use
				their own record.
			</p>
		{:else}
			<p class="text-sm">
				<a class="link link-primary" href={resolve('/login')}>Sign in</a>
				to check handwriting against a student record. The scan lab below is still available.
			</p>
		{/if}
		{#if running}
			<p role="status" class="text-sm">
				Reading student number and name. This may take up to two minutes.
			</p>
			<button type="button" class="btn btn-ghost btn-sm" onclick={() => controller?.abort()}>
				Cancel identity check
			</button>
		{/if}
		{#if error}
			<p role="alert" class="text-sm text-error">{error}</p>
		{/if}
		{#if result}
			<div role="status" class="space-y-2">
				<span class={`badge ${badges[result.verdict]}`}>{labels[result.verdict]}</span>
				<p class="text-sm">{result.detail}</p>
			</div>
			{#each [{ key: 'studentNumber', label: 'Student number' }, { key: 'name', label: 'Student name' }] as field (field.key)}
				{@const key = field.key as 'studentNumber' | 'name'}
				{@const match = result[key]}
				<div class="space-y-2 rounded-lg border border-base-300 p-3 text-sm">
					<div class="flex items-center justify-between gap-2">
						<h3 class="font-semibold">{field.label}</h3>
						<span class="badge badge-outline badge-sm">{fieldLabels[match.status]}</span>
					</div>
					{#if images}
						<img
							src={images[key]}
							alt={`${field.label} crop sent for recognition`}
							class="max-h-28 w-full rounded bg-white object-contain"
						/>
					{/if}
					<p class="break-words">
						<strong>Read:</strong>
						{match.detected || '(No readable text)'}
					</p>
					<p class="break-words">
						<strong>Record:</strong>
						{match.expected}
					</p>
					{#if match.similarity !== null}
						<p>Text similarity: {match.similarity}%</p>
					{/if}
					<p class="text-xs text-base-content/70">{match.detail}</p>
					{#if result.warnings?.[key]}
						<p class="text-xs text-warning">{result.warnings[key]}</p>
					{/if}
				</div>
			{/each}
		{/if}
		<p class="text-xs text-base-content/65">
			One differing digit or a name similarity of at least 80% suggests review. Similarity measures
			characters, not confidence or clearance validity. This test never approves clearance.
		</p>
	</div>
</section>
