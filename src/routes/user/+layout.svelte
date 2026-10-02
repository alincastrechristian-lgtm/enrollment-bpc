<script lang="ts">
	import { authClient } from '#lib/auth-client.js';
	import ErrorPage from '#lib/components/Popup/ErrorPage.svelte';
	import LoadingPage from '#lib/components/Popup/LoadingPage.svelte';
	import Sidebar from '#lib/components/Sidebar/Sidebar.svelte';
	import UserTopbar from '#lib/components/Topbar/Topbar.svelte';

	let { children, data } = $props();
	const session = authClient.useSession();

	const drawerId = 'user-sidebar-drawer';
</script>

{#if $session && $session.data}
	<div class="drawer min-h-dvh bg-base-200 xl:drawer-open">
		<input id={drawerId} type="checkbox" class="drawer-toggle" />

		<div class="drawer-content flex min-h-dvh min-w-0 flex-col">
			<UserTopbar
				drawerToggleId={drawerId}
				pageTitle={data.pageTitle}
				pageDescription={data.pageDescription}
			/>
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
{:else if $session.isPending || $session.isRefetching}
	<LoadingPage message="Checking your session..." />
{:else}
	<ErrorPage
		message="You do not have permission to access this page."
		onClose={() => (window.location.href = '/')}
	/>
{/if}
