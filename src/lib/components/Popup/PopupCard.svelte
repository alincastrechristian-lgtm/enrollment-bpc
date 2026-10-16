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
		class={`card max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-2xl border border-base-300 bg-base-100 shadow-2xl ${className}`}
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
</BlurPage>
