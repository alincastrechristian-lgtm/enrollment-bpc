<script lang="ts">
	import { authClient } from '#lib/auth-client.js';
	import ErrorPage from '#lib/components/Popup/ErrorPage.svelte';
	import AdminDashboard from '#lib/pages/Dashboard/Admin/Dashboard.svelte';
	import RegistrarDashboard from '#lib/pages/Dashboard/Registrar/Dashboard.svelte';
	import StudentDashboard from '#lib/pages/Dashboard/Student/Dashboard.svelte';
	import { ROLES } from '#lib/Roles.js';

	const session = authClient.useSession();
</script>

{#if $session && $session.data}
	{#if $session.data.user.role === ROLES.ADMIN}
		<AdminDashboard />
	{:else if $session.data.user.role === ROLES.REGISTRAR}
		<RegistrarDashboard />
	{:else if $session.data.user.role === ROLES.STUDENT}
		<StudentDashboard />
	{:else}
		<ErrorPage
			message="You do not have permission to access this page."
			onClose={() => (window.location.href = '/')}
		/>
	{/if}
{/if}
