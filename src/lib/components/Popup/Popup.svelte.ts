import type { ErrorProps } from './ErrorPage.svelte';
import type { LoadingProps } from './LoadingPage.svelte';
import type { SuccessProps } from './SuccessPage.svelte';
import type { YesNoProps } from './YesNoPage.svelte';

export enum PopupType {
	NONE,
	LOADING,
	SUCCESS,
	ERROR,
	YESNO
}

export type PopupState = {
	type: PopupType;
	loadingProps?: LoadingProps;
	successProps?: SuccessProps;
	errorProps?: ErrorProps;
	yesNoProps?: YesNoProps;
	resolve?: (value: boolean) => void;
};

export const popup = $state<PopupState>({
	type: PopupType.NONE
});

export function hidePopup() {
	popup.type = PopupType.NONE;
	popup.loadingProps = undefined;
	popup.successProps = undefined;
	popup.errorProps = undefined;
	popup.yesNoProps = undefined;
	popup.resolve = undefined;
}

export function showLoading(props: LoadingProps): void;
export function showLoading(message?: string, progress?: number | null): void;

export function showLoading(
	propsOrMessage: LoadingProps | string = 'Loading...',
	progress: number | null = null
): void {
	popup.type = PopupType.LOADING;

	if (typeof propsOrMessage === 'string') {
		popup.loadingProps = {
			message: propsOrMessage,
			progress
		};
	} else {
		popup.loadingProps = propsOrMessage;
	}
}

export function updateLoadingProgress(progress: number) {
	if (popup.type !== PopupType.LOADING) return;

	popup.loadingProps = { ...popup.loadingProps, progress };
}

export function showSuccess(props: SuccessProps): void;
export function showSuccess(message: string, onClose?: () => void): void;

export function showSuccess(propsOrMessage: SuccessProps | string, onClose?: () => void): void {
	popup.type = PopupType.SUCCESS;

	popup.successProps =
		typeof propsOrMessage === 'string'
			? {
					message: propsOrMessage,
					onClose
				}
			: propsOrMessage;
}

export function showError(props: ErrorProps): void;
export function showError(message: string, onClose?: () => void): void;

export function showError(propsOrMessage: ErrorProps | string, onClose?: () => void): void {
	popup.type = PopupType.ERROR;

	popup.errorProps =
		typeof propsOrMessage === 'string'
			? {
					message: propsOrMessage,
					onClose
				}
			: propsOrMessage;
}

export function showYesNo(props: YesNoProps): Promise<boolean>;
export function showYesNo(message: string): Promise<boolean>;

export function showYesNo(propsOrMessage: YesNoProps | string): Promise<boolean> {
	popup.type = PopupType.YESNO;

	popup.yesNoProps =
		typeof propsOrMessage === 'string'
			? {
					message: propsOrMessage
				}
			: propsOrMessage;

	return new Promise((resolve) => {
		popup.resolve = resolve;
	});
}
