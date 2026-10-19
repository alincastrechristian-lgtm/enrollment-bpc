<script lang="ts">
	import favicon from '#lib/assets/bpc-logo.jpg';
	import PopupHost from '#lib/components/Popup/PopupHost.svelte';
	import './layout.css';

	let { children, data } = $props();
</script>

<svelte:head><link rel="icon" type="image/jpeg" href={favicon} /></svelte:head>
<div id="app-theme" data-theme={data.theme} class="min-h-screen">
	{@render children()}
	<PopupHost />
</div>
