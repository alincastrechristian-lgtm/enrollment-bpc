<script lang="ts">
	import { Check, CircleQuestionMark, TriangleAlert, X } from '@lucide/svelte';
	import BlurPage from './BlurPage.svelte';
	import PopupCard from './PopupCard.svelte';

	export type YesNoProps = {
		title?: string;
		message?: string;
		yesText?: string;
		noText?: string;
		warning?: boolean;
		hintText?: string;
		onYes?: () => void;
		onNo?: () => void;
	};

	let {
		title = 'Confirmation',
		message = 'Are you sure you want to continue?',
		yesText = 'Confirm',
		noText = 'Cancel',
		warning = false,
		hintText = warning ? 'This action may not be reversible. Make sure you want to continue.' : '',
		onYes,
		onNo
	}: YesNoProps = $props();

	let visible = $state(true);

	function yes() {
		visible = false;
		onYes?.();
	}

	function no() {
		visible = false;
		onNo?.();
	}
</script>

{#if visible}
	<BlurPage>
		<PopupCard>
			<div class="card-body gap-6 p-6">
				<!-- Header -->
				<div class="flex items-center gap-4">
					<div
						class={`flex size-14 shrink-0 items-center justify-center rounded-xl ${
							warning ? 'bg-warning/10 text-warning' : 'bg-info/10 text-info'
						}`}
					>
						{#if warning}
							<TriangleAlert class="size-7" />
						{:else}
							<CircleQuestionMark class="size-7" />
						{/if}
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

				<!-- Warning -->
				{#if warning}
					<div class="rounded-xl border border-warning/20 bg-warning/5 p-4">
						<div class="flex items-start gap-3">
							<TriangleAlert class="mt-0.5 size-4 shrink-0 text-warning" />

							<p class="text-sm text-base-content/70">
								{hintText}
							</p>
						</div>
					</div>
				{/if}

				<!-- Actions -->
				<div class="grid grid-cols-2 gap-3">
					<button class="btn border border-base-300 btn-ghost" onclick={no}>
						<X class="size-4" />
						{noText}
					</button>

					<button class={`btn ${warning ? 'btn-warning' : 'btn-primary'}`} onclick={yes}>
						<Check class="size-4" />
						{yesText}
					</button>
				</div>
			</div>
		</PopupCard>
	</BlurPage>
{/if}
