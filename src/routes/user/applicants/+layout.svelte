<script lang="ts">
	import { authClient } from '#lib/auth-client.js';
	import ErrorPage from '#lib/components/Popup/ErrorPopup.svelte';
	import { Role } from '#lib/Roles.js';

	let { children } = $props();

	const session = authClient.useSession();
</script>

{#if $session && $session.data}
	{#if $session.data.user.role === Role.ADMIN || $session.data.user.role === Role.REGISTRAR}
		{@render children()}
	{:else}
		<ErrorPage
			message="You do not have permission to access this page."
			onClose={() => (window.location.href = '/')}
		/>
	{/if}
{/if}
