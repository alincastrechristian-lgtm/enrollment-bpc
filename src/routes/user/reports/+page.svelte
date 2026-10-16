<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowUpRight, BarChart3, BookOpen, ClipboardList, Users } from '@lucide/svelte';
</script>

<svelte:head><title>Reports | BPC Enrollment Portal</title></svelte:head>
<section class="w-full space-y-6" aria-label="Reports">
	<div
		class="portal-panel flex flex-col items-start justify-between gap-6 p-6 sm:p-9 lg:flex-row lg:items-center"
	>
		<div class="flex max-w-2xl items-start gap-4">
			<span
				class="grid size-14 shrink-0 place-items-center rounded-2xl border border-primary/10 bg-primary/5 text-primary"
			>
				<BarChart3 class="size-6" aria-hidden="true" />
			</span>
			<div>
				<span
					class="rounded-full border border-base-300 bg-base-200 px-2.5 py-1 text-[10px] font-semibold text-base-content/55"
				>
					Coming soon
				</span>
				<h2 class="mt-4 text-xl font-bold">Reporting is on the way.</h2>
				<p class="mt-3 text-sm leading-relaxed text-base-content/60">
					Dedicated report generation is not available yet. Your dashboard already provides live
					enrollment totals, program breakdowns, grade outcomes, and worklists.
				</p>
			</div>
		</div>
		<a href={resolve('/user/dashboard')} class="btn shrink-0 gap-2 btn-primary btn-sm">
			Open live dashboard<ArrowUpRight class="size-4" aria-hidden="true" />
		</a>
	</div>
	<div class="grid gap-4 md:grid-cols-3">
		{#each [{ icon: Users, title: 'Student records', description: 'Find students by program, year, section, and enrollment.', href: resolve('/user/students') }, { icon: ClipboardList, title: 'Enrollment overview', description: 'Review current activity and the work that needs attention.', href: resolve('/user/dashboard') }, { icon: BookOpen, title: 'Curriculum catalog', description: 'Explore programs, subject requirements, and curricula.', href: resolve('/user/curriculum') }] as item (item.title)}
			<a href={item.href} class="portal-panel group p-6 transition-colors hover:border-primary/30">
				<div class="flex items-center justify-between">
					<item.icon class="size-5 text-primary" aria-hidden="true" /><ArrowUpRight
						class="size-4 text-base-content/30 group-hover:text-primary"
						aria-hidden="true"
					/>
				</div>
				<h3 class="mt-5 text-sm font-bold">{item.title}</h3>
				<p class="mt-2 text-xs leading-relaxed text-base-content/55">{item.description}</p>
			</a>
		{/each}
	</div>
</section>
