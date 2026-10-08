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

<section class="space-y-6">
	<div class="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5">
		{@render toolbar()}
	</div>
	<Table {title} {description} {total} {itemLabel} {header}>
		{@render children()}
	</Table>
</section>
