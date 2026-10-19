<script lang="ts">
	import StaffAccounts from '#lib/components/StaffAccounts.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<StaffAccounts {data} />
