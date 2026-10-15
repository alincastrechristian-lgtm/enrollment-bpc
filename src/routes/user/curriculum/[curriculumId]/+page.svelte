<script lang="ts">
	import CurriculumDetails from '../CurriculumDetails.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<CurriculumDetails {data} />
