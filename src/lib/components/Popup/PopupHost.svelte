<script lang="ts">
	import { hidePopup, popup, PopupType } from './Popup.svelte';

	import ErrorPage from './ErrorPage.svelte';
	import LoadingPage from './LoadingPage.svelte';
	import SuccessPage from './SuccessPage.svelte';
	import YesNoPage from './YesNoPage.svelte';
</script>

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
