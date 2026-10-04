<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		count,
		itemLabel = 'records',
		children,
		header
	}: {
		title: string;
		description?: string;
		count?: number;
		itemLabel?: string;
		children: Snippet;
		header: Snippet;
	} = $props();
</script>

<div class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-base-300 px-5 py-4">
		<div>
			<h2 class="font-bold text-base-content">{title}</h2>

			{#if description}
				<p class="mt-0.5 text-xs text-base-content/50">
					{description}
				</p>
			{/if}
		</div>

		{#if count !== undefined}
			<span class="badge badge-ghost font-semibold text-base-content/60">
				{count} records
			</span>
		{/if}
	</div>

	<!-- Table -->
	<div class="overflow-x-auto">
		<table class="table w-full">
			<thead>
				{@render header()}
			</thead>

			<tbody>
				{@render children()}
			</tbody>
		</table>
	</div>

	<!-- Footer -->
	<div
		class="flex flex-col gap-3 border-t border-base-300 bg-base-200/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
	>
		<p class="text-xs font-medium text-base-content/60">
			Showing
			<span class="font-bold text-base-content/80">1–{count ?? 0}</span>
			of
			<span class="font-bold text-base-content/80">{count ?? 0}</span>
			{itemLabel}
		</p>

		<div class="join">
			<button class="btn join-item btn-sm" disabled>«</button>
			<button class="btn join-item bg-primary text-primary-content btn-sm hover:bg-primary/80">
				1
			</button>
			<button class="btn join-item btn-sm">2</button>
			<button class="btn join-item btn-sm">3</button>
			<button class="btn join-item btn-sm">»</button>
		</div>
	</div>
</div>
