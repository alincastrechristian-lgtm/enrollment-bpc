<script lang="ts">
	let {
		pageTitle = 'REGISTRAR DASHBOARD',
		pagePath = 'GENERAL / DASHBOARD',
		drawerToggleId = 'user-sidebar-drawer'
	} = $props();
</script>

<header class="sticky top-0 z-20 border-b border-slate-200 bg-white/85 shadow-sm backdrop-blur-md">
	<div class="flex h-19 items-center justify-between px-6 lg:px-10">
		<div class="flex min-w-0 items-center gap-3">
			<label
				for={drawerToggleId}
				class="btn btn-square btn-ghost text-slate-700 hover:bg-slate-100 xl:hidden"
				aria-label="Open sidebar"
			>
				<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M4 7H20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
					<path d="M4 12H20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
					<path d="M4 17H20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
				</svg>
			</label>

			<p
				class="truncate text-xl font-extrabold tracking-wide text-emerald-700 uppercase lg:text-[2rem]"
			>
				Bulacan Polytechnic College
			</p>
			<span class="hidden text-xl font-semibold text-emerald-700/90 xl:inline">- Main Campus</span>
		</div>

		<div class="flex items-center gap-4">
			<div class="hidden text-right lg:block">
				<p class="text-xs font-bold tracking-wide text-slate-500 uppercase">Registrar</p>
				<p class="text-sm font-semibold text-slate-700">R. Coordinator</p>
			</div>
			<button
				class="btn btn-circle border-none bg-slate-900 text-base font-bold text-white hover:bg-slate-800"
				>R</button
			>
		</div>
	</div>

	<div class="border-t border-slate-100 bg-slate-50/70 px-6 py-5 lg:px-10">
		<h1 class="text-3xl font-black tracking-tight text-slate-800">{pageTitle}</h1>
		<p class="mt-1 text-xs font-medium tracking-wide text-slate-500">{pagePath}</p>
	</div>
</header>
