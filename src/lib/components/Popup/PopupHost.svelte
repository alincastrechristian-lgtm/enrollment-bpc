<script lang="ts">
	import { hidePopup, popup, PopupType } from './Popup.svelte';

	import ErrorPage from './ErrorPopup.svelte';
	import LoadingPage from './LoadingPopup.svelte';
	import SuccessPage from './SuccessPopup.svelte';
	import YesNoPage from './YesNoPopup.svelte';

	let dialog: HTMLDialogElement;

	$effect(() => {
		if (popup.type === PopupType.NONE) {
			dialog.close();
		} else if (!dialog.open) {
			dialog.showModal();
		}
	});

	function handleCancel(event: Event) {
		event.preventDefault();

		if (popup.type === PopupType.SUCCESS) {
			popup.successProps?.onClose?.();
			hidePopup();
		} else if (popup.type === PopupType.ERROR) {
			popup.errorProps?.onClose?.();
			hidePopup();
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="fixed inset-0 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 text-base-content outline-none backdrop:bg-transparent"
	aria-label={popup.type === PopupType.LOADING
		? (popup.loadingProps?.text ?? 'Loading')
		: popup.type === PopupType.SUCCESS
			? (popup.successProps?.title ?? 'Success')
			: popup.type === PopupType.ERROR
				? (popup.errorProps?.title ?? 'Something went wrong')
				: (popup.yesNoProps?.title ?? 'Confirmation')}
	oncancel={handleCancel}
>
	{#key popup.type}
		{#if popup.type === PopupType.LOADING}
			<LoadingPage {...popup.loadingProps} />
		{/if}
		{#if popup.type === PopupType.SUCCESS}
			<SuccessPage
				{...popup.successProps}
				onClose={() => {
					popup.successProps?.onClose?.();
					hidePopup();
				}}
			/>
		{/if}

		{#if popup.type === PopupType.ERROR}
			<ErrorPage
				{...popup.errorProps}
				onClose={() => {
					popup.errorProps?.onClose?.();
					hidePopup();
				}}
			/>
		{/if}

		{#if popup.type === PopupType.YESNO}
			<YesNoPage
				{...popup.yesNoProps}
				onYes={() => {
					popup.yesNoProps?.onYes?.();
					popup.resolve?.(true);
					hidePopup();
				}}
				onNo={() => {
					popup.yesNoProps?.onNo?.();
					popup.resolve?.(false);
					hidePopup();
				}}
			/>
		{/if}
	{/key}
</dialog>
