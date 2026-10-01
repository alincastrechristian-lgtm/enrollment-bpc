<script lang="ts">
	import { Check, CircleCheck } from '@lucide/svelte';
	import BlurPage from './BlurPage.svelte';
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
		hintText = 'Your changes have been applied successfully.',
		onClose
	}: SuccessProps = $props();

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
						class="flex size-14 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success"
					>
						<CircleCheck class="size-7" />
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

				<!-- Success hint -->
				<div class="rounded-xl border border-success/20 bg-success/5 p-4">
					<div class="flex items-start gap-3">
						<Check class="mt-0.5 size-4 shrink-0 text-success" />

						<p class="text-sm text-base-content/70">
							{hintText}
						</p>
					</div>
				</div>

				<!-- Action -->
				<button class="btn w-full btn-success" onclick={close}>
					<Check class="size-4" />
					{buttonText}
				</button>
			</div>
		</PopupCard>
	</BlurPage>
{/if}
