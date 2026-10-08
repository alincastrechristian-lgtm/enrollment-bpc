<script lang="ts">
	import CurriculumEditor from '../../CurriculumEditor.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

{#key data.curriculum.id}<CurriculumEditor {...data} />{/key}
