<script lang="ts">
	import Table from '#lib/components/Table/Table.svelte';
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		total,
		itemLabel,
		toolbar,
		header,
		children
	}: {
		title: string;
		description?: string;
		total: number;
		itemLabel: string;
		toolbar: Snippet;
		header: Snippet;
		children: Snippet;
	} = $props();
</script>

<section class="w-full space-y-5" aria-label={title}>
	<div class="portal-panel p-4 sm:p-5">
		{@render toolbar()}
	</div>
	<Table {title} {description} {total} {itemLabel} {header}>
		{@render children()}
	</Table>
</section>
