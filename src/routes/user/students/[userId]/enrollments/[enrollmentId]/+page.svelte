<script lang="ts">
	import EnrollmentDetails from '../../../EnrollmentDetails.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

{#key `${data.enrollment.id}:${data.enrollment.revision}`}
	<EnrollmentDetails {data} />
{/key}
