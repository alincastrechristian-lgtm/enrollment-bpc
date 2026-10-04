<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		id,
		label = 'Open menu',
		trigger,
		children
	}: {
		id: string;
		label?: string;
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
	title={label}
	popovertarget={popoverId}
	style={`anchor-name: ${anchorName}`}
>
	{@render trigger()}
</button>

<div
	id={popoverId}
	popover="auto"
	style={`position-anchor: ${anchorName}`}
	class="menu dropdown w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
>
	{@render children()}
</div>
