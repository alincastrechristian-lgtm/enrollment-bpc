<script lang="ts">
	import EnrollmentEditor from '../../EnrollmentEditor.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

{#key data.applicant.id}
	<EnrollmentEditor {data} />
{/key}
