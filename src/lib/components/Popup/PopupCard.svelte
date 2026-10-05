<script lang="ts">
	import type { Snippet } from 'svelte';
	import BlurPage from './BlurPage.svelte';

	type Props = {
		children?: Snippet;
		onClose?: () => void;
		class?: string;
	};

	let { children, onClose, class: className = 'max-w-md' }: Props = $props();
</script>

<BlurPage {onClose}>
	<div
		class={`animate-fade-up card w-[calc(100%-2rem)] border border-base-300 bg-base-100/95 shadow-2xl ${className}`}
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
</BlurPage>
