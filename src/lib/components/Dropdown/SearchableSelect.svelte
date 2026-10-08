<script lang="ts">
	import { Check, ChevronDown, Plus, Search } from '@lucide/svelte';

	let {
		id,
		label,
		value = $bindable(''),
		options,
		placeholder,
		searchLabel,
		required = false,
		disabled = false,
		small = false,
		createLabel,
		oncreate
	}: {
		id: string;
		label: string;
		value?: string;
		options: { value: string; label: string; disabled?: boolean }[];
		placeholder: string;
		searchLabel: string;
		required?: boolean;
		disabled?: boolean;
		small?: boolean;
		createLabel: string;
		oncreate: () => void;
	} = $props();

	const panelId = $derived(`${id}-dropdown`);
	const anchorName = $derived(`--${id}-anchor`);
	let trigger: HTMLButtonElement;
	let panel: HTMLDivElement;
	let searchInput: HTMLInputElement;
	let query = $state('');
	let open = $state(false);
	let validationAttempted = $state(false);
	const selected = $derived(options.find((option) => option.value === value));
	const invalid = $derived(validationAttempted && !selected);
	const matches = $derived(
		options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()))
	);

	function close() {
		panel.hidePopover();
		trigger.focus();
	}
	function select(option: (typeof options)[number]) {
		if (disabled || option.disabled) return;
		value = option.value;
		validationAttempted = false;
		close();
	}
	function create() {
		if (disabled) return;
		close();
		oncreate();
	}
	function toggle(event: ToggleEvent) {
		open = event.newState === 'open';
		query = '';
		if (open) searchInput.focus();
	}
	function searchKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			close();
		} else if (event.key === 'Enter') {
			event.preventDefault();
			const first = matches.find((option) => !option.disabled);
			if (first) select(first);
		} else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const buttons = panel.querySelectorAll<HTMLButtonElement>('[data-choice]:not(:disabled)');
			buttons[event.key === 'ArrowDown' ? 0 : buttons.length - 1]?.focus();
		}
	}
	function choiceKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			close();
			return;
		}
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		event.preventDefault();
		const buttons = [...panel.querySelectorAll<HTMLButtonElement>('[data-choice]:not(:disabled)')];
		const index = buttons.indexOf(event.currentTarget as HTMLButtonElement);
		const next = index + (event.key === 'ArrowDown' ? 1 : -1);
		if (next < 0 || next >= buttons.length) searchInput.focus();
		else buttons[next].focus();
	}
</script>

<!-- Keep native required-field validation while the visible control opens a searchable picker. -->
<input
	type="text"
	class="sr-only"
	tabindex="-1"
	aria-hidden="true"
	value={selected?.value ?? ''}
	{required}
	{disabled}
	oninvalid={(event) => {
		event.preventDefault();
		validationAttempted = true;
		panel.showPopover();
		searchInput.focus();
	}}
/>
<button
	bind:this={trigger}
	{id}
	type="button"
	class={`select flex w-full items-center justify-between gap-2 bg-base-200 text-left text-sm ${small ? 'select-sm' : ''} ${invalid ? 'select-error' : ''}`}
	style={`anchor-name: ${anchorName}; background-image: none`}
	aria-label={label}
	aria-haspopup="dialog"
	aria-expanded={open}
	aria-controls={panelId}
	aria-describedby={invalid ? `${id}-error` : undefined}
	{disabled}
	popovertarget={panelId}
>
	<span class={`truncate ${selected ? '' : 'text-base-content/50'}`}
		>{selected?.label ?? placeholder}</span
	>
	<ChevronDown class="size-4 shrink-0 text-base-content/50" aria-hidden="true" />
</button>
{#if invalid}<p id={`${id}-error`} class="mt-1 text-xs text-error">
		{placeholder} to continue.
	</p>{/if}
<div
	bind:this={panel}
	id={panelId}
	popover="auto"
	role="dialog"
	aria-label={searchLabel}
	ontoggle={toggle}
	style={`position-anchor: ${anchorName}; width: min(max(anchor-size(width), 18rem), calc(100vw - 2rem)); position-try-fallbacks: flip-block, flip-inline; margin: 0.5rem 0`}
	class="dropdown rounded-xl border border-base-300 bg-base-100 p-2 shadow-lg"
>
	<label class="input flex w-full items-center gap-2 bg-base-200 input-sm">
		<Search class="size-4 shrink-0 text-base-content/50" aria-hidden="true" />
		<input
			bind:this={searchInput}
			type="search"
			class="min-w-0 grow"
			aria-label={searchLabel}
			placeholder="Search by name or code..."
			bind:value={query}
			onkeydown={searchKeydown}
		/>
	</label>
	<ul class="mt-2 max-h-60 space-y-1 overflow-y-auto">
		{#each matches as option (option.value)}
			<li>
				<button
					type="button"
					data-choice
					class={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 ${option.value === value ? 'bg-primary/10 text-primary' : ''}`}
					disabled={disabled || option.disabled}
					aria-pressed={option.value === value}
					onclick={() => select(option)}
					onkeydown={choiceKeydown}
				>
					<span class="min-w-0 wrap-break-word">{option.label}</span>
					{#if option.value === value}<Check class="size-4 shrink-0" aria-hidden="true" />{/if}
				</button>
			</li>
		{:else}
			<li class="px-3 py-4 text-center text-sm text-base-content/50" role="status">
				No matches found.
			</li>
		{/each}
	</ul>
	<div class="mt-2 border-t border-base-300 pt-2">
		<button
			type="button"
			data-choice
			class="btn w-full justify-start gap-2 btn-ghost text-primary btn-sm"
			{disabled}
			onclick={create}
			onkeydown={choiceKeydown}><Plus class="size-4" aria-hidden="true" />{createLabel}</button
		>
	</div>
</div>
