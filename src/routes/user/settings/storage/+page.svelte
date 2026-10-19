<script lang="ts">
	import { resolve } from '$app/paths';
	import { afterNavigate, refreshAll } from '$app/navigation';
	import {
		Activity,
		Download,
		File,
		Folder,
		HardDrive,
		RefreshCw,
		Server,
		Trash2,
		Upload
	} from '@lucide/svelte';
	import { deleteGarageEntry, increaseGarageCapacity } from '#lib/actions/storage.remote.js';
	import { uploadGarageFile } from '#lib/actions/storage.client.js';
	import { getErrorMessage } from '#lib/errors.js';
	import {
		showYesNo,
		showLoading,
		showSuccess,
		showError
	} from '#lib/components/Popup/Popup.svelte.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let busy = $state(false);
	let explorerHeading: HTMLHeadingElement;
	afterNavigate(({ from, to }) => {
		if (from?.url.pathname === to?.url.pathname && from?.url.search !== to?.url.search) {
			explorerHeading?.focus({ preventScroll: true });
		}
	});
	async function requestDelete(kind: 'file' | 'folder', key: string, name: string) {
		if (busy) return;
		const folder = data.folder;
		busy = true;
		try {
			const confirmed = await showYesNo({
				title: `Delete ${kind}?`,
				message: `Delete ${name}?`,
				warning: true,
				hintText:
					kind === 'folder'
						? 'This permanently deletes all files and subfolders inside this folder. This cannot be undone.'
						: 'This permanently deletes this file. This cannot be undone.',
				yesText: 'Delete',
				noText: 'Cancel'
			});
			if (!confirmed) return;
			showLoading('Deleting...');
			await deleteGarageEntry({ folder, kind, key, confirmed: 'yes' });
			await refreshAll();
			showSuccess(
				kind === 'folder'
					? 'Folder and its contents deleted successfully'
					: 'File deleted successfully'
			);
		} catch (err) {
			showError(
				getErrorMessage(
					err,
					'Deletion failed. Some files may already be deleted. Refresh and retry remaining files.'
				)
			);
		} finally {
			busy = false;
		}
	}
	const overview = $derived(data.overview);
	const configuredCapacity = $derived(
		overview?.nodes.reduce((total, node) => total + (node.capacity ?? 0), 0) ?? 0
	);
	const breadcrumbs = $derived(
		data.folder
			.split('/')
			.filter(Boolean)
			.map((name, index, parts) => ({ name, prefix: parts.slice(0, index + 1).join('/') + '/' }))
	);
	async function increaseCapacity(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		const element = event.currentTarget as HTMLFormElement;
		const fields = new FormData(element);
		const nodeId = String(fields.get('nodeId'));
		const layoutVersion = String(fields.get('layoutVersion'));
		const capacityGB = String(fields.get('capacityGB'));
		const node = overview?.nodes.find((node) => node.id === nodeId);
		busy = true;
		try {
			const confirmed = await showYesNo({
				title: 'Increase node capacity?',
				message: `Increase ${node?.hostname ?? 'this node'} to ${capacityGB} GB?`,
				warning: true,
				hintText:
					'Configured capacity guides data placement. Ensure sufficient physical disk space.',
				yesText: 'Increase capacity',
				noText: 'Cancel'
			});
			if (!confirmed) return;
			showLoading('Increasing node capacity...');
			const result = await increaseGarageCapacity({
				nodeId,
				layoutVersion,
				capacityGB,
				confirmed: 'yes'
			});
			element.reset();
			await refreshAll();
			showSuccess(
				`Node capacity increased to ${result.capacity / 1_000_000_000} GB. Layout version ${result.layoutVersion} applied.`
			);
		} catch (err) {
			showError(
				getErrorMessage(
					err,
					'Capacity update failed. Refresh and review Garage status and pending layout changes.'
				)
			);
		} finally {
			busy = false;
		}
	}
	async function upload(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		const element = event.currentTarget as HTMLFormElement;
		const file = (element.elements.namedItem('file') as HTMLInputElement).files?.[0];
		if (!file) return;
		busy = true;
		showLoading('Uploading file...');
		try {
			const name = await uploadGarageFile(data.folder, file);
			element.reset();
			await refreshAll();
			showSuccess(`Uploaded ${name}.`);
		} catch (err) {
			showError(getErrorMessage(err, 'Upload failed. Check storage connectivity and try again.'));
		} finally {
			busy = false;
		}
	}
	function bytes(value: number | null) {
		if (value === null) return 'Unavailable';
		const units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB'];
		const index = value > 0 ? Math.min(Math.floor(Math.log10(value) / 3), units.length - 1) : 0;
		return `${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 }).format(value / 1000 ** index)} ${units[index]}`;
	}
	function folderLink(prefix: string, cursor?: string | null) {
		return `${resolve('/user/settings/storage')}?${new URLSearchParams(cursor ? { prefix, cursor } : { prefix })}`;
	}
	function modified(value: string | null) {
		return value
			? new Intl.DateTimeFormat('en-PH', {
					timeZone: 'Asia/Manila',
					dateStyle: 'medium',
					timeStyle: 'short'
				}).format(new Date(value))
			: '—';
	}
</script>

<svelte:head><title>Storage Settings | BPC Enrollment System</title></svelte:head>

<section class="space-y-6" aria-label="Garage storage settings">
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold">Storage settings</h1>
			<p class="mt-1 text-sm text-base-content/65">
				Monitor Garage, manage node capacity, and browse files in the bpc bucket.
			</p>
		</div>
		<a class="btn btn-outline btn-sm" href={folderLink(data.folder)}>
			<RefreshCw size={16} aria-hidden="true" />Refresh
		</a>
	</header>
	{#if !data.configured}
		<p class="alert alert-warning" role="status">
			Configure the Garage endpoints and admin token on the server, then restart the app to enable
			storage administration.
		</p>
	{/if}
	{#if data.statusError}
		<p class="alert alert-error" role="alert">{data.statusError}</p>
	{/if}
	{#if overview}
		<div class="grid gap-4 sm:grid-cols-2">
			<div class="portal-panel p-5">
				<div class="flex items-center gap-2 text-sm text-base-content/65">
					<Activity size={18} aria-hidden="true" />Cluster health
				</div>
				<p class="mt-3 text-2xl font-bold capitalize">{overview.health.status}</p>
				<p class="mt-1 text-xs text-base-content/65">
					{overview.health.storageNodesUp} of {overview.health.storageNodes} storage nodes online
				</p>
			</div>
			<div class="portal-panel p-5">
				<div class="flex items-center gap-2 text-sm text-base-content/65">
					<HardDrive size={18} aria-hidden="true" />Available data space
				</div>
				<p class="mt-3 text-2xl font-bold">{bytes(overview.space.available)}</p>
				<p class="mt-1 text-xs text-base-content/65">
					{overview.space.incomplete
						? 'Estimate: some nodes are disconnected'
						: 'Reported by Garage across the cluster'}
				</p>
			</div>
			<div class="portal-panel p-5 sm:col-span-2">
				<div class="flex items-center gap-2 text-sm text-base-content/65">
					<Server size={18} aria-hidden="true" />Configured capacity
				</div>
				<p class="mt-3 text-2xl font-bold">{bytes(configuredCapacity)}</p>
				<p class="mt-1 text-xs text-base-content/65">Layout version {overview.layoutVersion}</p>
				<div class="mt-4 space-y-2">
					<p class="text-xs text-base-content/65">All bucket usage / configured capacity</p>
					<p class="text-sm font-semibold">
						{bytes(overview.space.objectBytes)} / {bytes(configuredCapacity)}
					</p>
					{#if configuredCapacity > 0 && overview.space.objectBytes !== null}
						<progress
							class="progress w-full progress-primary"
							max={configuredCapacity}
							value={overview.space.objectBytes}
							aria-label="All bucket usage against configured cluster capacity"
						></progress>
					{/if}
					<p class="text-xs text-base-content/55">
						Logical size before compression, deduplication, and replication.
					</p>
				</div>
			</div>
		</div>
		{#if overview.hasStagedChanges}
			<p class="alert alert-warning" role="status">
				Garage has pending layout changes. Review them in Garage before increasing node capacity
				here.
			</p>
		{/if}
		<section class="portal-panel" aria-labelledby="storage-nodes">
			<div class="border-b border-base-300 p-5">
				<h2 id="storage-nodes" class="font-bold">Storage nodes</h2>
				<p class="mt-1 text-sm text-base-content/65">
					Configured capacity guides data placement. It does not add disk space or impose a disk
					quota.
				</p>
			</div>
			<div class="divide-y divide-base-300">
				{#each overview.nodes as node (node.id)}
					<article class="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,1fr)]">
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<h3 class="font-semibold">{node.hostname}</h3>
								<span
									class:badge-success={node.online && !node.draining}
									class:badge-warning={node.draining}
									class:badge-error={!node.online}
									class="badge badge-sm"
								>
									{node.draining ? 'Draining' : node.online ? 'Online' : 'Offline'}
								</span>
							</div>
							<p class="mt-1 font-mono text-xs break-all text-base-content/55">{node.id}</p>
							<dl class="mt-4 grid grid-cols-2 gap-3 text-sm">
								<div>
									<dt class="text-base-content/60">Configured capacity</dt>
									<dd class="font-semibold">
										{node.capacity === null ? 'Gateway' : bytes(node.capacity)}
									</dd>
								</div>
								<div>
									<dt class="text-base-content/60">Zone</dt>
									<dd class="font-semibold">{node.zone || '—'}</dd>
								</div>
							</dl>
							<div class="mt-4 space-y-2 rounded-lg bg-base-200/60 p-3">
								<p class="text-sm font-semibold">Filesystem usage</p>
								<p class="text-xs text-base-content/65">
									{node.diskTotal !== null && node.diskAvailable !== null
										? bytes(Math.max(0, node.diskTotal - node.diskAvailable))
										: 'Unavailable'} used / {bytes(node.diskTotal)} total
								</p>
								{#if node.diskTotal && node.diskAvailable !== null}
									<progress
										class="progress w-full progress-secondary"
										max={node.diskTotal}
										value={Math.max(0, node.diskTotal - node.diskAvailable)}
										aria-label={`Filesystem disk used on ${node.hostname}`}
									></progress>
								{/if}
								<p class="text-xs text-base-content/65">{bytes(node.diskAvailable)} free</p>
							</div>
							<p class="mt-2 text-xs text-base-content/55">
								Garage {node.version ?? 'version unavailable'} · Tags: {node.tags.join(', ') ||
									'None'}
							</p>
						</div>
						{#if node.capacity !== null}
							<form
								onsubmit={increaseCapacity}
								aria-label={`Increase capacity for ${node.hostname}`}
							>
								<fieldset
									class="space-y-3 rounded-xl bg-base-200/60 p-4"
									disabled={busy || overview.hasStagedChanges || !node.online || node.draining}
								>
									<input type="hidden" name="nodeId" value={node.id} />
									<input type="hidden" name="layoutVersion" value={overview.layoutVersion} />
									<label for={`capacity-${node.id}`} class="block text-sm font-semibold">
										New capacity (GB)
									</label>
									<input
										id={`capacity-${node.id}`}
										name="capacityGB"
										type="number"
										required
										step="0.001"
										min={node.capacity / 1_000_000_000 + 0.001}
										max={node.diskTotal ? node.diskTotal / 1_000_000_000 : undefined}
										class="input w-full border-base-300"
										aria-describedby={`capacity-help-${node.id}`}
									/>
									<p id={`capacity-help-${node.id}`} class="text-xs text-base-content/65">
										Increase only. Ensure sufficient physical disk space. Zone and tags are
										preserved.
									</p>
									<button type="submit" class="btn btn-primary btn-sm">
										{busy ? 'Working…' : 'Increase capacity'}
									</button>
								</fieldset>
							</form>
						{/if}
					</article>
				{:else}
					<p class="p-5 text-sm text-base-content/65">No storage nodes available.</p>
				{/each}
			</div>
		</section>
		<section class="portal-panel p-5" aria-labelledby="bucket-settings">
			<h2 id="bucket-settings" class="font-bold">Bucket &amp; cluster details</h2>
			<dl class="mt-4 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
				<div>
					<dt class="text-base-content/60">Region</dt>
					<dd class="mt-1 font-semibold">{overview.region}</dd>
				</div>
				<div>
					<dt class="text-base-content/60">Bucket size quota</dt>
					<dd class="mt-1 font-semibold">
						{overview.bucket.maxSize === null ? 'No quota' : bytes(overview.bucket.maxSize)}
					</dd>
				</div>
				<div>
					<dt class="text-base-content/60">Object quota</dt>
					<dd class="mt-1 font-semibold">{overview.bucket.maxObjects ?? 'No quota'}</dd>
				</div>
				<div>
					<dt class="text-base-content/60">Website hosting</dt>
					<dd class="mt-1 font-semibold">
						{overview.bucket.websiteAccess ? 'Enabled' : 'Disabled'}
					</dd>
				</div>
				<div>
					<dt class="text-base-content/60">Metadata space available</dt>
					<dd class="mt-1 font-semibold">{bytes(overview.space.metadataAvailable)}</dd>
				</div>
				<div>
					<dt class="text-base-content/60">Partitions with write quorum</dt>
					<dd class="mt-1 font-semibold">
						{overview.health.partitionsQuorum} / {overview.health.partitions}
					</dd>
				</div>
				<div>
					<dt class="text-base-content/60">Unfinished bucket uploads</dt>
					<dd class="mt-1 font-semibold">{overview.bucket.unfinishedUploads}</dd>
				</div>
			</dl>
		</section>
	{/if}
	<section
		class="portal-panel min-w-0"
		aria-labelledby="storage-explorer"
		data-sveltekit-reset="false"
	>
		<div class="flex flex-wrap items-start justify-between gap-3 border-b border-base-300 p-5">
			<div>
				<h2 id="storage-explorer" bind:this={explorerHeading} tabindex="-1" class="font-bold">
					File explorer
				</h2>
				<p class="mt-1 text-sm text-base-content/65">
					Browse all files in bpc. This view is restricted to administrators.
				</p>
			</div>
			<span class="badge badge-outline">bpc</span>
		</div>
		<div class="space-y-4 p-5">
			<nav class="flex flex-wrap gap-2 text-sm" aria-label="Storage folders">
				<a class="link" href={folderLink('')}>bpc</a>
				{#each breadcrumbs as crumb (crumb.prefix)}
					<span aria-hidden="true">/</span>
					<a class="link break-all" href={folderLink(crumb.prefix)}>{crumb.name}</a>
				{/each}
			</nav>
			{#if !data.filesConfigured}
				<p class="alert alert-warning" role="status">
					File access is unavailable. Check Garage setup and restart the app.
				</p>
			{:else}
				<form onsubmit={upload} class="rounded-xl bg-base-200/60 p-4">
					<fieldset disabled={busy} class="flex flex-wrap items-end gap-3">
						<div class="min-w-0 flex-1">
							<label for="storage-file" class="mb-2 block text-sm font-semibold">
								Upload to this folder
							</label>
							<input
								id="storage-file"
								type="file"
								name="file"
								required
								class="file-input w-full"
								aria-describedby="storage-upload-help"
							/>
						</div>
						<button type="submit" class="btn btn-primary">
							<Upload size={17} aria-hidden="true" />{busy ? 'Working…' : 'Upload file'}
						</button>
					</fieldset>
					<p id="storage-upload-help" class="mt-2 text-xs text-base-content/65">
						Maximum 10 MiB. Uploaded files receive unique names to preserve existing files.
					</p>
				</form>
			{/if}
			{#if data.filesError}
				<p class="alert alert-error" role="alert">{data.filesError}</p>
			{:else if data.listing}
				<div class="overflow-x-auto">
					<table class="table min-w-[40rem]">
						<caption class="sr-only">Files and folders in {data.folder || 'bpc'}</caption>
						<thead>
							<tr>
								<th class="min-w-56">Name</th>
								<th>Size</th>
								<th>Modified (Manila)</th>
								<th><span class="sr-only">Actions</span></th>
							</tr>
						</thead>
						<tbody>
							{#each data.listing.folders as folder (folder.prefix)}
								<tr>
									<td>
										<a href={folderLink(folder.prefix)} class="flex items-center gap-2 font-medium">
											<Folder size={18} class="shrink-0 text-primary" aria-hidden="true" />
											<span class="break-all">{folder.name}</span>
										</a>
									</td>
									<td colspan="2" class="text-base-content/50">Folder</td>
									<td>
										<button
											type="button"
											class="btn btn-ghost text-error btn-sm"
											aria-label={`Delete folder ${folder.name}`}
											disabled={busy}
											onclick={() => requestDelete('folder', folder.prefix, folder.name)}
										>
											<Trash2 size={16} aria-hidden="true" />
											<span class="hidden sm:inline">Delete</span>
										</button>
									</td>
								</tr>
							{/each}
							{#each data.listing.files as file (file.key)}
								<tr>
									<td class="max-w-sm">
										<span class="flex items-start gap-2">
											<File
												size={17}
												class="mt-0.5 shrink-0 text-base-content/50"
												aria-hidden="true"
											/>
											<span class="break-all">{file.name}</span>
										</span>
									</td>
									<td class="whitespace-nowrap">{bytes(file.size)}</td>
									<td class="text-xs whitespace-nowrap">{modified(file.modified)}</td>
									<td>
										<div class="flex items-center gap-1">
											<a
												class="btn btn-ghost btn-sm"
												href={`${resolve('/user/settings/storage/download')}?${new URLSearchParams({ key: file.key })}`}
												aria-label={`Download ${file.name}`}
												data-sveltekit-reload
											>
												<Download size={16} aria-hidden="true" />
												<span class="hidden sm:inline">Download</span>
											</a>
											<button
												type="button"
												class="btn btn-ghost text-error btn-sm"
												aria-label={`Delete file ${file.name}`}
												disabled={busy}
												onclick={() => requestDelete('file', file.key, file.name)}
											>
												<Trash2 size={16} aria-hidden="true" />
												<span class="hidden sm:inline">Delete</span>
											</button>
										</div>
									</td>
								</tr>
							{/each}
							{#if data.listing.files.length === 0 && data.listing.folders.length === 0}
								<tr>
									<td colspan="4" class="py-10 text-center text-base-content/55">
										This folder is empty.
									</td>
								</tr>
							{/if}
						</tbody>
					</table>
				</div>
				{#if data.listing.nextToken}
					<a class="btn btn-outline btn-sm" href={folderLink(data.folder, data.listing.nextToken)}>
						Next files
					</a>
				{/if}
			{/if}
		</div>
	</section>
</section>
