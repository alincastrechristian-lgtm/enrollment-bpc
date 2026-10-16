<script lang="ts">
	import { authClient } from '#lib/auth-client.js';
	import { resolve } from '$app/paths';
	import ErrorPage from '#lib/components/Popup/ErrorPopup.svelte';
	import StaffDashboard from '#lib/pages/Dashboard/Staff/Dashboard.svelte';
	import StudentDashboard from '#lib/pages/Dashboard/Student/Dashboard.svelte';
	import { Role } from '#lib/Roles.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const session = authClient.useSession();
</script>

{#if $session && $session.data}
	{#if ($session.data.user.role === Role.ADMIN || $session.data.user.role === Role.REGISTRAR) && data.staffDashboard}
		<StaffDashboard data={data.staffDashboard} name={data.staffName ?? $session.data.user.name} />
	{:else if $session.data.user.role === Role.STUDENT && data.studentDashboard}
		<StudentDashboard data={data.studentDashboard} inbox={data.notificationInbox} />
	{:else}
		<ErrorPage
			message="You do not have permission to access this page."
			onClose={() => (window.location.href = resolve('/login'))}
		/>
	{/if}
{/if}
