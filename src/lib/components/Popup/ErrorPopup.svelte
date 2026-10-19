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
		<div class="portal-dialog-form">
			<!-- Header -->
			<div class="portal-dialog-header items-center">
				<div class={`portal-dialog-icon ${iconColor}`}>
					<TriangleAlert class="size-6" />
				</div>

				<div class="min-w-0">
					<h2 class="portal-dialog-title">
						{title}
					</h2>
				</div>
			</div>

			<!-- Error hint -->
			<div class="portal-dialog-body">
				<p class="text-sm leading-relaxed wrap-break-word text-base-content/70">{message}</p>
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
			</div>

			<!-- Action -->
			<div class="portal-dialog-footer">
				<button class="btn border-base-300 btn-outline" onclick={close}>
					<X class="size-4" />
					{buttonText}
				</button>
			</div>
		</div>
	</PopupCard>
{/if}
