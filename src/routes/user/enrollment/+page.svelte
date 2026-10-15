<script lang="ts">
	import EnrollmentHistory from '#lib/components/EnrollmentHistory.svelte';
	import { GraduationCap } from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>My enrollment | BPC Enrollment System</title></svelte:head>

<section class="mx-auto max-w-7xl space-y-6">
	<header class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
		<div class="h-1.5 bg-primary" aria-hidden="true"></div>
		<div class="flex items-center gap-4 p-5 sm:p-6">
			<span
				class="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"
			>
				<GraduationCap class="size-6" aria-hidden="true" />
			</span>
			<div class="min-w-0">
				<h1 class="text-2xl font-bold">My enrollment</h1>
				<p class="mt-1 text-sm text-base-content/60">
					Review your current enrollment, past subjects, and grades.
				</p>
				{#if data.record}
					<p class="mt-2 font-mono text-sm text-base-content/60">{data.record.studentId}</p>
				{/if}
			</div>
		</div>
	</header>
	{#key data.record?.studentId}
		<EnrollmentHistory
			enrollments={data.record?.enrollments ?? []}
			currentEnrollmentId={data.record?.currentEnrollmentId}
		/>
	{/key}
</section>
