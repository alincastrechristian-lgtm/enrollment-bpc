<script lang="ts">
	import EnrollmentPage from '../../EnrollmentPage.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<EnrollmentPage {data} />
