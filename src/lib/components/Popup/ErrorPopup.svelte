<script lang="ts">
	import { TriangleAlert, X } from '@lucide/svelte';
	import PopupCard from './PopupCard.svelte';

	export type ErrorProps = {
		title?: string;
		message?: string;
		buttonText?: string;
		hintText?: string;
		tone?: 'error' | 'warning';
		onClose?: () => void;
	};

	let {
		title = 'Something went wrong',
		message = 'An unexpected error occurred. Please try again.',
		buttonText = 'Close',
		hintText,
		tone = 'error',
		onClose
	}: ErrorProps = $props();

	let visible = $state(true);
	const iconColor = $derived(
		tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-error/10 text-error'
	);
	const hintColor = $derived(
		tone === 'warning' ? 'border-warning/20 bg-warning/5' : 'border-error/20 bg-error/5'
	);

	function close() {
		visible = false;
		onClose?.();
	}
</script>

{#if visible}
	<PopupCard onClose={close}>
		<div class="card-body gap-6 p-6">
			<!-- Header -->
			<div class="flex items-center gap-4">
				<div class={`flex size-14 shrink-0 items-center justify-center rounded-xl ${iconColor}`}>
					<TriangleAlert class="size-7" />
				</div>

				<div class="min-w-0">
					<h2 class="text-lg font-semibold">
						{title}
					</h2>

					<p class="mt-1 text-sm wrap-break-word text-base-content/60">
						{message}
					</p>
				</div>
			</div>

			<!-- Error hint -->
			{#if hintText}
				<div class={`rounded-xl border p-4 ${hintColor}`}>
					<div class="flex items-start gap-3">
						<TriangleAlert
							class={`mt-0.5 size-4 shrink-0 ${tone === 'warning' ? 'text-warning' : 'text-error'}`}
						/>

						<p class="text-sm text-base-content/70">
							{hintText}
						</p>
					</div>
				</div>
			{/if}

			<!-- Action -->
			<button class="btn w-full border-base-300 btn-outline" onclick={close}>
				<X class="size-4" />
				{buttonText}
			</button>
		</div>
	</PopupCard>
{/if}
