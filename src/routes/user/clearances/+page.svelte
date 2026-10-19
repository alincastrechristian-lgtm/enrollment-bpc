<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Enrollment requests | BPC Enrollment System</title></svelte:head>
<section class="portal-panel space-y-4 p-5 sm:p-6">
	<div>
		<h1 class="text-lg font-bold">Enrollment requests</h1>
		<p class="mt-1 text-sm text-base-content/65">
			Review the student's clearance, then verify it before creating the next enrollment.
		</p>
	</div>
	{#if data.requests.length}
		<ul class="divide-y divide-base-300">
			{#each data.requests as request (request.id)}
				<li class="flex flex-wrap items-center justify-between gap-3 py-4">
					<div>
						<p class="font-semibold">{request.name}</p>
						<p class="text-xs text-base-content/65">
							{request.studentId} · Semester {request.semester}, {request.schoolYearStart}–{request.schoolYearStart +
								1}
						</p>
						<span
							class={`mt-2 badge badge-sm ${request.status === 'verified' ? 'badge-success' : 'badge-warning'}`}
						>
							{request.status === 'verified'
								? 'Clearance verified — ready for enrollment'
								: 'Awaiting clearance review'}
						</span>
					</div>
					<a
						class="btn btn-primary btn-sm"
						href={resolve('/user/students/[userId]/enrollments/[enrollmentId]', {
							userId: request.userId,
							enrollmentId: request.enrollmentId
						})}
					>
						Review request
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-base-content/65">No pending enrollment requests.</p>
	{/if}
</section>
