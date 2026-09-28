<script lang="ts">
	import Sidebar from '$lib/components/Sidebar/Sidebar.svelte';
	import UserTopbar from '$lib/components/Topbar/Topbar.svelte';

	let { children } = $props();
	const drawerId = 'user-sidebar-drawer';
</script>

<div class="drawer min-h-dvh bg-slate-100 xl:drawer-open">
	<input id={drawerId} type="checkbox" class="drawer-toggle" />

	<div class="drawer-content flex min-h-dvh min-w-0 flex-col">
		<UserTopbar drawerToggleId={drawerId} />
		<main class="flex-1 px-4 py-6 md:px-6 lg:px-8">
			{@render children()}
		</main>
	</div>

	<div class="drawer-side z-30">
		<label for={drawerId} aria-label="Close sidebar" class="drawer-overlay"></label>
		<div class="h-dvh w-60 sm:w-64 lg:w-72">
			<Sidebar />
		</div>
	</div>
</div>
