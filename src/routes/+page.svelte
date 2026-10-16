<script lang="ts">
	import { resolve } from '$app/paths';
	import ThemeController from '#lib/components/ThemeController/ThemeController.svelte';
	import {
		ArrowRight,
		ArrowUpRight,
		BookOpen,
		Check,
		ChevronRight,
		ClipboardCheck,
		GraduationCap,
		Layers,
		LockKeyhole,
		Mail,
		Moon,
		ShieldCheck,
		Sun,
		UserRound,
		Users
	} from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const portalHref = $derived(data.signedIn ? resolve('/user/dashboard') : resolve('/login'));
	const portalLabel = $derived(data.signedIn ? 'Open dashboard' : 'Sign in to portal');
	const features = [
		{
			icon: ClipboardCheck,
			title: 'Enrollment, in one view.',
			description:
				'Find your program, term, section, and enrolled subjects together. Look back at previous terms whenever you need to.'
		},
		{
			icon: BookOpen,
			title: 'A clearer academic path.',
			description:
				'Explore your assigned curriculum, see how subjects fit into each semester, and know what comes next.'
		},
		{
			icon: GraduationCap,
			title: 'Keep up with your progress.',
			description:
				'View released grades, follow up on incomplete subjects, and stay informed about your next enrollment.'
		}
	];
	const steps = [
		{
			number: '01',
			title: 'Start with the Registrar',
			description:
				'New student? Contact the Registrar’s Office to create your student account and provide your personal details.',
			icon: Users
		},
		{
			number: '02',
			title: 'Set up your account',
			description:
				'Open the setup link sent to your email and choose your password. Your account is ready for the portal.',
			icon: Mail
		},
		{
			number: '03',
			title: 'Make yourself at home',
			description:
				'Once the Registrar enrolls you, sign in to review your subjects, curriculum, and academic progress.',
			icon: GraduationCap
		}
	];
</script>

<svelte:head>
	<title>BPC Enrollment Portal | Bulacan Polytechnic College</title>
	<meta
		name="description"
		content="Your Bulacan Polytechnic College enrollment, curriculum, and academic progress in one place. Access the student and registrar portal or learn how to get started."
	/>
</svelte:head>

<div class="min-h-dvh overflow-x-clip bg-base-100 text-base-content">
	<a
		href="#main-content"
		class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-content"
	>
		Skip to content
	</a>

	<header class="border-b border-base-300 bg-base-100">
		<nav
			class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-5 sm:px-8 lg:px-10"
			aria-label="Main navigation"
		>
			<a
				href={resolve('/')}
				aria-label="BPC Enrollment Portal home"
				class="flex min-w-0 items-center gap-3"
			>
				<span
					class="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-sm font-black text-primary-content"
				>
					BPC
				</span>
				<span class="min-w-0">
					<span class="block text-sm font-bold tracking-tight">Enrollment Portal</span>
					<span class="mt-0.5 hidden text-[11px] text-base-content/55 sm:block">
						Bulacan Polytechnic College
					</span>
				</span>
			</a>
			<div class="hidden items-center gap-7 text-sm font-medium text-base-content/60 lg:flex">
				<a href="#features" class="transition-colors hover:text-primary">The portal</a>
				<a href="#getting-started" class="transition-colors hover:text-primary">Getting started</a>
				<a href="#support" class="transition-colors hover:text-primary">Need help?</a>
			</div>
			<div class="flex shrink-0 items-center gap-2 sm:gap-3">
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
				<a href={portalHref} class="btn gap-2 btn-primary btn-sm">
					{data.signedIn ? 'Dashboard' : 'Sign in'}<ArrowUpRight
						class="size-3.5"
						aria-hidden="true"
					/>
				</a>
			</div>
		</nav>
	</header>

	<main id="main-content">
		<section
			class="relative isolate overflow-hidden border-b border-base-300 bg-base-200/50"
			aria-labelledby="hero-title"
		>
			<div
				class="pointer-events-none absolute -top-40 -right-40 -z-10 size-[42rem] rounded-full bg-primary/5 blur-3xl"
				aria-hidden="true"
			></div>
			<div
				class="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-10 lg:py-24"
			>
				<div>
					<p
						class="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-base-100 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-primary"
					>
						<span class="size-1.5 rounded-full bg-primary" aria-hidden="true"></span>
						A connected college experience
					</p>
					<h1
						id="hero-title"
						class="max-w-xl text-4xl leading-[1.12] font-bold tracking-tight sm:text-5xl lg:text-6xl"
					>
						Your next chapter.
						<br />
						<span class="text-primary">All in one place.</span>
					</h1>
					<p class="mt-6 max-w-lg text-base leading-relaxed text-base-content/65 sm:text-lg">
						Less time looking for information. More time moving forward. Your enrollment,
						curriculum, and academic progress—together in the BPC Enrollment Portal.
					</p>
					<div class="mt-8 flex flex-wrap items-center gap-3">
						<a href={portalHref} class="btn gap-3 btn-primary">
							{portalLabel}<ArrowRight class="size-4" aria-hidden="true" />
						</a>
						<a href="#getting-started" class="btn gap-2 border-base-300 bg-base-100 btn-outline">
							New here? Start here<ChevronRight class="size-4" aria-hidden="true" />
						</a>
					</div>
					<p class="mt-5 flex items-center gap-2 text-xs text-base-content/50">
						<ShieldCheck class="size-4 shrink-0 text-primary" aria-hidden="true" />For BPC students,
						registrars, and administrators.
					</p>
				</div>

				<div
					class="relative mx-auto w-full max-w-lg lg:mx-0"
					aria-label="An overview of your academic journey in the portal"
				>
					<div
						class="pointer-events-none absolute inset-4 -z-10 rotate-3 rounded-3xl border border-primary/15 bg-primary/5"
						aria-hidden="true"
					></div>
					<div
						class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl shadow-primary/5"
					>
						<div
							class="flex items-center justify-between gap-3 border-b border-base-300 bg-base-200/50 px-5 py-4 sm:px-6"
						>
							<span class="flex items-center gap-2 text-xs font-bold">
								<Layers class="size-4 text-primary" aria-hidden="true" />Your academic journey
							</span>
							<span
								class="rounded-full border border-base-300 bg-base-100 px-2.5 py-1 text-[10px] font-medium text-base-content/55"
							>
								BPC Portal
							</span>
						</div>
						<div class="p-5 sm:p-7">
							<div class="flex items-start gap-3">
								<span
									class="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"
								>
									<GraduationCap class="size-6" aria-hidden="true" />
								</span>
								<div>
									<p class="text-[10px] font-bold tracking-widest text-primary uppercase">
										A place for your progress
									</p>
									<h2 class="mt-1 text-xl font-bold tracking-tight">Stay on top of what’s next.</h2>
									<p class="mt-1 text-xs leading-relaxed text-base-content/50">
										One account. A clearer view of college.
									</p>
								</div>
							</div>
							<div class="my-6 rounded-xl border border-primary/15 bg-primary/5 p-4">
								<div class="flex items-center justify-between gap-3">
									<span class="text-xs font-semibold">Your enrollment</span>
									<ClipboardCheck class="size-4 text-primary" aria-hidden="true" />
								</div>
								<p class="mt-2 text-sm font-bold">Your program. Your subjects. Your next step.</p>
								<p class="mt-1.5 text-xs leading-relaxed text-base-content/55">
									Review your current term and keep your academic history close.
								</p>
								<div class="mt-4 flex flex-wrap gap-2 text-[10px] font-medium text-base-content/65">
									<span class="rounded-md border border-primary/10 bg-base-100 px-2 py-1">
										Program & section
									</span>
									<span class="rounded-md border border-primary/10 bg-base-100 px-2 py-1">
										Subjects & units
									</span>
									<span class="rounded-md border border-primary/10 bg-base-100 px-2 py-1">
										Enrollment history
									</span>
								</div>
							</div>
							<div class="grid grid-cols-2 gap-3">
								<div class="rounded-xl border border-base-300 p-4">
									<BookOpen class="size-5 text-primary" aria-hidden="true" />
									<h3 class="mt-3 text-xs font-bold">Know your curriculum</h3>
									<p class="mt-1.5 text-[11px] leading-relaxed text-base-content/50">
										See the path ahead, semester by semester.
									</p>
								</div>
								<div class="rounded-xl border border-base-300 p-4">
									<GraduationCap class="size-5 text-primary" aria-hidden="true" />
									<h3 class="mt-3 text-xs font-bold">Follow your progress</h3>
									<p class="mt-1.5 text-[11px] leading-relaxed text-base-content/50">
										Find released grades and academic next steps.
									</p>
								</div>
							</div>
						</div>
						<div
							class="flex items-center gap-2 border-t border-base-300 bg-base-200/35 px-5 py-3 text-[11px] text-base-content/55 sm:px-6"
						>
							<LockKeyhole class="size-3.5 text-primary" aria-hidden="true" />Your academic records
							are available after sign-in.
						</div>
					</div>
				</div>
			</div>
		</section>

		<section
			id="features"
			class="scroll-mt-8 border-b border-base-300"
			aria-labelledby="features-title"
		>
			<div class="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
				<div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
					<div>
						<p class="text-[11px] font-bold tracking-widest text-primary uppercase">
							Built around your journey
						</p>
						<h2 id="features-title" class="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
							A little more clarity. Every term.
						</h2>
					</div>
					<p class="max-w-sm text-sm leading-relaxed text-base-content/55">
						The information you need to stay informed, organized, and ready for your next step.
					</p>
				</div>
				<div class="mt-9 grid gap-5 md:grid-cols-3">
					{#each features as feature (feature.title)}
						<article class="rounded-2xl border border-base-300 bg-base-100 p-6">
							<span class="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
								<feature.icon class="size-5" aria-hidden="true" />
							</span>
							<h3 class="mt-6 text-base font-bold">{feature.title}</h3>
							<p class="mt-3 text-sm leading-relaxed text-base-content/60">{feature.description}</p>
						</article>
					{/each}
				</div>
			</div>
		</section>

		<section id="getting-started" class="scroll-mt-8 bg-base-200/45" aria-labelledby="steps-title">
			<div class="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
				<div class="max-w-xl">
					<p class="text-[11px] font-bold tracking-widest text-primary uppercase">
						Your first steps
					</p>
					<h2 id="steps-title" class="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
						New to the portal? You’re in the right place.
					</h2>
					<p class="mt-4 text-sm leading-relaxed text-base-content/60">
						Enrollment starts with a conversation. The Registrar’s Office will help you create your
						account and get ready for your term.
					</p>
				</div>
				<ol class="mt-10 grid gap-8 md:grid-cols-3">
					{#each steps as step (step.number)}
						<li class="relative">
							<div class="mb-5 flex items-center gap-4">
								<span
									class="grid size-11 shrink-0 place-items-center rounded-full border border-primary/20 bg-base-100 text-sm font-bold text-primary"
								>
									{step.number}
								</span>
								<span class="h-px flex-1 bg-base-300" aria-hidden="true"></span>
								<step.icon class="size-5 shrink-0 text-primary/65" aria-hidden="true" />
							</div>
							<h3 class="text-base font-bold">{step.title}</h3>
							<p class="mt-3 text-sm leading-relaxed text-base-content/60">{step.description}</p>
						</li>
					{/each}
				</ol>
				<div
					class="mt-9 flex items-start gap-3 rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5"
				>
					<ShieldCheck class="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
					<p class="text-xs leading-relaxed text-base-content/60">
						<span class="font-semibold text-base-content/80">Already have an account?</span>
						 No need to register again. Sign in using the email and password associated with your BPC
						portal account.
					</p>
				</div>
			</div>
		</section>

		<section class="border-y border-base-300" aria-labelledby="access-title">
			<div class="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
				<div class="text-center">
					<p class="text-[11px] font-bold tracking-widest text-primary uppercase">
						One portal, connected people
					</p>
					<h2 id="access-title" class="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
						Your workspace is waiting.
					</h2>
				</div>
				<div class="mx-auto mt-9 grid max-w-4xl gap-5 md:grid-cols-2">
					<article
						class="flex flex-col rounded-2xl border border-base-300 bg-base-200/35 p-6 sm:p-7"
					>
						<div class="flex items-center gap-3">
							<span class="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
								<UserRound class="size-5" aria-hidden="true" />
							</span>
							<div>
								<h3 class="font-bold">For students</h3>
								<p class="mt-0.5 text-xs text-base-content/50">
									Your college record, close at hand.
								</p>
							</div>
						</div>
						<ul class="my-6 space-y-3 text-sm text-base-content/65">
							{#each ['Review your enrollment and subjects', 'Explore your assigned curriculum', 'See released grades and follow-up requests'] as item (item)}
								<li class="flex items-start gap-2">
									<Check class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{item}
								</li>
							{/each}
						</ul>
						<a
							href={portalHref}
							class="mt-auto inline-flex items-center justify-between border-t border-base-300 pt-5 text-sm font-semibold text-primary hover:underline"
						>
							{data.signedIn ? 'Go to your dashboard' : 'Student sign in'}<ArrowRight
								class="size-4"
								aria-hidden="true"
							/>
						</a>
					</article>
					<article
						class="flex flex-col rounded-2xl border border-base-300 bg-base-200/35 p-6 sm:p-7"
					>
						<div class="flex items-center gap-3">
							<span class="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
								<Users class="size-5" aria-hidden="true" />
							</span>
							<div>
								<h3 class="font-bold">For registrars & administrators</h3>
								<p class="mt-0.5 text-xs text-base-content/50">
									Keep every student’s next step moving.
								</p>
							</div>
						</div>
						<ul class="my-6 space-y-3 text-sm text-base-content/65">
							{#each ['Create student accounts and manage enrollment', 'Review grades, clearance, and follow-ups', 'Track enrollment activity from your dashboard'] as item (item)}
								<li class="flex items-start gap-2">
									<Check class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{item}
								</li>
							{/each}
						</ul>
						<a
							href={portalHref}
							class="mt-auto inline-flex items-center justify-between border-t border-base-300 pt-5 text-sm font-semibold text-primary hover:underline"
						>
							{data.signedIn ? 'Go to your dashboard' : 'Staff sign in'}<ArrowRight
								class="size-4"
								aria-hidden="true"
							/>
						</a>
					</article>
				</div>
			</div>
		</section>

		<section id="support" class="scroll-mt-8" aria-labelledby="support-title">
			<div
				class="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:px-10 lg:py-20"
			>
				<div>
					<p class="text-[11px] font-bold tracking-widest text-primary uppercase">
						A little help along the way
					</p>
					<h2 id="support-title" class="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
						Let’s get you unstuck.
					</h2>
					<p class="mt-4 max-w-sm text-sm leading-relaxed text-base-content/60">
						For account, enrollment, or academic-record concerns, contact the Registrar’s Office.
						They’ll help you find the right next step.
					</p>
					<a
						href={resolve('/forgot-password')}
						class="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
					>
						Reset your password<ArrowUpRight class="size-4" aria-hidden="true" />
					</a>
				</div>
				<div class="space-y-3">
					<details class="group rounded-xl border border-base-300 bg-base-100">
						<summary
							class="flex cursor-pointer list-none items-center justify-between gap-3 p-5 text-sm font-semibold"
						>
							How do I get a student account?<ChevronRight
								class="size-4 shrink-0 text-primary transition-transform group-open:rotate-90"
								aria-hidden="true"
							/>
						</summary>
						<p class="px-5 pb-5 text-sm leading-relaxed text-base-content/60">
							The Registrar’s Office creates your account. Provide your name, email, address, and
							contact number, then check your email for your account setup link.
						</p>
					</details>
					<details class="group rounded-xl border border-base-300 bg-base-100">
						<summary
							class="flex cursor-pointer list-none items-center justify-between gap-3 p-5 text-sm font-semibold"
						>
							I forgot my password. What should I do?<ChevronRight
								class="size-4 shrink-0 text-primary transition-transform group-open:rotate-90"
								aria-hidden="true"
							/>
						</summary>
						<p class="px-5 pb-5 text-sm leading-relaxed text-base-content/60">
							Use <a
								href={resolve('/forgot-password')}
								class="font-semibold text-primary underline underline-offset-2"
							>
								Forgot password
							</a>
							 and enter your account’s email address to request a reset link. If you no longer have access
							to that email, contact the Registrar’s Office.
						</p>
					</details>
					<details class="group rounded-xl border border-base-300 bg-base-100">
						<summary
							class="flex cursor-pointer list-none items-center justify-between gap-3 p-5 text-sm font-semibold"
						>
							When will my grades appear?<ChevronRight
								class="size-4 shrink-0 text-primary transition-transform group-open:rotate-90"
								aria-hidden="true"
							/>
						</summary>
						<p class="px-5 pb-5 text-sm leading-relaxed text-base-content/60">
							Grades appear after they have been finalized by the Registrar or an administrator.
							Sign in to check your enrollment record and dashboard for updates.
						</p>
					</details>
				</div>
			</div>
		</section>

		<section class="mx-auto max-w-7xl px-5 pb-16 sm:px-8 lg:px-10" aria-labelledby="cta-title">
			<div class="relative overflow-hidden rounded-2xl bg-primary p-7 text-primary-content sm:p-10">
				<div
					class="pointer-events-none absolute -top-20 -right-10 size-64 rounded-full border-[32px] border-primary-content/5"
					aria-hidden="true"
				></div>
				<div class="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
					<div>
						<h2 id="cta-title" class="text-2xl font-bold tracking-tight">
							Ready for your next step?
						</h2>
						<p class="mt-2 max-w-lg text-sm leading-relaxed text-primary-content/85">
							Your college journey has a home. Pick up where you left off.
						</p>
					</div>
					<a
						href={portalHref}
						class="btn shrink-0 gap-3 border-none bg-base-100 text-base-content hover:bg-base-200"
					>
						{portalLabel}<ArrowRight class="size-4" aria-hidden="true" />
					</a>
				</div>
			</div>
		</section>
	</main>

	<footer class="border-t border-base-300 bg-base-200/35">
		<div
			class="mx-auto flex max-w-7xl flex-col justify-between gap-5 px-5 py-7 sm:flex-row sm:items-center sm:px-8 lg:px-10"
		>
			<div class="flex items-center gap-3">
				<span
					class="grid size-9 place-items-center rounded-lg border border-base-300 bg-base-100 text-[11px] font-black text-primary"
				>
					BPC
				</span>
				<div>
					<p class="text-xs font-bold">Bulacan Polytechnic College</p>
					<p class="mt-1 text-[11px] text-base-content/50">College Enrollment System</p>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-base-content/55">
				<a href="#support" class="hover:text-primary">Help & support</a>
				<a href={resolve('/forgot-password')} class="hover:text-primary">Forgot password</a>
				<a href={portalHref} class="font-semibold text-primary hover:underline">
					{data.signedIn ? 'Dashboard' : 'Portal sign in'}
				</a>
			</div>
		</div>
	</footer>
</div>
