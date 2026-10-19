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
	<div class={`popup-accent-panel portal-dialog-panel ${className}`}>
		{#if children}
			{@render children()}
		{/if}
	</div>
</BlurPage>
