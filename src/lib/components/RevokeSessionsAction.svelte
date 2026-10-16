<script lang="ts">
	import { LogOut } from '@lucide/svelte';
	import { revokeAccountSessions } from '#lib/actions/user.remote.js';
	import { getErrorMessage } from '#lib/errors.js';
	import { showError, showLoading, showSuccess, showYesNo } from './Popup/Popup.svelte';

	let {
		userId,
		name,
		disabled = false
	}: { userId: string; name: string; disabled?: boolean } = $props();
	let busy = $state(false);
	async function revoke() {
		if (disabled || busy) return;
		busy = true;
		try {
			if (
				!(await showYesNo({
					title: 'Revoke all sessions?',
					message: `Sign ${name} out on every device? All active sessions will end.`,
					hintText: 'Their password and account access will stay unchanged.',
					yesText: 'Revoke sessions',
					noText: 'Cancel',
					warning: true
				}))
			)
				return;
			showLoading('Revoking sessions...');
			await revokeAccountSessions({ userId });
			showSuccess('All active sessions for this account have been revoked.');
		} catch (cause) {
			showError(getErrorMessage(cause, 'Failed to revoke sessions. Please try again.'));
		} finally {
			busy = false;
		}
	}
</script>

<button type="button" disabled={disabled || busy} onclick={revoke}>
	<LogOut class="size-4" aria-hidden="true" />Revoke sessions
</button>
