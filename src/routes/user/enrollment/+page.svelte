<script lang="ts">
	import EnrollmentHistory from '#lib/components/EnrollmentHistory.svelte';
	import { GraduationCap } from '@lucide/svelte';
	import type { PageProps } from './$types';
	import StudentClearance from './StudentClearance.svelte';
	import StudentDocuments from '#lib/components/documents/StudentDocuments.svelte';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>My enrollment | BPC Enrollment System</title></svelte:head>

<section class="w-full space-y-6">
	<StudentClearance />
	<StudentDocuments />
	{#if data.record}
		<p class="flex flex-wrap items-center gap-2 text-xs text-base-content/60">
			<GraduationCap class="size-4 text-primary" aria-hidden="true" />
			Student number
			<span class="font-mono font-semibold">{data.record.studentId}</span>
		</p>
	{/if}
	{#key data.record?.studentId}
		<EnrollmentHistory
			currentOnly
			enrollments={data.record?.enrollments ?? []}
			currentEnrollmentId={data.record?.currentEnrollmentId}
		/>
	{/key}
</section>
