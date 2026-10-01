<script lang="ts">
	import type { Snippet } from 'svelte';
	type Props = {
		children?: Snippet;
		blur?: boolean;
	};

	let { children, blur = true }: Props = $props();
</script>

<div class={`fixed inset-0 bg-base-100/70 ${blur ? 'backdrop-blur-sm' : ''} z-20 h-full`}>
	<div class="relative flex h-full items-center justify-center overflow-hidden">
		{#if children}
			{@render children()}
		{/if}
	</div>
</div>
