<script lang="ts">
	import { authClient } from '#lib/auth-client.js';
	import { resolve } from '$app/paths';
	import { ArrowUpRight, LogOut, ShieldCheck } from '@lucide/svelte';
	import SidebarNavigation from './SidebarNavigation.svelte';
	import { getSidebarItems } from './navigation';
	import { showError, showYesNo } from '../Popup/Popup.svelte';
	import { getErrorMessage } from '#lib/errors.js';
	const session = authClient.useSession();
	const sidebarItems = $derived(getSidebarItems($session?.data?.user.role));
	let signingOut = $state(false);
	async function logout() {
		if (signingOut || !(await showYesNo('Are you sure you want to log out?'))) return;
		signingOut = true;
		try {
			const result = await authClient.signOut();
			if (result.error) throw result.error;
			window.location.href = resolve('/login');
		} catch (cause) {
			showError(getErrorMessage(cause, 'Could not sign out. Please try again.'));
		} finally {
			signingOut = false;
		}
	}
</script>

<aside class="flex h-full w-full flex-col border-r border-base-300 bg-base-100 text-base-content">
	<a
		href={resolve('/user/dashboard')}
		class="flex shrink-0 items-center gap-3 border-b border-base-300 px-6 py-6"
		aria-label="BPC Enrollment Portal dashboard"
	>
		<span
			class="grid size-11 place-items-center rounded-xl bg-primary text-xs font-black text-primary-content"
		>
			BPC
		</span>
		<span>
			<span class="block text-sm font-bold tracking-tight">Enrollment Portal</span>
			<span class="mt-1 block text-[10px] text-base-content/50">Bulacan Polytechnic College</span>
		</span>
	</a>
	<SidebarNavigation items={sidebarItems} />
	<div class="shrink-0 space-y-3 border-t border-base-300 p-4">
		<div class="rounded-xl border border-primary/10 bg-primary/5 p-3.5">
			<p class="flex items-center gap-2 text-xs font-semibold">
				<ShieldCheck class="size-4 text-primary" aria-hidden="true" />Your BPC workspace
			</p>
			<p class="mt-2 text-[11px] leading-relaxed text-base-content/55">
				Enrollment and academic records, connected.
			</p>
			<a
				href={resolve('/')}
				class="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
			>
				Visit portal home<ArrowUpRight class="size-3" aria-hidden="true" />
			</a>
		</div>
		<button
			type="button"
			disabled={signingOut}
			onclick={logout}
			class="btn w-full justify-start gap-3 border-base-300 bg-base-100 text-base-content/65 btn-sm hover:border-error/25 hover:bg-error/5 hover:text-error"
		>
			<LogOut class="size-4" aria-hidden="true" />{signingOut ? 'Signing out…' : 'Log out'}
		</button>
		<p class="text-center text-[10px] text-base-content/40">BPC · College Enrollment System</p>
	</div>
</aside>
