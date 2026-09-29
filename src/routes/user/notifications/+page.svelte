<script lang="ts">
	import { Archive, Bell, Mail, Plus, Search, Send, Trash2 } from '@lucide/svelte';

	let showCompose = $state(false);

	const notifications = [
		{
			id: 1,
			recipient: 'john@email.com',
			subject: 'BPC Enrollment Requirements - Incomplete',
			preview:
				"Your application is currently incomplete. Please submit the missing Form 138 / Report Card to the Registrar's Office.",
			date: 'Today, 9:42 AM'
		},
		{
			id: 2,
			recipient: 'maria@email.com',
			subject: 'Application Received',
			preview: 'Your application has been successfully received and is currently being reviewed.',
			date: 'Yesterday, 3:18 PM'
		},
		{
			id: 3,
			recipient: 'juan@email.com',
			subject: 'Application Approved',
			preview:
				'Congratulations! Your application has been approved. Please proceed to the next step.',
			date: 'Sep 26, 2026'
		},
		{
			id: 4,
			recipient: 'ana@email.com',
			subject: 'Missing Document',
			preview: 'Please submit your Good Moral Certificate to complete your application.',
			date: 'Sep 25, 2026'
		}
	];
</script>

<svelte:head>
	<title>Notifications</title>
</svelte:head>

<section class="mx-auto max-w-7xl">
	<div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
		<!-- Header -->
		<div
			class="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
		>
			<div class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"
				>
					<Bell size={19} strokeWidth={2} />
				</div>

				<div>
					<h2 class="font-bold text-slate-800">Notifications</h2>
					<p class="text-xs text-slate-400">
						{notifications.length} sent notifications
					</p>
				</div>
			</div>

			<button
				type="button"
				class="btn gap-2 border-0 bg-emerald-700 px-5 text-white shadow-sm hover:bg-emerald-800"
				onclick={() => (showCompose = true)}
			>
				<Plus size={17} />
				Compose
			</button>
		</div>

		<!-- Toolbar -->
		<div
			class="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6"
		>
			<label class="input-bordered input flex w-full items-center gap-3 bg-white sm:max-w-md">
				<Search size={16} class="text-slate-400" />

				<input type="text" placeholder="Search sent notifications..." class="grow text-sm" />
			</label>
		</div>

		<!-- Notification list -->
		<div>
			{#each notifications as notification (notification.id)}
				<div
					class="group flex items-start gap-4 border-b border-slate-100 px-5 py-4 transition-colors last:border-0 hover:bg-slate-50 sm:px-6"
				>
					<!-- Mail icon -->
					<div
						class="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 sm:flex"
					>
						<Send size={16} />
					</div>

					<!-- Notification content -->
					<button
						type="button"
						class="min-w-0 flex-1 text-left"
						onclick={() => console.log('Open notification:', notification.id)}
					>
						<div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
							<p class="truncate text-sm font-semibold text-slate-700">
								{notification.recipient}
							</p>

							<span class="shrink-0 text-xs font-medium text-slate-400">
								{notification.date}
							</span>
						</div>

						<p class="mt-0.5 truncate text-sm font-medium text-slate-700">
							{notification.subject}
						</p>

						<p class="mt-1 line-clamp-1 text-xs text-slate-400">
							{notification.preview}
						</p>
					</button>

					<!-- Actions -->
					<div
						class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
					>
						<button
							type="button"
							class="btn btn-circle btn-ghost text-slate-400 btn-xs hover:bg-slate-200 hover:text-slate-700"
							aria-label="Archive"
							title="Archive"
						>
							<Archive size={14} />
						</button>

						<button
							type="button"
							class="btn btn-circle btn-ghost text-slate-400 btn-xs hover:bg-red-50 hover:text-red-600"
							aria-label="Delete"
							title="Delete"
						>
							<Trash2 size={14} />
						</button>
					</div>
				</div>
			{/each}
		</div>

		<!-- Footer -->
		<div
			class="flex items-center justify-between border-t border-slate-200 bg-slate-50/50 px-5 py-3 sm:px-6"
		>
			<p class="text-xs font-medium text-slate-400">
				{notifications.length} notifications
			</p>

			<div class="join">
				<button class="btn join-item btn-sm" disabled>«</button>
				<button class="btn join-item bg-emerald-700 text-white btn-sm hover:bg-emerald-800">
					1
				</button>
				<button class="btn join-item btn-sm">2</button>
				<button class="btn join-item btn-sm">»</button>
			</div>
		</div>
	</div>
</section>

<!-- Compose Modal -->
{#if showCompose}
	<dialog class="modal modal-open">
		<div class="modal-box max-w-2xl overflow-hidden p-0">
			<!-- Modal header -->
			<div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
				<div class="flex items-center gap-3">
					<div
						class="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"
					>
						<Mail size={17} />
					</div>

					<div>
						<h3 class="font-bold text-slate-800">New Notification</h3>
						<p class="text-xs text-slate-400">Compose an email to an applicant.</p>
					</div>
				</div>

				<button
					type="button"
					class="btn btn-circle btn-ghost text-slate-400 btn-sm"
					onclick={() => (showCompose = false)}
					aria-label="Close"
				>
					×
				</button>
			</div>

			<!-- Form -->
			<form
				class="p-5 sm:p-6"
				onsubmit={(event) => {
					event.preventDefault();
					showCompose = false;
				}}
			>
				<div class="space-y-5">
					<div>
						<label for="recipient" class="mb-2 block text-sm font-bold text-slate-700">
							Recipient
						</label>

						<input
							id="recipient"
							name="recipient"
							type="email"
							placeholder="applicant@email.com"
							required
							class="input-bordered input w-full border-slate-200 bg-slate-50/50 text-sm focus:border-emerald-600 focus:outline-none"
						/>
					</div>

					<div>
						<label for="subject" class="mb-2 block text-sm font-bold text-slate-700">
							Subject
						</label>

						<input
							id="subject"
							name="subject"
							type="text"
							placeholder="Enter email subject"
							required
							class="input-bordered input w-full border-slate-200 bg-slate-50/50 text-sm focus:border-emerald-600 focus:outline-none"
						/>
					</div>

					<div>
						<label for="message" class="mb-2 block text-sm font-bold text-slate-700">
							Message
						</label>

						<textarea
							id="message"
							name="message"
							rows="7"
							placeholder="Write your message..."
							required
							class="textarea-bordered textarea w-full resize-y border-slate-200 bg-slate-50/50 text-sm leading-relaxed focus:border-emerald-600 focus:outline-none"
						></textarea>
					</div>
				</div>

				<div class="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-5">
					<button
						type="button"
						class="btn btn-ghost text-slate-500"
						onclick={() => (showCompose = false)}
					>
						Cancel
					</button>

					<button
						type="submit"
						class="btn gap-2 border-0 bg-emerald-700 px-5 text-white hover:bg-emerald-800"
					>
						<Send size={16} />
						Send Email
					</button>
				</div>
			</form>
		</div>

		<form method="dialog" class="modal-backdrop">
			<button onclick={() => (showCompose = false)}>close</button>
		</form>
	</dialog>
{/if}
