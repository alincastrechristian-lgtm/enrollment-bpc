<script lang="ts">
	import CatalogPage from '#lib/components/Catalog/CatalogPage.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<CatalogPage kind="program" {...data} />
