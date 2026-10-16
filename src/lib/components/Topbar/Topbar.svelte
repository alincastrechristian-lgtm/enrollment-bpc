<script lang="ts">
	import { authClient } from '#lib/auth-client.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ArrowLeft, Bell, ChevronRight, Menu, Moon, Sun } from '@lucide/svelte';
	import { getSidebarItems, isActiveLink } from '../Sidebar/navigation';
	import ThemeController from '../ThemeController/ThemeController.svelte';
	const session = authClient.useSession();
	let {
		drawerToggleId = 'user-sidebar-drawer',
		pageTitle,
		pageDescription,
		backHref,
		unreadNotifications = 0,
		sidebarOpen = false
	}: {
		drawerToggleId?: string;
		pageTitle?: string;
		pageDescription?: string;
		backHref?: string;
		unreadNotifications?: number;
		sidebarOpen?: boolean;
	} = $props();
	const links = $derived(
		getSidebarItems($session.data?.user.role).flatMap((item) =>
			'children' in item ? item.children : [item]
		)
	);
	const section = $derived(links.find((item) => isActiveLink(item.href, page.url.pathname)));
	const title = $derived(pageTitle ?? section?.label ?? 'Dashboard');
	const detail = $derived(
		!!backHref ||
			(!!section && page.url.pathname.replace(/\/$/, '') !== section.href.replace(/\/$/, ''))
	);
	const initials = $derived(
		($session.data?.user.name ?? 'User')
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part.charAt(0))
			.join('')
			.toUpperCase()
	);
	function toggleSidebar() {
		const control = document.getElementById(drawerToggleId);
		if (control instanceof HTMLInputElement) control.click();
	}
</script>

<header class="sticky top-0 z-20 border-b border-base-300 bg-base-100/95 backdrop-blur-xl">
	<div class="flex min-h-21 w-full items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
		<div class="flex min-w-0 items-center gap-3">
			<button
				type="button"
				class="btn btn-square btn-ghost btn-sm xl:hidden"
				aria-label="Open sidebar"
				aria-controls={`${drawerToggleId}-panel`}
				aria-expanded={sidebarOpen}
				onclick={toggleSidebar}
			>
				<Menu class="size-5" aria-hidden="true" />
			</button>
			{#if detail}
				<button
					type="button"
					class="btn btn-square border-base-300 btn-outline btn-sm"
					aria-label="Back"
					title="Back"
					onclick={() => goto(backHref ?? section?.href ?? resolve('/user/dashboard'))}
				>
					<ArrowLeft class="size-4" aria-hidden="true" />
				</button>
			{/if}
			<div class="min-w-0">
				<nav
					aria-label="Breadcrumb"
					class="mb-1 flex min-w-0 items-center gap-1.5 text-[10px] font-medium text-base-content/45"
				>
					<a href={resolve('/user/dashboard')} class="hover:text-primary">Workspace</a>
					{#if section}
						<ChevronRight class="size-3 shrink-0" aria-hidden="true" />
						<a href={section.href} class="truncate hover:text-primary">{section.label}</a>
					{/if}
					{#if detail}
						<ChevronRight class="size-3 shrink-0" aria-hidden="true" />
						<span class="truncate">Details</span>
					{/if}
				</nav>
				<h1 class="truncate text-sm font-bold tracking-tight sm:text-lg">{title}</h1>
				{#if pageDescription}
					<p class="mt-1 hidden max-w-xl truncate text-xs text-base-content/50 md:block">
						{pageDescription}
					</p>
				{/if}
			</div>
		</div>
		<div class="flex shrink-0 items-center gap-2 sm:gap-4">
			<a
				href={resolve('/user/notifications')}
				class="btn relative btn-square btn-ghost btn-sm"
				aria-label={unreadNotifications > 0
					? `Notifications (${unreadNotifications} unread)`
					: 'Notifications'}
			>
				<Bell class="size-4" aria-hidden="true" />
				{#if unreadNotifications > 0}
					<span
						class="absolute -top-1 -right-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-content"
						aria-hidden="true"
					>
						{unreadNotifications > 99 ? '99+' : unreadNotifications}
					</span>
				{/if}
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
			<span class="hidden h-7 w-px bg-base-300 sm:block" aria-hidden="true"></span>
			<a
				href={resolve('/user/settings/profile')}
				class="flex items-center gap-3 rounded-xl p-1 transition-colors hover:bg-base-200"
				aria-label="View my profile"
			>
				<span class="hidden max-w-40 text-right lg:block">
					<span class="block truncate text-xs font-semibold">{$session.data?.user.name}</span>
					<span class="mt-1 block text-[10px] text-base-content/50 capitalize">
						{$session.data?.user.role === 'admin' ? 'Administrator' : $session.data?.user.role}
					</span>
				</span>
				<span
					class="grid size-9 place-items-center rounded-xl border border-primary/10 bg-primary/10 text-xs font-bold text-primary"
				>
					{initials}
				</span>
			</a>
		</div>
	</div>
</header>
