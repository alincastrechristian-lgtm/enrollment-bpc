<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		ArrowLeft,
		ArrowRight,
		BookOpen,
		GraduationCap,
		LockKeyhole,
		Moon,
		ShieldCheck,
		Sun
	} from '@lucide/svelte';
	import ThemeController from '#lib/components/ThemeController/ThemeController.svelte';
	let {
		title,
		description,
		eyebrow = 'Welcome to your portal',
		children
	}: {
		title: string;
		description: string;
		eyebrow?: string;
		children: Snippet;
	} = $props();
</script>

<div class="portal-auth min-h-dvh bg-base-200/50">
	<header class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-6 sm:px-8">
		<a href={resolve('/')} class="flex items-center gap-3" aria-label="BPC Enrollment Portal home">
			<span
				class="grid size-10 place-items-center rounded-xl bg-primary text-xs font-black text-primary-content"
			>
				BPC
			</span>
			<span>
				<span class="block text-sm font-bold">Enrollment Portal</span>
				<span class="mt-0.5 hidden text-[11px] text-base-content/55 sm:block">
					Bulacan Polytechnic College
				</span>
			</span>
		</a>
		<ThemeController>
			{#snippet children({ isDark, toggleTheme })}
				<button
					type="button"
					class="btn btn-square btn-ghost btn-sm"
					aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
					onclick={toggleTheme}
				>
					{#if isDark}
						<Sun class="size-4" aria-hidden="true" />
					{:else}
						<Moon class="size-4" aria-hidden="true" />
					{/if}
				</button>
			{/snippet}
		</ThemeController>
	</header>
	<main
		class="mx-auto grid min-h-[calc(100dvh-6rem)] max-w-7xl items-center gap-12 px-5 pt-4 pb-10 sm:px-8 lg:grid-cols-2 lg:gap-20 lg:py-12"
	>
		<aside class="hidden max-w-lg lg:block" aria-label="About your portal">
			<p class="portal-eyebrow">Your college journey, connected</p>
			<h2 class="mt-5 text-5xl leading-[1.12] font-bold tracking-tight">
				A clearer view.
				<br />
				<span class="text-primary">A confident next step.</span>
			</h2>
			<p class="mt-6 max-w-md text-base leading-relaxed text-base-content/60">
				Your enrollment, academic records, and the people who help you move forward. All together in
				one place.
			</p>
			<div class="mt-9 space-y-5">
				{#each [{ icon: GraduationCap, title: 'Your enrollment, organized', detail: 'Programs, subjects, and previous terms.' }, { icon: BookOpen, title: 'A path for your progress', detail: 'Curriculum and released grades, close at hand.' }, { icon: ShieldCheck, title: 'Support when you need it', detail: 'Your Registrar’s Office is here to help.' }] as item (item.title)}
					<div class="flex items-start gap-3">
						<span
							class="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/10 bg-primary/5 text-primary"
						>
							<item.icon class="size-4.5" aria-hidden="true" />
						</span>
						<div>
							<p class="text-sm font-semibold">{item.title}</p>
							<p class="mt-1 text-xs text-base-content/55">{item.detail}</p>
						</div>
					</div>
				{/each}
			</div>
		</aside>
		<div class="mx-auto w-full max-w-md lg:ml-auto lg:max-w-lg">
			<a
				class="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-base-content/60 hover:text-primary"
				href={resolve('/')}
			>
				<ArrowLeft class="size-3.5" aria-hidden="true" />Back to home
			</a>
			<section class="portal-panel overflow-hidden" aria-labelledby="auth-title">
				<div class="h-1 bg-primary" aria-hidden="true"></div>
				<div class="p-6 sm:p-9">
					<span class="mb-5 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
						<LockKeyhole class="size-5" aria-hidden="true" />
					</span>
					<p class="portal-eyebrow">{eyebrow}</p>
					<h1 id="auth-title" class="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
						{title}
					</h1>
					<p class="mt-3 mb-7 text-sm leading-relaxed text-base-content/60">{description}</p>
					{@render children()}
				</div>
			</section>
			<p class="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-base-content/50">
				<ShieldCheck class="size-3.5" aria-hidden="true" />BPC Enrollment Portal
				<a
					href={resolve('/')}
					class="ml-2 inline-flex items-center gap-1 text-primary hover:underline"
				>
					Learn more<ArrowRight class="size-3" aria-hidden="true" />
				</a>
			</p>
		</div>
	</main>
</div>
