<script lang="ts">
	import { TriangleAlert, X } from '@lucide/svelte';
	import BlurPage from './BlurPage.svelte';
	import PopupCard from './PopupCard.svelte';

	export type ErrorProps = {
		title?: string;
		message?: string;
		buttonText?: string;
		hintText?: string;
		onClose?: () => void;
	};

	let {
		title = 'Something went wrong',
		message = 'An unexpected error occurred. Please try again.',
		buttonText = 'Close',
		hintText = 'If the problem persists, check your connection and try again.',
		onClose
	}: ErrorProps = $props();

	let visible = $state(true);

	function close() {
		visible = false;
		onClose?.();
	}
</script>

{#if visible}
	<BlurPage>
		<PopupCard>
			<div class="card-body gap-6 p-6">
				<!-- Header -->
				<div class="flex items-center gap-4">
					<div
						class="flex size-14 shrink-0 items-center justify-center rounded-xl bg-error/10 text-error"
					>
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
				<div class="rounded-xl border border-error/20 bg-error/5 p-4">
					<div class="flex items-start gap-3">
						<TriangleAlert class="mt-0.5 size-4 shrink-0 text-error" />

						<p class="text-sm text-base-content/70">
							{hintText}
						</p>
					</div>
				</div>

				<!-- Action -->
				<button class="btn w-full btn-error" onclick={close}>
					<X class="size-4" />
					{buttonText}
				</button>
			</div>
		</PopupCard>
	</BlurPage>
{/if}
