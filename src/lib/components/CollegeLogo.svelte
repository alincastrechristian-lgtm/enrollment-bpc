<script lang="ts">
	import logo from '#lib/assets/bpc-logo.jpg';
	let { class: className = 'size-11' }: { class?: string } = $props();
</script>

<img
	src={logo}
	alt="Bulacan Polytechnic College logo"
	width="48"
	height="48"
	class={`aspect-square shrink-0 rounded-full bg-white object-cover ${className}`}
/>
