<script lang="ts">
	import { authClient } from '#lib/auth-client.js';
	import { LogOut, Moon, Sun } from '@lucide/svelte';
	import SidebarNavigation from './SidebarNavigation.svelte';
	import { getSidebarItems } from './navigation';
	import { showYesNo } from '../Popup/Popup.svelte';
	import ThemeController from '../ThemeController/ThemeController.svelte';

	const session = authClient.useSession();

	const sidebarItems = $derived(getSidebarItems($session?.data?.user.role));

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
		<SidebarNavigation items={sidebarItems} />

		<!-- Theme -->
		<ThemeController>
			{#snippet children({ isDark, toggleTheme })}
				<div class="px-3 pb-3">
					<label
						class="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-base-content/10 bg-base-200 px-4 py-2.5 transition-colors hover:bg-base-content/10"
					>
						<div class="swap swap-rotate">
							<input
								type="checkbox"
								class="theme-controller"
								value={isDark}
								onclick={toggleTheme}
							/>

							<Sun class="h-5 w-5 swap-on text-base-content/70" />

							<Moon class="h-5 w-5 swap-off text-base-content/70" />
						</div>

						<span class="text-sm font-semibold text-base-content"> Theme </span>
					</label>
				</div>
			{/snippet}
		</ThemeController>

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
