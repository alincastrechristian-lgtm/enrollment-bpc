<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		Bell,
		BookOpen,
		ClipboardCheck,
		Gauge,
		GraduationCap,
		LogOut,
		Settings,
		SquareChartGantt,
		SquareUserRound,
		Users
	} from '@lucide/svelte';

	const menuItems = [
		{ label: 'Dashboard', href: '/user/dashboard', icon: Gauge },
		{ label: 'Applicants', href: '/user/applicants', icon: SquareUserRound },
		{ label: 'Students', href: '/user/students', icon: Users },
		{ label: 'Enrollment', href: '/user/enrollment', icon: ClipboardCheck },
		{ label: 'Subjects', href: '/user/subjects', icon: BookOpen },
		{ label: 'Programs', href: '/user/programs', icon: GraduationCap },
		{ label: 'Notifications', href: '/user/notifications', icon: Bell },
		{ label: 'Reports', href: '/user/reports', icon: SquareChartGantt },
		{ label: 'Settings', href: '/user/settings', icon: Settings }
	] as const;

	const isActive = (href: string) => {
		const currentPath = page.url.pathname;
		return currentPath === href || currentPath.startsWith(href + '/');
	};

	let navEl = $state<HTMLElement | null>(null);
	let activeIndex = $state(0);
	let indicatorStyle = $state('');

	$effect(() => {
		const idx = menuItems.findIndex((item) => isActive(item.href));
		activeIndex = idx === -1 ? 0 : idx;
	});

	$effect(() => {
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
</script>

<aside
	class="h-full w-full overflow-hidden bg-slate-900 text-slate-100 shadow-2xl shadow-slate-900/30"
>
	<div
		class="border-b border-slate-700/60 bg-linear-to-r from-emerald-700 to-emerald-600 px-5 py-4"
	>
		<div class="flex items-center">
			<div class="flex items-center gap-3">
				<div
					class="grid h-16 w-16 place-content-center rounded-full bg-white text-sm font-black text-slate-800"
				>
					BPC
				</div>
				<div>
					<p class="text-xs leading-tight font-bold tracking-wide text-white/90">ENROLLMENT</p>
					<p class="text-xs leading-tight font-bold tracking-wide text-white/90">SYSTEM</p>
				</div>
			</div>
		</div>
	</div>

	<div class="flex h-[calc(100%-5.5rem)] flex-col">
		<div class="px-5 py-4">
			<p class="text-2xl font-extrabold tracking-tight text-white">REGISTRAR</p>
		</div>

		<nav class="relative flex-1 overflow-y-auto px-3 pb-4" bind:this={navEl}>
			<!-- sliding highlight indicator -->
			<div
				class="pointer-events-none absolute left-0 w-full transition-all duration-300 ease-in-out"
				style={indicatorStyle}
			>
				<div class="mx-3 h-full rounded-xl bg-emerald-700 shadow-lg shadow-emerald-900/30"></div>
			</div>

			<ul class="space-y-1">
				{#each menuItems as item, index (item.label)}
					<li>
						<a
							href={resolve(item.href)}
							data-menu-item
							class={`group relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
								activeIndex === index
									? 'text-white'
									: 'text-slate-200 hover:bg-slate-800 hover:text-white'
							}`}
						>
							<item.icon
								class={`h-4.5 w-4.5 ${activeIndex === index ? 'text-white' : 'text-slate-400 group-hover:text-slate-100'}`}
								strokeWidth={2.2}
							/>
							{item.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		<div class="px-3 pb-3">
			<button
				type="button"
				class="group flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-red-400/50 hover:bg-red-500/15 hover:text-red-200"
			>
				<LogOut class="h-4.5 w-4.5 text-slate-400 group-hover:text-red-300" strokeWidth={2.2} />
				Logout
			</button>
		</div>

		<div class="border-t border-slate-800 px-5 py-4">
			<p class="text-[10px] tracking-wide text-slate-500">BPC • COLLEGE ENROLLMENT SYSTEM</p>
		</div>
	</div>
</aside>
