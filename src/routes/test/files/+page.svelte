<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let uploading = $state(false);
	function sizeLabel(bytes: number) {
		return bytes < 1024
			? `${bytes} B`
			: bytes < 1024 * 1024
				? `${(bytes / 1024).toFixed(1)} KiB`
				: `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
	}
</script>

<svelte:head><title>Files | BPC</title></svelte:head>

<main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
	<header>
		<a class="link text-sm" href={resolve('/test')}>Back to test page</a>
		<h1 class="mt-3 text-3xl font-bold">Files</h1>
		<p class="mt-2 text-base-content/70">
			Upload a file, then download it below. Only your files appear here.
		</p>
	</header>
	{#if !data.configured}
		<p class="alert alert-warning" role="status">
			File storage is not configured. Contact your administrator.
		</p>
	{:else}
		<form
			method="POST"
			enctype="multipart/form-data"
			class="card border border-base-300 bg-base-100 p-6"
			use:enhance={() => {
				uploading = true;
				return async ({ update }) => {
					try {
						await update();
					} finally {
						uploading = false;
					}
				};
			}}
		>
			<label for="file" class="mb-2 font-semibold">Choose a file</label>
			<input
				id="file"
				name="file"
				type="file"
				required
				class="file-input w-full"
				aria-describedby="file-limit"
				disabled={uploading}
			/>
			<p id="file-limit" class="mt-2 text-sm text-base-content/70">Maximum file size: 10 MiB.</p>
			<button class="btn mt-4 self-start btn-primary" type="submit" disabled={uploading}>
				{uploading ? 'Uploading…' : 'Upload file'}
			</button>
		</form>
	{/if}
	<div aria-live="polite" aria-atomic="true">
		{#if form?.error}
			<p class="alert alert-error">{form.error}</p>
		{/if}
		{#if form?.uploaded}
			<p class="alert alert-success">Uploaded {form.uploaded}.</p>
		{/if}
	</div>
	{#if data.configured}
		<section aria-labelledby="uploaded-files">
			<h2 id="uploaded-files" class="mb-3 text-xl font-semibold">Your files</h2>
			{#if data.storageError}
				<p class="alert alert-error" role="alert">{data.storageError}</p>
			{:else if data.files.length === 0}
				<p class="rounded-box border border-base-300 p-6 text-base-content/70">
					No files uploaded yet.
				</p>
			{:else}
				<ul class="divide-y divide-base-300 rounded-box border border-base-300">
					{#each data.files as file (file.key)}
						<li class="flex items-center justify-between gap-4 p-4">
							<div class="min-w-0">
								<p class="font-medium break-words">{file.name}</p>
								<p class="text-sm text-base-content/70">{sizeLabel(file.size)}</p>
							</div>
							<a
								class="btn shrink-0 btn-outline btn-sm"
								href={`${resolve('/test/files/download')}?${new URLSearchParams({ key: file.key })}`}
								aria-label={`Download ${file.name}`}
								data-sveltekit-reload
							>
								Download
							</a>
						</li>
					{/each}
				</ul>
			{/if}
			{#if data.nextToken}
				<a
					class="btn mt-4 btn-outline"
					href={`${resolve('/test/files')}?${new URLSearchParams({ cursor: data.nextToken })}`}
				>
					Next files
				</a>
			{/if}
			{#if data.files.length > 0}
				<a class="mt-4 block link text-sm" href={resolve('/test/files')}>Refresh files</a>
			{/if}
		</section>
	{/if}
</main>
