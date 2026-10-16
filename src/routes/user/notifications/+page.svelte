<script lang="ts">
	import {
		Bell,
		Check,
		CheckCheck,
		ChevronLeft,
		ChevronRight,
		Inbox,
		Mail,
		Search,
		X
	} from '@lucide/svelte';
	import { goto, refreshAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { emailEventLabels, emailEventTypes } from '#lib/email.js';
	import { readNotifications } from '#lib/actions/notifications.remote.js';
	import { showError } from '#lib/components/Popup/Popup.svelte.js';
	import { getErrorMessage } from '#lib/errors.js';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let selected = $state<string | null>(null);
	let busy = $state(false);
	const canRead = $derived(data.role === 'student');
	const formatter = new Intl.DateTimeFormat('en-PH', {
		timeZone: 'Asia/Manila',
		dateStyle: 'medium',
		timeStyle: 'short'
	});
	const notifications = $derived(
		data.items.map((item) => ({
			...item,
			category: emailEventLabels[item.type],
			date: formatter.format(item.createdAt),
			unread: canRead && !item.readAt
		}))
	);
	const unread = $derived(data.counts.unread);
	const filter = $derived(data.status);
	const current = $derived(notifications.find((item) => item.id === selected));
	function navigate(changes: Record<string, string>) {
		const url = new URL(page.url.href);
		url.searchParams.delete('page');
		for (const [key, value] of Object.entries(changes)) url.searchParams.set(key, value);
		return goto(url);
	}
	async function markRead(id?: string) {
		if (!canRead || busy) return;
		busy = true;
		try {
			await readNotifications(id ? { id } : {});
			await refreshAll();
		} catch (cause) {
			showError(getErrorMessage(cause, 'Could not update notifications. Please try again.'));
		} finally {
			busy = false;
		}
	}
	async function open(id: string) {
		selected = id;
		if (notifications.find((item) => item.id === id)?.unread) await markRead(id);
	}
</script>

<svelte:head><title>Notifications | BPC Enrollment Portal</title></svelte:head>
<section class="flex w-full flex-1 flex-col gap-5" aria-label="Notifications">
	<p class="text-xs text-base-content/60">
		{data.role === 'admin'
			? 'All system notifications, including actions performed by registrars.'
			: data.role === 'registrar'
				? 'Notifications from actions you performed for students.'
				: 'Account and enrollment updates addressed to you.'}
	</p>
	<div class="portal-panel flex flex-1 flex-col overflow-hidden">
		{#if canRead}
			<div
				class="flex flex-col justify-between gap-4 border-b border-base-300 p-4 sm:flex-row sm:items-center sm:p-5"
			>
				<div
					class="flex gap-1 rounded-xl bg-base-200 p-1"
					role="group"
					aria-label="Notification filter"
				>
					<button
						type="button"
						aria-pressed={filter === 'all'}
						onclick={() => navigate({ status: 'all' })}
						class="rounded-lg px-4 py-2 text-xs font-semibold {filter === 'all'
							? 'bg-base-100 text-primary shadow-sm'
							: 'text-base-content/55'}"
					>
						All updates <span class="ml-1 tabular-nums">{data.counts.total}</span>
					</button>
					<button
						type="button"
						aria-pressed={filter === 'unread'}
						onclick={() => navigate({ status: 'unread' })}
						class="rounded-lg px-4 py-2 text-xs font-semibold {filter === 'unread'
							? 'bg-base-100 text-primary shadow-sm'
							: 'text-base-content/55'}"
					>
						Unread <span class="ml-1 tabular-nums">{unread}</span>
					</button>
				</div>
				<button
					class="btn gap-2 border-base-300 btn-outline btn-sm"
					type="button"
					disabled={busy || !unread}
					onclick={() => markRead()}
				>
					<CheckCheck class="size-4" aria-hidden="true" />Mark all as read
				</button>
			</div>
		{/if}
		<form method="GET" class="flex flex-col gap-3 border-b border-base-300 p-4 sm:flex-row sm:p-5">
			<input type="hidden" name="status" value={data.status} />
			<label class="input flex w-full items-center gap-3">
				<Search class="size-4 shrink-0 text-base-content/45" aria-hidden="true" />
				<input
					type="search"
					aria-label="Search notifications"
					placeholder="Search updates…"
					name="q"
					value={data.search}
					class="min-w-0 grow text-sm"
				/>
			</label>
			<select
				name="type"
				aria-label="Notification type"
				value={data.type}
				class="select w-full sm:w-56"
				onchange={(event) => event.currentTarget.form?.requestSubmit()}
			>
				<option value="">All email types</option>
				{#each emailEventTypes as type (type)}
					<option value={type}>{emailEventLabels[type]}</option>
				{/each}
			</select>
			<button class="btn btn-primary" type="submit">Search</button>
		</form>
		<div class="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
			<div class="flex min-w-0 flex-col lg:border-r lg:border-base-300">
				{#each notifications as item (item.id)}
					<button
						type="button"
						onclick={() => open(item.id)}
						disabled={busy}
						aria-pressed={selected === item.id}
						class="flex w-full items-start gap-3 border-b border-base-200 p-5 text-left transition-colors last:border-b-0 hover:bg-base-200/50 sm:px-6 {selected ===
						item.id
							? 'bg-primary/5'
							: ''}"
					>
						<span
							class="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl {item.unread
								? 'bg-primary/10 text-primary'
								: 'bg-base-200 text-base-content/40'}"
						>
							<Mail class="size-4" aria-hidden="true" />
						</span>
						<span class="min-w-0 flex-1">
							<span
								class="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-base-content/50"
							>
								<span class="font-semibold">{item.category}</span>
								<span>{item.date}</span>
							</span>
							<span class="block text-sm {item.unread ? 'font-bold' : 'font-medium'}">
								{item.title}{#if item.unread}
									<span
										class="ml-2 inline-block size-1.5 rounded-full bg-primary"
										aria-label="Unread"
									></span>
								{/if}
							</span>
							{#if data.role !== 'student'}
								<span class="mt-1 block text-xs font-medium text-base-content/65">
									To {item.recipientName}
								</span>
							{/if}
							<span class="mt-2 line-clamp-2 block text-xs leading-relaxed text-base-content/55">
								{item.message}
							</span>
						</span>
						<ChevronRight class="mt-6 size-4 shrink-0 text-base-content/30" aria-hidden="true" />
					</button>
				{:else}
					<div
						class="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center"
						role="status"
					>
						<Inbox class="mx-auto size-8 text-primary/50" aria-hidden="true" />
						<h3 class="mt-4 text-sm font-semibold">You’re all caught up</h3>
						<p class="mt-2 text-xs text-base-content/55">
							No notifications match this view. Try All updates or clear your filters.
						</p>
					</div>
				{/each}
			</div>
			<aside
				class="border-t border-base-300 bg-base-200/20 p-5 sm:p-7 lg:border-t-0"
				aria-label="Notification details"
			>
				{#if current}
					<div class="flex items-center justify-between gap-3">
						<span class="portal-eyebrow">{current.category}</span>
						<button
							type="button"
							class="btn btn-square btn-ghost btn-sm"
							aria-label="Close notification"
							onclick={() => (selected = null)}
						>
							<X class="size-4" aria-hidden="true" />
						</button>
					</div>
					<span
						class="mt-6 grid size-12 place-items-center rounded-2xl border border-primary/10 bg-primary/5 text-primary"
					>
						<Bell class="size-5" aria-hidden="true" />
					</span>
					<h3 class="mt-5 text-xl font-bold tracking-tight">{current.title}</h3>
					<p class="mt-2 text-xs text-base-content/45">{current.date}</p>
					{#if data.role !== 'student'}
						<p class="mt-4 text-xs text-base-content/60">
							To {current.recipientName} · {current.actorName
								? `By ${current.actorName}`
								: 'System event'}
						</p>
					{/if}
					<p class="mt-6 text-sm leading-relaxed whitespace-pre-line text-base-content/70">
						{current.message}
					</p>
					{#if current.enrollmentId}
						<a
							class="btn mt-5 btn-primary btn-sm"
							href={data.role === 'student'
								? resolve('/user/enrollment')
								: resolve('/user/students/[userId]/enrollments/[enrollmentId]', {
										userId: current.recipientId,
										enrollmentId: current.enrollmentId
									})}
						>
							View enrollment
						</a>
					{/if}
					{#if canRead}
						<p
							class="mt-8 flex items-center gap-2 border-t border-base-300 pt-4 text-xs text-base-content/50"
						>
							<Check class="size-4 text-primary" aria-hidden="true" />{busy
								? 'Saving read status…'
								: current.unread
									? 'Unread'
									: 'Read'}
						</p>
					{/if}
				{:else}
					<div class="flex h-full min-h-64 flex-col items-center justify-center text-center">
						<span
							class="grid size-14 place-items-center rounded-2xl border border-base-300 bg-base-100 text-primary"
						>
							<Mail class="size-6" aria-hidden="true" />
						</span>
						<h3 class="mt-5 font-semibold">A little clarity, one update at a time.</h3>
						<p class="mt-3 max-w-xs text-xs leading-relaxed text-base-content/55">
							Select a message to read it here. On mobile, its details appear below the inbox.
						</p>
					</div>
				{/if}
			</aside>
		</div>
		<footer
			class="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 px-5 py-4 text-xs text-base-content/60"
		>
			<p>
				Showing {data.total ? (data.page - 1) * data.pageSize + 1 : 0}–{Math.min(
					data.page * data.pageSize,
					data.total
				)} of {data.total} notifications
			</p>
			{#if data.pages > 1}
				<nav class="flex items-center gap-2" aria-label="Notification pages">
					<button
						class="btn btn-square btn-sm"
						aria-label="Previous page"
						disabled={data.page <= 1}
						onclick={() => navigate({ page: String(data.page - 1) })}
					>
						<ChevronLeft class="size-4" />
					</button>
					<span>{data.page} / {data.pages}</span>
					<button
						class="btn btn-square btn-sm"
						aria-label="Next page"
						disabled={data.page >= data.pages}
						onclick={() => navigate({ page: String(data.page + 1) })}
					>
						<ChevronRight class="size-4" />
					</button>
				</nav>
			{/if}
		</footer>
	</div>
</section>
