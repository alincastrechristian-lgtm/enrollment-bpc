<script lang="ts">
	import { Check, CircleCheck } from '@lucide/svelte';
	import PopupCard from './PopupCard.svelte';

	export type SuccessProps = {
		title?: string;
		message?: string;
		buttonText?: string;
		hintText?: string;
		onClose?: () => void;
	};

	let {
		title = 'Success!',
		message = 'The operation completed successfully.',
		buttonText = 'Done',
		hintText,
		onClose
	}: SuccessProps = $props();

	let visible = $state(true);

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
				<div class="portal-dialog-icon bg-success/10 text-success">
					<CircleCheck class="size-6" />
				</div>

				<div class="min-w-0">
					<h2 class="portal-dialog-title">
						{title}
					</h2>
				</div>
			</div>

			<!-- Success hint -->
			<div class="portal-dialog-body">
				<p class="text-sm leading-relaxed wrap-break-word text-base-content/70">{message}</p>
				{#if hintText}
					<div class="rounded-xl border border-success/20 bg-success/5 p-4">
						<div class="flex items-start gap-3">
							<Check class="mt-0.5 size-4 shrink-0 text-success" />

							<p class="text-sm text-base-content/70">
								{hintText}
							</p>
						</div>
					</div>
				{/if}
			</div>

			<!-- Action -->
			<div class="portal-dialog-footer">
				<button class="btn btn-primary" onclick={close}>
					<Check class="size-4" />
					{buttonText}
				</button>
			</div>
		</div>
	</PopupCard>
{/if}
