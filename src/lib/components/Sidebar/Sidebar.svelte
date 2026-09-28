<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		Bell,
		BookOpen,
		ClipboardCheck,
		Gauge,
		GraduationCap,
		LogOut,
		Settings,
		SquareChartGantt,
		UserCheck,
		Users,
		UserSquare2
	} from '@lucide/svelte';

	const menuItems = [
		{ label: 'Dashboard', href: '/user', icon: Gauge },
		{ label: 'Applicants', href: '/user', icon: UserSquare2 },
		{ label: 'Students', href: '/user', icon: Users },
		{ label: 'Enrollment', href: '/user', icon: ClipboardCheck },
		{ label: 'Subjects', href: '/user', icon: BookOpen },
		{ label: 'Programs', href: '/user', icon: GraduationCap },
		{ label: 'Requirements', href: '/user', icon: UserCheck },
		{ label: 'Notifications', href: '/user', icon: Bell },
		{ label: 'Reports', href: '/user', icon: SquareChartGantt },
		{ label: 'Settings', href: '/user', icon: Settings }
	];
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

		<nav class="flex-1 overflow-y-auto px-3 pb-4">
			<ul class="space-y-1">
				{#each menuItems as item, index (item.label)}
					<li>
						<a
							href={resolve(item.href)}
							class={`group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
								index === 0
									? 'bg-emerald-700 text-white shadow-lg shadow-emerald-900/30'
									: 'text-slate-200 hover:bg-slate-800 hover:text-white'
							}`}
						>
							<item.icon
								class={`h-4.5 w-4.5 ${index === 0 ? 'text-white' : 'text-slate-400 group-hover:text-slate-100'}`}
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
