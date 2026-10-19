<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import type { TemplateInfo } from './definition';
	import { UNIT_CORNERS, validCorners, type Corners, type Point } from './clearance';

	let {
		src,
		corners = $bindable(),
		drawing = $bindable(false),
		dragging = $bindable(false),
		disabled = false,
		detection = null,
		template = null,
		detecting = $bindable(false),
		onchange
	}: {
		src: string;
		corners: Corners;
		drawing?: boolean;
		dragging?: boolean;
		disabled?: boolean;
		detection?: 'found' | 'missing' | null;
		template?: TemplateInfo | null;
		detecting?: boolean;
		onchange: () => void;
	} = $props();
	let viewport: HTMLDivElement;
	let gesture = $state<{
		pointer: number;
		index: number | null;
		start: Point;
		current: Point;
		previous: Corners;
		wasDrawing: boolean;
	} | null>(null);
	let warning = $state('');
	let alignmentDetail = $state('');
	let progress = $state('');
	let controller: AbortController | undefined;
	let attemptedSource = '';
	const locked = $derived(disabled || detecting);
	let capture: HTMLElement | null = null;
	const names = ['top left', 'top right', 'bottom right', 'bottom left'];
	const displayed = $derived(
		gesture?.index === null ? rectangle(gesture.start, gesture.current) : corners
	);
	const helpId = $props.id();
	$effect(() => {
		void src;
		untrack(() => {
			alignmentDetail = '';
			warning = '';
		});
		return () => controller?.abort();
	});
	$effect(() => {
		if (detection === 'missing' && template?.definition && !disabled && attemptedSource !== src) {
			attemptedSource = src;
			untrack(() => void detect());
		}
	});
	async function detect() {
		if (locked || gesture) return;
		const imageUrl = src,
			revision = template?.revision;
		const abort = new AbortController();
		controller = abort;
		detecting = true;
		warning = '';
		alignmentDetail = '';
		progress = 'Looking for the form border...';
		onchange();
		try {
			const p = await import('./scan.client');
			const image = await p.loadImage(imageUrl, abort.signal);
			const result = await p.detectFormOutline(
				image,
				template?.definition
					? {
							definition: template.definition,
							referenceUrl: `${resolve('/user/clearance-template')}?${new URLSearchParams({ revision: template.revision })}`
						}
					: undefined,
				(text) => {
					progress = text;
				},
				abort.signal
			);
			if (abort.signal.aborted || src !== imageUrl || template?.revision !== revision) return;
			if (result.corners) {
				corners = result.corners;
				drawing = false;
				onchange();
				alignmentDetail = result.detail;
			} else warning = result.detail + ' Your current outline was kept.';
		} catch {
			if (src === imageUrl)
				warning = abort.signal.aborted
					? 'Border detection cancelled. Your current outline was kept.'
					: 'Could not detect the outline. Check the OCR connection, retry, or draw it manually. Your current outline was kept.';
		} finally {
			if (controller === abort) {
				controller = undefined;
				detecting = false;
				progress = '';
			}
		}
	}
	function changed() {
		alignmentDetail = '';
		onchange();
	}

	const clamp = (value: number) => Math.max(0, Math.min(1, value));
	function rectangle(a: Point, b: Point): Corners {
		const left = Math.min(a.x, b.x),
			right = Math.max(a.x, b.x);
		const top = Math.min(a.y, b.y),
			bottom = Math.max(a.y, b.y);
		return [
			{ x: left, y: top },
			{ x: right, y: top },
			{ x: right, y: bottom },
			{ x: left, y: bottom }
		];
	}
	function position(event: PointerEvent): Point {
		const bounds = viewport.getBoundingClientRect();
		return {
			x: clamp((event.clientX - bounds.left) / bounds.width),
			y: clamp((event.clientY - bounds.top) / bounds.height)
		};
	}
	function begin(event: PointerEvent, index: number | null = null) {
		if (locked || dragging || !event.isPrimary || event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const point = position(event);
		gesture = {
			pointer: event.pointerId,
			index,
			start: point,
			current: point,
			previous: structuredClone($state.snapshot(corners)),
			wasDrawing: drawing
		};
		dragging = true;
		warning = '';
		if (index === null) drawing = true;
		capture = event.currentTarget as HTMLElement;
		capture.setPointerCapture(event.pointerId);
	}
	function move(event: PointerEvent) {
		if (!gesture || event.pointerId !== gesture.pointer) return;
		event.preventDefault();
		const point = position(event);
		if (gesture.index === null) {
			gesture.current = point;
			return;
		}
		const next = corners.map((corner, i) =>
			i === gesture!.index ? point : { ...corner }
		) as Corners;
		if (!validCorners(next)) {
			warning = 'Keep corners in order around the form.';
			return;
		}
		corners = next;
		warning = '';
		changed();
	}
	function release() {
		const pointer = gesture?.pointer;
		gesture = null;
		dragging = false;
		if (pointer !== undefined && capture?.hasPointerCapture(pointer))
			capture.releasePointerCapture(pointer);
		capture = null;
	}
	function finish(event: PointerEvent) {
		if (!gesture || event.pointerId !== gesture.pointer) return;
		if (gesture.index === null) {
			const next = rectangle(gesture.start, position(event));
			if (validCorners(next)) {
				corners = next;
				drawing = false;
				warning = '';
				changed();
			} else {
				drawing = gesture.wasDrawing;
				warning = 'Draw a larger box around the full clearance form.';
			}
		}
		release();
	}
	function cancel(event?: PointerEvent) {
		if (!gesture || (event && event.pointerId !== gesture.pointer)) return;
		corners = gesture.previous;
		drawing = gesture.wasDrawing;
		warning = '';
		changed();
		release();
	}
	function nudge(event: KeyboardEvent, index: number) {
		const directions: Record<string, Point> = {
			ArrowLeft: { x: -1, y: 0 },
			ArrowRight: { x: 1, y: 0 },
			ArrowUp: { x: 0, y: -1 },
			ArrowDown: { x: 0, y: 1 }
		};
		const direction = directions[event.key];
		if (!direction || locked || gesture) return;
		event.preventDefault();
		const step = event.shiftKey ? 0.01 : 0.002;
		const next = corners.map((point, i) =>
			i === index
				? { x: clamp(point.x + direction.x * step), y: clamp(point.y + direction.y * step) }
				: { ...point }
		) as Corners;
		if (!validCorners(next)) return;
		corners = next;
		warning = '';
		changed();
	}
	function numeric(index: number, axis: 'x' | 'y', value: string) {
		const number = Number(value);
		if (!Number.isFinite(number)) return;
		corners = corners.map((point, i) =>
			i === index ? { ...point, [axis]: clamp(number / 100) } : { ...point }
		) as Corners;
		drawing = false;
		warning = '';
		changed();
	}
	onDestroy(() => {
		controller?.abort();
		release();
	});
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape' && gesture) {
			event.preventDefault();
			cancel();
		}
	}}
/>

<div class="space-y-4">
	<div id={helpId} class="rounded-lg bg-base-200 p-3 text-sm">
		{#if drawing}
			<p class="font-semibold">
				{detection === 'missing' ? 'No clear border found. ' : ''}Drag across the image to draw a
				box around the form.
			</p>
		{:else if detection === 'found'}
			<p role="status">
				Form border found automatically. Drag corner handles to adjust the outline.
			</p>
		{:else}
			<p>Drag a corner handle to adjust the outline, or drag across the image to draw a new box.</p>
		{/if}
		<p class="mt-1 text-xs">
			Mouse or touch supported. Focus a corner and use arrow keys; hold Shift for larger steps.
			Escape cancels a drag.
		</p>
	</div>
	<div
		bind:this={viewport}
		role="group"
		aria-label="Form border editor"
		aria-describedby={helpId}
		class="relative my-2 w-fit max-w-full touch-none rounded-lg border border-base-300 bg-white select-none"
		class:cursor-crosshair={!locked}
		onpointerdown={(event) => begin(event)}
		onpointermove={move}
		onpointerup={finish}
		onpointercancel={cancel}
		onlostpointercapture={cancel}
	>
		<img
			{src}
			alt="Uploaded clearance with adjustable alignment corners"
			draggable="false"
			class="pointer-events-none block h-auto max-h-[65vh] w-auto max-w-full rounded-lg select-none"
		/>
		<svg
			class="pointer-events-none absolute inset-0 h-full w-full"
			viewBox="0 0 100 100"
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			<polygon
				points={displayed.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
				fill="#2563eb20"
				stroke={validCorners(displayed) ? '#2563eb' : '#dc2626'}
				stroke-width="0.4"
			/>
		</svg>
		{#if !drawing}
			{#each corners as point, i (i)}
				<button
					type="button"
					aria-label={`Move ${names[i]} corner`}
					aria-describedby={helpId}
					disabled={locked}
					class="absolute grid size-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-full active:cursor-grabbing disabled:cursor-default"
					style:left={`${point.x * 100}%`}
					style:top={`${point.y * 100}%`}
					onpointerdown={(event) => begin(event, i)}
					onkeydown={(event) => nudge(event, i)}
				>
					<span
						class="grid size-6 place-items-center rounded-full border-2 border-white bg-primary text-xs font-bold text-primary-content shadow"
					>
						{i + 1}
					</span>
				</button>
			{/each}
		{/if}
	</div>
	{#if detecting}
		<p role="status" class="text-sm">{progress}</p>
	{:else if alignmentDetail}
		<p role="status" class="text-sm">{alignmentDetail}</p>
	{/if}
	{#if warning}
		<p role="alert" class="text-sm text-error">{warning}</p>
	{/if}
	<div class="flex flex-wrap gap-2">
		<button
			type="button"
			class="btn btn-outline btn-sm"
			disabled={locked || !!gesture}
			onclick={detect}
		>
			{#if detecting}
				<span class="loading loading-xs loading-spinner" aria-hidden="true"></span>
			{/if}
			Detect borders
		</button>
		{#if detecting}
			<button type="button" class="btn btn-ghost btn-sm" onclick={() => controller?.abort()}>
				Cancel border detection
			</button>
		{/if}
		<button
			type="button"
			class="btn btn-ghost btn-sm"
			disabled={locked || !!gesture}
			onclick={() => {
				drawing = true;
				warning = '';
				changed();
			}}
		>
			Draw new box
		</button>
		<button
			type="button"
			class="btn btn-ghost btn-sm"
			disabled={locked || !!gesture}
			onclick={() => {
				corners = structuredClone(UNIT_CORNERS);
				drawing = false;
				warning = '';
				changed();
			}}
		>
			Use full image border
		</button>
	</div>
	<details id="corner-controls" class="rounded-lg border border-base-300 p-3">
		<summary class="cursor-pointer text-sm">Numeric corner controls</summary>
		<div class="mt-3 grid grid-cols-2 gap-3">
			{#each corners as point, i (i)}
				<fieldset class="space-y-1" disabled={locked || !!gesture}>
					<legend class="text-xs font-semibold">{i + 1}. {names[i]}</legend>
					<div class="flex gap-2">
						{#each ['x', 'y'] as axis (axis)}
							<label class="text-xs">
								{axis.toUpperCase()} %
								<input
									type="number"
									min="0"
									max="100"
									step="0.1"
									class="input w-full input-sm"
									value={+(point[axis as 'x' | 'y'] * 100).toFixed(1)}
									oninput={(event) => numeric(i, axis as 'x' | 'y', event.currentTarget.value)}
								/>
							</label>
						{/each}
					</div>
				</fieldset>
			{/each}
		</div>
	</details>
</div>
