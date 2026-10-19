<script lang="ts">
	import { Check, CircleQuestionMark, TriangleAlert, X } from '@lucide/svelte';
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
	<PopupCard>
		<div class="portal-dialog-form">
			<!-- Header -->
			<div class="portal-dialog-header items-center">
				<div
					class={`portal-dialog-icon ${
						warning ? 'bg-warning/10 text-warning' : 'bg-info/10 text-info'
					}`}
				>
					{#if warning}
						<TriangleAlert class="size-6" />
					{:else}
						<CircleQuestionMark class="size-6" />
					{/if}
				</div>

				<div class="min-w-0">
					<h2 class="portal-dialog-title">
						{title}
					</h2>
				</div>
			</div>

			<!-- Warning -->
			<div class="portal-dialog-body">
				<p class="text-sm leading-relaxed wrap-break-word text-base-content/70">{message}</p>
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
			</div>

			<!-- Actions -->
			<div class="portal-dialog-footer">
				<button class="btn border-base-300 btn-outline" onclick={no}>
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
{/if}
