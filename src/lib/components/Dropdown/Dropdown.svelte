<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		id,
		label = 'Open menu',
		disabled = false,
		trigger,
		children
	}: {
		id: string;
		label?: string;
		disabled?: boolean;
		trigger: Snippet;
		children: Snippet;
	} = $props();

	const anchorName = $derived('--popover-dropdown-' + id);
	const popoverId = $derived('popover-dropdown-' + id);
</script>

<button
	type="button"
	class="btn btn-square btn-ghost text-base-content/60 btn-sm"
	aria-label={label}
	{disabled}
	title={label}
	popovertarget={popoverId}
	style={`anchor-name: ${anchorName}`}
>
	{@render trigger()}
</button>

<div
	id={popoverId}
	popover="auto"
	style={`position-anchor: ${anchorName}; position-area: bottom span-left; position-try-fallbacks: flip-block, flip-inline; inset: auto; margin: 0.375rem 0 0`}
	class="fixed z-40 w-56 rounded-xl border border-base-300 bg-base-100 p-2 shadow-lg"
>
	{@render children()}
</div>
