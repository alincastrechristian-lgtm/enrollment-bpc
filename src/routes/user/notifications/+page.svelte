<script lang="ts">
	import { Bell, Check, CheckCheck, ChevronRight, Inbox, Mail, Search, X } from '@lucide/svelte';
	const samples = [
		{
			id: 'grades',
			title: 'Your grades are ready to view',
			message:
				'Final grades have been released for your enrollment. Open your academic record to review your results and any next steps.',
			category: 'Academic update',
			date: 'Today',
			unread: true
		},
		{
			id: 'meeting',
			title: 'A conversation about your next step',
			message:
				'The Registrar’s Office would like to discuss your academic progress. Contact the office to arrange a meeting and review your enrollment options.',
			category: 'Follow-up',
			date: 'Today',
			unread: true
		},
		{
			id: 'enrollment',
			title: 'Your enrollment is confirmed',
			message:
				'Your program, section, and subject list are ready to review. You can find the details in your enrollment record.',
			category: 'Enrollment',
			date: 'Yesterday',
			unread: false
		},
		{
			id: 'account',
			title: 'Welcome to your BPC portal',
			message:
				'Your account is ready. Explore your dashboard, enrollment history, and assigned curriculum. If you need assistance, the Registrar’s Office is here to help.',
			category: 'Account',
			date: 'Earlier',
			unread: false
		}
	];
	let notifications = $state(samples.map((item) => ({ ...item })));
	let query = $state('');
	let filter = $state<'all' | 'unread'>('all');
	let selected = $state<string | null>(null);
	const unread = $derived(notifications.filter((item) => item.unread).length);
	const visible = $derived(
		notifications.filter(
			(item) =>
				(filter === 'all' || item.unread) &&
				`${item.title} ${item.message} ${item.category}`
					.toLowerCase()
					.includes(query.trim().toLowerCase())
		)
	);
	const current = $derived(notifications.find((item) => item.id === selected));
	function open(id: string) {
		selected = id;
		const item = notifications.find((item) => item.id === id);
		if (item) item.unread = false;
	}
</script>

<svelte:head><title>Notifications | BPC Enrollment Portal</title></svelte:head>
<section class="w-full space-y-5" aria-label="Notifications">
	<div class="portal-panel flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:p-5">
		<span
			class="shrink-0 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary"
		>
			Sample inbox
		</span>
		<p class="min-w-0 flex-1 basis-64 text-xs leading-relaxed text-base-content/60">
			These are sample messages. Real academic and enrollment notices are available on your
			dashboard and sent by email. Read status here is temporary.
		</p>
	</div>
	<div class="portal-panel overflow-hidden">
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
					onclick={() => (filter = 'all')}
					class="rounded-lg px-4 py-2 text-xs font-semibold {filter === 'all'
						? 'bg-base-100 text-primary shadow-sm'
						: 'text-base-content/55'}"
				>
					All updates <span class="ml-1 tabular-nums">{notifications.length}</span>
				</button>
				<button
					type="button"
					aria-pressed={filter === 'unread'}
					onclick={() => (filter = 'unread')}
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
				disabled={!unread}
				onclick={() => {
					for (const item of notifications) item.unread = false;
				}}
			>
				<CheckCheck class="size-4" aria-hidden="true" />Mark all as read
			</button>
		</div>
		<div class="border-b border-base-300 p-4 sm:p-5">
			<label class="input flex w-full items-center gap-3">
				<Search class="size-4 shrink-0 text-base-content/45" aria-hidden="true" />
				<input
					type="search"
					aria-label="Search notifications"
					placeholder="Search updates…"
					bind:value={query}
					class="min-w-0 grow text-sm"
				/>
			</label>
		</div>
		<div class="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
			<div class="min-w-0 lg:border-r lg:border-base-300">
				{#each visible as item (item.id)}
					<button
						type="button"
						onclick={() => open(item.id)}
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
							<span class="mt-2 line-clamp-2 block text-xs leading-relaxed text-base-content/55">
								{item.message}
							</span>
						</span>
						<ChevronRight class="mt-6 size-4 shrink-0 text-base-content/30" aria-hidden="true" />
					</button>
				{:else}
					<div class="px-6 py-16 text-center" role="status">
						<Inbox class="mx-auto size-8 text-primary/50" aria-hidden="true" />
						<h3 class="mt-4 text-sm font-semibold">You’re all caught up</h3>
						<p class="mt-2 text-xs text-base-content/55">
							No messages match this view. Try All updates or clear your search.
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
					<p class="mt-2 text-xs text-base-content/45">{current.date} · Sample notification</p>
					<p class="mt-6 text-sm leading-relaxed text-base-content/70">{current.message}</p>
					<p
						class="mt-8 flex items-center gap-2 border-t border-base-300 pt-4 text-xs text-base-content/50"
					>
						<Check class="size-4 text-primary" aria-hidden="true" />Marked as read in this preview
					</p>
				{:else}
					<div class="flex min-h-64 flex-col items-center justify-center text-center">
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
	</div>
</section>
