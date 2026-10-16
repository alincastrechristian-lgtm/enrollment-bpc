<script lang="ts">
	import { authClient } from '#lib/auth-client.js';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ErrorPage from '#lib/components/Popup/ErrorPopup.svelte';
	import LoadingPage from '#lib/components/Popup/LoadingPopup.svelte';
	import Sidebar from '#lib/components/Sidebar/Sidebar.svelte';
	import UserTopbar from '#lib/components/Topbar/Topbar.svelte';

	let { children, data } = $props();
	const session = authClient.useSession();

	const drawerId = 'user-sidebar-drawer';
	let sidebarOpen = $state(false);
	$effect(() => {
		if (page.url.pathname) sidebarOpen = false;
	});
</script>

{#if $session && $session.data}
	<div class="portal-shell drawer min-h-dvh bg-base-200/60 xl:drawer-open">
		<input
			id={drawerId}
			type="checkbox"
			class="drawer-toggle"
			bind:checked={sidebarOpen}
			aria-label="Toggle sidebar"
		/>

		<div class="drawer-content flex min-h-dvh min-w-0 flex-col">
			<UserTopbar
				drawerToggleId={drawerId}
				{sidebarOpen}
				unreadNotifications={data.unreadNotifications}
				pageTitle={data.pageTitle}
				pageDescription={data.pageDescription}
				backHref={data.backHref}
			/>
			<a
				href="#workspace-content"
				class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-content"
			>
				Skip to content
			</a>
			<main
				id="workspace-content"
				class="flex min-w-0 flex-1 flex-col px-4 py-6 md:px-6 lg:px-8 lg:py-8"
			>
				{@render children()}
			</main>
		</div>

		<div id={`${drawerId}-panel`} class="drawer-side z-30">
			<label for={drawerId} aria-label="Close sidebar" class="drawer-overlay"></label>
			<div class="h-dvh w-64">
				<Sidebar />
			</div>
		</div>
	</div>
{:else if $session.isPending || $session.isRefetching}
	<LoadingPage message="Checking your session..." />
{:else}
	<ErrorPage
		message="You do not have permission to access this page."
		onClose={() => (window.location.href = resolve('/login'))}
	/>
{/if}
