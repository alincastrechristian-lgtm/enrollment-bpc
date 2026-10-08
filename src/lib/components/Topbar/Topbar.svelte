<script lang="ts">
	import { authClient } from '#lib/auth-client.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ArrowLeft } from '@lucide/svelte';

	const session = authClient.useSession();

	const defaultPageTitle =
		page.url.pathname.at(-1) === '/'
			? 'DASHBOARD'
			: page.url.pathname.split('/').at(-1)?.toUpperCase();

	let isRootPath = $derived(
		page.url.pathname.split('/').filter((segment) => segment !== '').length <= 2
	);

	const pagePath = $derived(
		page.url.pathname
			.split('/')
			.filter((segment) => segment !== '')
			.map((segment) => segment.toUpperCase())
	);

	const previousPath = $derived(
		page.url.pathname
			.split('/')
			.filter((segment) => segment !== '')
			.slice(0, -1)
			.join('/')
	);

	let {
		drawerToggleId = 'user-sidebar-drawer',
		pageTitle = defaultPageTitle,
		pageDescription
	}: {
		drawerToggleId?: string;
		pageTitle?: string;
		pageDescription?: string;
	} = $props();
</script>

<header
	class="sticky top-0 z-20 border-b border-base-300 bg-base-100/85 shadow-sm backdrop-blur-md"
>
	<div class="flex h-19 items-center justify-between px-6 lg:px-10">
		<div class="flex min-w-0 items-center gap-3">
			<label
				for={drawerToggleId}
				class="btn btn-square btn-ghost text-base-content/80 hover:bg-base-200 xl:hidden"
				aria-label="Open sidebar"
			>
				<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M4 7H20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
					<path d="M4 12H20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
					<path d="M4 17H20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
				</svg>
			</label>

			<p
				class="truncate text-xl font-extrabold tracking-wide text-primary uppercase lg:text-[2rem]"
			>
				Bulacan Polytechnic College
			</p>

			<span class="hidden text-xl font-semibold text-primary/90 xl:inline"> - Main Campus </span>
		</div>

		<div class="flex items-center gap-4">
			<div class="hidden text-right lg:block">
				<p class="text-xs font-bold tracking-wide text-base-content/60 uppercase">
					{$session.data?.user.role}
				</p>
				<p class="text-sm font-semibold text-base-content/80">{$session.data?.user.name}</p>
			</div>

			<button
				class="btn btn-circle border-none bg-neutral text-base font-bold text-primary-content hover:bg-neutral/80"
			>
				{$session.data?.user.name
					.split(' ')
					.map((name) => name.charAt(0))
					.join('')
					.toUpperCase()}
			</button>
		</div>
	</div>

	<div
		class="flex items-center justify-between border-t border-base-200 bg-base-200/70 px-6 py-5 lg:px-10"
	>
		<div>
			<h1 class="text-3xl font-black tracking-tight text-base-content">
				{pageTitle}
			</h1>

			{#if pageDescription}
				<p class="mt-1 text-sm text-base-content/60">{pageDescription}</p>
			{/if}

			<p class="mt-1 text-xs font-medium tracking-wide text-base-content/50">
				{#each pagePath as segment, index (index)}
					{#if index === 0 || index === pagePath.length - 1}
						{segment.toUpperCase()}
					{:else}
						<a
							class="link link-hover"
							href={index === 0 ? '/' : `/${pagePath.slice(0, index + 1).join('/')}`}
							>{segment.toUpperCase()}</a
						>
					{/if}
					{#if index < pagePath.length - 1}<span class="mx-1.5">/</span>{/if}
				{/each}
			</p>
		</div>

		{#if !isRootPath}
			<button
				type="button"
				class="btn gap-2 btn-ghost text-base-content/60 btn-sm hover:bg-base-300/60 hover:text-base-content"
				onclick={() => previousPath && goto('/' + previousPath)}
			>
				<ArrowLeft size={17} strokeWidth={2} />
				Back
			</button>
		{/if}
	</div>
</header>
