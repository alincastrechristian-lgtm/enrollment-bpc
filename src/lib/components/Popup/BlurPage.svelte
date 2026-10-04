<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		children?: Snippet;
		blur?: boolean;
		onClose?: () => void;
	};

	let { children, blur = true, onClose }: Props = $props();

	function handleOutsideClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose?.();
		}
	}
</script>

<div
	role="presentation"
	onclick={handleOutsideClick}
	class={`fixed inset-0 z-40 flex items-center justify-center bg-base-100/70 ${
		blur ? 'backdrop-blur-sm' : ''
	}`}
>
	{#if children}
		{@render children()}
	{/if}
</div>
