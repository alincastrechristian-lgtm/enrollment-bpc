<script lang="ts">
	import { authClient } from '#lib/auth-client.js';
	import AdminDashboard from '#lib/pages/Dashboard/Admin/Dashboard.svelte';
	import RegistrarDashboard from '#lib/pages/Dashboard/Registrar/Dashboard.svelte';
	import StudentDashboard from '#lib/pages/Dashboard/Student/Dashboard.svelte';

	const session = authClient.useSession();
</script>

{#if $session && $session.data}
	{#if $session.data.user.role === 'admin'}
		<AdminDashboard />
	{:else if $session.data.user.role === 'registrar'}
		<RegistrarDashboard />
	{:else if $session.data.user.role === 'student'}
		<StudentDashboard />
	{:else}
		<p class="text-center text-lg font-semibold text-error">
			You do not have permission to access this page.
		</p>
	{/if}
{:else}
	<p class="text-center text-lg font-semibold text-error">
		You do not have permission to access this page.
	</p>
{/if}
