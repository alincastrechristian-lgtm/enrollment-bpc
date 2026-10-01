<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		children?: Snippet;
	};

	let { children }: Props = $props();
</script>

<div
	class="animate-fade-up card w-[calc(100%-2rem)] max-w-md border border-base-300 bg-base-100/95 shadow-2xl backdrop-blur-xl"
>
	{#if children}
		{@render children()}
	{/if}
</div>
