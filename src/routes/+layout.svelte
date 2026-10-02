<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import PopupHost from '#lib/components/Popup/PopupHost.svelte';
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
<PopupHost />
