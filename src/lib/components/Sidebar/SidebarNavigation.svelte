<script lang="ts">
	import { page } from '$app/state';
	import { ChevronDown } from '@lucide/svelte';
	import { isActiveItem, isActiveLink, type SidebarItem, type SidebarLink } from './navigation';

	let { items }: { items: SidebarItem[] } = $props();
	let expandedGroups = $state<Record<string, boolean>>({});

	$effect(() => {
		const pathname = page.url.pathname;
		expandedGroups = Object.fromEntries(
			items
				.filter((item) => 'children' in item)
				.map((item) => [item.id, isActiveItem(item, pathname)])
		);
	});
</script>

{#snippet link(item: SidebarLink, nested = false)}
	{@const active = isActiveLink(item.href, page.url.pathname)}
	<a
		href={item.href}
		aria-current={active ? 'page' : undefined}
		class={`group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
			active
				? nested
					? 'bg-primary/10 text-primary'
					: 'bg-primary text-primary-content shadow-lg shadow-primary/20'
				: 'text-base-content/80 hover:bg-base-200 hover:text-base-content'
		}`}
	>
		<item.icon
			class={`h-4.5 w-4.5 shrink-0 ${active ? '' : 'text-base-content/50 group-hover:text-base-content'}`}
			strokeWidth={2.2}
			aria-hidden="true"
		/>
		{item.label}
	</a>
{/snippet}

<nav aria-label="Main navigation" class="flex-1 overflow-y-auto px-3 py-4">
	<ul class="space-y-1">
		{#each items as item ('children' in item ? item.id : item.href)}
			<li>
				{#if 'children' in item}
					{@const active = isActiveItem(item, page.url.pathname)}
					<button
						type="button"
						aria-expanded={expandedGroups[item.id] ?? false}
						aria-controls={`sidebar-group-${item.id}`}
						onclick={() => (expandedGroups[item.id] = !expandedGroups[item.id])}
						class={`group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${active ? 'bg-primary text-primary-content shadow-lg shadow-primary/20' : 'text-base-content/80 hover:bg-base-200 hover:text-base-content'}`}
					>
						<item.icon
							class={`h-4.5 w-4.5 shrink-0 ${active ? '' : 'text-base-content/50 group-hover:text-base-content'}`}
							strokeWidth={2.2}
							aria-hidden="true"
						/>
						<span class="flex-1">{item.label}</span>
						<ChevronDown
							class={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${expandedGroups[item.id] ? 'rotate-180' : ''}`}
							aria-hidden="true"
						/>
					</button>
					<ul
						id={`sidebar-group-${item.id}`}
						hidden={!expandedGroups[item.id]}
						class="mt-2 mb-3 ml-6 space-y-1 border-l border-base-content/15 pl-3"
					>
						{#each item.children as child (child.href)}
							<li>{@render link(child, true)}</li>
						{/each}
					</ul>
				{:else}
					{@render link(item)}
				{/if}
			</li>
		{/each}
	</ul>
</nav>
