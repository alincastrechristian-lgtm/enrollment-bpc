<script lang="ts">
	import { LoaderCircle } from '@lucide/svelte';
	import BlurPage from './BlurPage.svelte';
	import PopupCard from './PopupCard.svelte';

	export type LoadingProps = {
		text?: string;
		message?: string;
		progress?: number | null;
		hintText?: string;
	};

	let {
		text = 'Loading...',
		message = 'Please wait while the operation completes.',
		progress = null,
		hintText = 'This may take a moment.'
	}: LoadingProps = $props();

	let hasProgress = $derived(progress !== null && progress !== undefined);
	let normalizedProgress = $derived(Math.min(100, Math.max(0, progress ?? 0)));
</script>

<BlurPage>
	<PopupCard>
		<div class="card-body gap-6 p-6">
			<!-- Header -->
			<div class="flex items-center gap-4">
				<div class="relative flex size-14 shrink-0 items-center justify-center">
					<div class="absolute inset-0 rounded-xl bg-primary/10"></div>

					<LoaderCircle class="size-7 animate-spin text-primary" />
				</div>

				<div class="min-w-0">
					<h2 class="text-lg font-semibold">
						{text}
					</h2>

					<p class="mt-1 text-sm text-base-content/60">
						{message}
					</p>
				</div>
			</div>

			<!-- Progress -->
			{#if hasProgress}
				<div class="space-y-2">
					<div class="flex items-center justify-between text-sm">
						<span class="text-base-content/60">Progress</span>

						<span class="font-mono font-medium text-primary">
							{Math.round(normalizedProgress)}%
						</span>
					</div>

					<progress class="progress w-full progress-primary" value={normalizedProgress} max="100"
					></progress>
				</div>
			{:else}
				<progress class="progress w-full progress-primary"></progress>
			{/if}

			<!-- Footer hint -->
			<div class="flex items-center gap-2 text-xs text-base-content/50">
				<span class="loading loading-xs loading-dots"></span>

				<span> {hintText} </span>
			</div>
		</div>
	</PopupCard>
</BlurPage>
