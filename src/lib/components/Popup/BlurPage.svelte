<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		children?: Snippet;
		blur?: boolean;
		onClose?: () => void;
	};

	let { children, blur = true, onClose }: Props = $props();

	let outsidePointerId: number | null = null;

	function handlePointerDown(event: PointerEvent) {
		outsidePointerId =
			event.isPrimary && event.button === 0 && event.target === event.currentTarget
				? event.pointerId
				: null;
	}

	function handleOutsideClick(event: PointerEvent) {
		const startedOutside = outsidePointerId === event.pointerId;
		outsidePointerId = null;
		// Check the release position because touch pointers can capture the backdrop.
		if (
			startedOutside &&
			document.elementFromPoint(event.clientX, event.clientY) === event.currentTarget
		) {
			onClose?.();
		}
	}
</script>

<div
	role="presentation"
	onpointerdown={handlePointerDown}
	onpointerup={handleOutsideClick}
	onpointercancel={() => (outsidePointerId = null)}
	class={`fixed inset-0 z-40 flex items-center justify-center bg-base-100/70 ${
		blur ? 'backdrop-blur-sm' : ''
	}`}
>
	{#if children}
		{@render children()}
	{/if}
</div>
