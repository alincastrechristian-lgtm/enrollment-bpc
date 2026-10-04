<script lang="ts">
	import { authClient } from '#lib/auth-client.js';
	import { Role } from '#lib/Roles.js';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		Bell,
		BookOpen,
		ClipboardCheck,
		Gauge,
		GraduationCap,
		LogOut,
		Moon,
		Settings,
		SquareChartGantt,
		SquareUserRound,
		Sun,
		Users,
		UserShield
	} from '@lucide/svelte';
	import { showYesNo } from '../Popup/Popup.svelte';

	const session = authClient.useSession();

	type SidebarItem = {
		label: string;
		href: string;
		icon: typeof Gauge;
	};

	const adminItems: SidebarItem[] = [
		{ label: 'Dashboard', href: '/user/dashboard', icon: Gauge },
		{ label: 'Registrars', href: '/user/registrars', icon: UserShield },
		{ label: 'Applicants', href: '/user/applicants', icon: SquareUserRound },
		{ label: 'Students', href: '/user/students', icon: Users },
		{ label: 'Enrollment', href: '/user/enrollment', icon: ClipboardCheck },
		{ label: 'Subjects', href: '/user/subjects', icon: BookOpen },
		{ label: 'Programs', href: '/user/programs', icon: GraduationCap },
		{ label: 'Notifications', href: '/user/notifications', icon: Bell },
		{ label: 'Reports', href: '/user/reports', icon: SquareChartGantt },
		{ label: 'Settings', href: '/user/settings', icon: Settings }
	] as const;

	const registrarItems: SidebarItem[] = [
		{ label: 'Dashboard', href: '/user/dashboard', icon: Gauge },
		{ label: 'Applicants', href: '/user/applicants', icon: SquareUserRound },
		{ label: 'Students', href: '/user/students', icon: Users },
		{ label: 'Enrollment', href: '/user/enrollment', icon: ClipboardCheck },
		{ label: 'Notifications', href: '/user/notifications', icon: Bell },
		{ label: 'Reports', href: '/user/reports', icon: SquareChartGantt },
		{ label: 'Settings', href: '/user/settings', icon: Settings }
	] as const;

	const studentItems: SidebarItem[] = [
		{ label: 'Dashboard', href: '/user/dashboard', icon: Gauge },
		{ label: 'Enrollment', href: '/user/enrollment', icon: ClipboardCheck },
		{ label: 'Subjects', href: '/user/subjects', icon: BookOpen },
		{ label: 'Notifications', href: '/user/notifications', icon: Bell },
		{ label: 'Settings', href: '/user/settings', icon: Settings }
	] as const;

	const sidebarItems = $derived.by(() => {
		if (!$session || !$session.data) return [] as SidebarItem[];

		return $session.data.user.role === Role.ADMIN
			? adminItems
			: $session.data.user.role === Role.REGISTRAR
				? registrarItems
				: studentItems;
	});

	const isActive = (href: string) => {
		const currentPath = page.url.pathname;
		return currentPath === href || currentPath.startsWith(href + '/');
	};

	let navEl = $state<HTMLElement | null>(null);
	let activeIndex = $state(0);
	let indicatorStyle = $state('');

	$effect(() => {
		// Make this effect rerun when the sidebar items are populated

		// Make this effect rerun when the page URL changes
		const idx = sidebarItems.findIndex((item) => isActive(item.href));
		activeIndex = idx === -1 ? 0 : idx;

		if (!navEl) return;

		const items = navEl.querySelectorAll<HTMLElement>('[data-menu-item]');
		const activeItem = items[activeIndex];

		if (!activeItem) return;

		const update = () => {
			const rect = activeItem.getBoundingClientRect();
			const navRect = navEl!.getBoundingClientRect();

			indicatorStyle = `top:${rect.top - navRect.top}px;height:${rect.height}px;`;
		};

		update();

		const observer = new ResizeObserver(update);
		observer.observe(activeItem);

		return () => observer.disconnect();
	});

	async function logout() {
		if (!(await showYesNo('Are you sure you want to log out?'))) {
			return;
		}

		await authClient.signOut();
		window.location.href = '/';
	}
</script>

<aside
	class="h-full w-full overflow-hidden bg-base-300 text-base-content shadow-2xl shadow-base-content/10"
>
	<!-- Header -->
	<div class="border-b border-base-content/10 bg-primary px-5 py-4 text-primary-content">
		<div class="flex items-center">
			<div class="flex items-center gap-3">
				<div
					class="grid h-16 w-16 place-content-center rounded-full bg-base-100 text-sm font-black text-base-content"
				>
					BPC
				</div>

				<div>
					<p class="text-xs leading-tight font-bold tracking-wide opacity-90">ENROLLMENT</p>
					<p class="text-xs leading-tight font-bold tracking-wide opacity-90">SYSTEM</p>
				</div>
			</div>
		</div>
	</div>

	<div class="flex h-[calc(100%-5.5rem)] flex-col">
		<!-- Navigation -->
		<nav class="relative flex-1 overflow-y-auto px-3 py-4" bind:this={navEl}>
			<!-- Sliding active indicator -->
			<div
				class="pointer-events-none absolute left-0 w-full transition-all duration-300 ease-in-out"
				style={indicatorStyle}
			>
				<div class="mx-3 h-full rounded-xl bg-primary shadow-lg shadow-primary/20"></div>
			</div>

			<ul class="space-y-1">
				{#each sidebarItems as item, index (item.label)}
					<li>
						<a
							href={resolve(item.href)}
							data-menu-item
							class={`group relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
								activeIndex === index
									? 'text-primary-content'
									: 'text-base-content/80 hover:bg-base-200 hover:text-base-content'
							}`}
						>
							<item.icon
								class={`h-4.5 w-4.5 ${
									activeIndex === index
										? 'text-primary-content'
										: 'text-base-content/50 group-hover:text-base-content'
								}`}
								strokeWidth={2.2}
							/>

							{item.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		<!-- Theme -->
		<div class="px-3 pb-3">
			<label
				class="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-base-content/10 bg-base-200 px-4 py-2.5 transition-colors hover:bg-base-content/10"
			>
				<div class="swap swap-rotate">
					<input type="checkbox" class="theme-controller" value="dark" />

					<Sun class="h-5 w-5 swap-on text-base-content/70" />

					<Moon class="h-5 w-5 swap-off text-base-content/70" />
				</div>

				<span class="text-sm font-semibold text-base-content"> Theme </span>
			</label>
		</div>

		<!-- Logout -->
		<div class="px-3 pb-3">
			<button
				type="button"
				onclick={logout}
				class="group flex w-full items-center gap-3 rounded-xl border border-base-content/10 bg-base-200 px-4 py-3 text-sm font-semibold text-base-content/80 transition-colors hover:border-error/30 hover:bg-error/10 hover:text-error"
			>
				<LogOut class="h-4.5 w-4.5 text-base-content/50 group-hover:text-error" strokeWidth={2.2} />

				Logout
			</button>
		</div>

		<!-- Footer -->
		<div class="border-t border-base-content/10 px-5 py-4">
			<p class="text-[10px] tracking-wide text-base-content/40">BPC • COLLEGE ENROLLMENT SYSTEM</p>
		</div>
	</div>
</aside>
