<script lang="ts">
	import RecordCatalog from '#lib/components/Catalog/RecordCatalog.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<RecordCatalog kind="program" {...data} />
