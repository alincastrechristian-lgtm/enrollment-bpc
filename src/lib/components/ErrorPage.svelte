<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		ArrowLeft,
		House,
		LogIn,
		RefreshCw,
		SearchX,
		ShieldAlert,
		TriangleAlert
	} from '@lucide/svelte';

	let { embedded = false }: { embedded?: boolean } = $props();

	const details = $derived.by(() => {
		switch (page.status) {
			case 401:
				return {
					title: 'Sign in to continue',
					description: 'Your session may have expired. Sign in to access this page.',
					icon: LogIn
				};
			case 403:
				return {
					title: 'Access denied',
					description: 'Your account does not have permission to access this page.',
					icon: ShieldAlert
				};
			case 404:
				return {
					title: 'Page unavailable',
					description: 'The page or record you requested could not be found.',
					icon: SearchX
				};
			case 409:
				return {
					title: 'Unable to continue',
					description: 'This record has changed or is not ready for this action.',
					icon: TriangleAlert
				};
			case 429:
				return {
					title: 'Please try again shortly',
					description: 'Too many requests were made. Wait a moment before trying again.',
					icon: TriangleAlert
				};
			default:
				return page.status >= 500
					? {
							title: 'Something went wrong',
							description: 'We could not load this page. Please try again in a moment.',
							icon: TriangleAlert
						}
					: {
							title: 'Unable to load this page',
							description: 'We could not complete your request. Go back and try again.',
							icon: TriangleAlert
						};
		}
	});

	// Keep actionable load errors, but give standard HTTP messages useful context.
	const message = $derived(
		page.status < 500 &&
			page.error?.message &&
			!['Unauthorized', 'Forbidden', 'Not Found', 'Conflict', 'Too Many Requests'].includes(
				page.error.message
			)
			? page.error.message
			: details.description
	);
	const home = $derived(
		page.status === 401 ? resolve('/login') : embedded ? resolve('/user/dashboard') : resolve('/')
	);
	const homeLabel = $derived(
		page.status === 401 ? 'Sign in' : embedded ? 'Back to dashboard' : 'Back to home'
	);

	function goBack() {
		if (window.history.length > 1) window.history.back();
		else window.location.assign(home);
	}
</script>

<svelte:head>
	<title>{page.status} · {details.title} | BPC Enrollment Portal</title>
</svelte:head>

<section
	class="flex w-full items-center justify-center bg-base-200 px-4 py-12 text-base-content sm:px-6"
	class:min-h-dvh={!embedded}
	class:min-h-[60vh]={embedded}
	aria-labelledby="page-error-title"
>
	<div class="w-full max-w-xl">
		{#if !embedded}
			<div class="mb-8 flex items-center justify-center gap-3">
				<div
					class="grid size-12 place-items-center rounded-full bg-primary text-sm font-black text-primary-content"
				>
					BPC
				</div>
				<div>
					<p class="text-sm font-bold">Bulacan Polytechnic College</p>
					<p class="text-xs text-base-content/60">Enrollment Portal</p>
				</div>
			</div>
		{/if}

		<div class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
			<div class="h-1.5 bg-primary"></div>
			<div class="p-6 text-center sm:p-10">
				<div
					class="mx-auto mb-6 grid size-20 place-items-center rounded-2xl bg-primary/10 text-primary"
				>
					<details.icon class="size-9" aria-hidden="true" />
				</div>
				<p class="mb-3 text-xs font-bold tracking-widest text-base-content/50 uppercase">
					Error {page.status}
				</p>
				<h1 id="page-error-title" class="text-2xl font-black tracking-tight sm:text-3xl">
					{details.title}
				</h1>
				<p class="mt-4 text-sm leading-relaxed break-words text-base-content/70 sm:text-base">
					{message}
				</p>

				<div class="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
					<a class="btn btn-primary" href={home}>
						{#if page.status === 401}
							<LogIn class="size-4" aria-hidden="true" />
						{:else}
							<House class="size-4" aria-hidden="true" />
						{/if}
						{homeLabel}
					</a>
					{#if page.status >= 500 || page.status === 408 || page.status === 429}
						<a
							class="btn border-base-300 btn-outline"
							href={page.url.pathname + page.url.search}
							data-sveltekit-reload
						>
							<RefreshCw class="size-4" aria-hidden="true" /> Try again
						</a>
					{:else}
						<button type="button" class="btn border-base-300 btn-outline" onclick={goBack}>
							<ArrowLeft class="size-4" aria-hidden="true" /> Go back
						</button>
					{/if}
				</div>
			</div>
			<div
				class="border-t border-base-300 bg-base-200/50 px-6 py-4 text-center text-xs leading-relaxed text-base-content/60"
			>
				{#if page.status === 401}
					Sign in with your student or staff account.
				{:else if page.status === 403}
					If you need access, contact the Registrar's Office.
				{:else}
					If this keeps happening, contact the Registrar's Office.
				{/if}
			</div>
		</div>
	</div>
</section>
