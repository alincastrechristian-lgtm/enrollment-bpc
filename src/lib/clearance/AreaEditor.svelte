<script lang="ts">
	import type { Box } from './definition';
	let {
		src,
		box = $bindable(),
		disabled = false,
		areas = [],
		selectedId = 'selected',
		onselect,
		onchange
	}: {
		src: string;
		box: Box;
		disabled?: boolean;
		areas?: { id: string; label: string; box: Box; color: string }[];
		selectedId?: string;
		onselect?: (id: string) => void;
		onchange?: (id: string, box: Box) => void;
	} = $props();
	let viewport: HTMLDivElement;
	let gesture = $state<{
		pointer: number;
		start: { x: number; y: number };
		previous: Box;
		current: Box;
		areaId: string;
		mode: 'draw' | 'resize' | 'move';
		target: HTMLElement;
	} | null>(null);
	const names = ['top left', 'top right', 'bottom right', 'bottom left'];
	function corners(b: Box) {
		return [
			{ x: b.x, y: b.y },
			{ x: b.x + b.width, y: b.y },
			{ x: b.x + b.width, y: b.y + b.height },
			{ x: b.x, y: b.y + b.height }
		];
	}
	const points = $derived(corners(box));
	const displayed = $derived(
		areas.length ? areas : [{ id: selectedId, label: 'Selected area', box, color: '#15803d' }]
	);
	const selectedColor = $derived(
		displayed.find((area) => area.id === selectedId)?.color ?? '#15803d'
	);
	function update(value: Box, id: string) {
		if (onchange) onchange(id, value);
		else box = value;
	}
	const clamp = (v: number) => Math.max(0, Math.min(1, v));
	function position(event: PointerEvent) {
		const bounds = viewport.getBoundingClientRect();
		return {
			x: clamp((event.clientX - bounds.left) / bounds.width),
			y: clamp((event.clientY - bounds.top) / bounds.height)
		};
	}
	function rectangle(a: { x: number; y: number }, b: { x: number; y: number }) {
		return {
			x: Math.min(a.x, b.x),
			y: Math.min(a.y, b.y),
			width: Math.abs(a.x - b.x),
			height: Math.abs(a.y - b.y)
		};
	}
	function begin(
		event: PointerEvent,
		mode: 'draw' | 'resize' | 'move' = 'draw',
		index = 0,
		areaId = selectedId
	) {
		if (disabled || gesture || !event.isPrimary || event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const target = event.currentTarget as HTMLElement;
		const previous = { ...(displayed.find((area) => area.id === areaId)?.box ?? box) };
		const start = mode === 'resize' ? corners(previous)[(index + 2) % 4] : position(event);
		gesture = {
			pointer: event.pointerId,
			start,
			previous,
			current: previous,
			areaId,
			mode,
			target
		};
		onselect?.(areaId);
		target.setPointerCapture(event.pointerId);
	}
	function translate(previous: Box, dx: number, dy: number) {
		return {
			...previous,
			x: Math.max(0, Math.min(1 - previous.width, previous.x + dx)),
			y: Math.max(0, Math.min(1 - previous.height, previous.y + dy))
		};
	}
	function resize(event: PointerEvent, index: number) {
		const point = position(event);
		// Large corner hit targets can cover an entire small checkbox. Keep its center draggable.
		const center =
			areas.length &&
			point.x > box.x + box.width * 0.25 &&
			point.x < box.x + box.width * 0.75 &&
			point.y > box.y + box.height * 0.25 &&
			point.y < box.y + box.height * 0.75;
		begin(event, center ? 'move' : 'resize', index);
	}
	function move(event: PointerEvent) {
		if (!gesture || gesture.pointer !== event.pointerId) return;
		const current = position(event);
		gesture.current =
			gesture.mode === 'move'
				? translate(gesture.previous, current.x - gesture.start.x, current.y - gesture.start.y)
				: rectangle(gesture.start, current);
		update(gesture.current, gesture.areaId);
	}
	function finish(event?: PointerEvent, cancel = false) {
		if (!gesture || (event && gesture.pointer !== event.pointerId)) return;
		const previous = gesture;
		if (
			(cancel || previous.current.width < 0.015 || previous.current.height < 0.015) &&
			previous.current !== previous.previous
		)
			update(previous.previous, previous.areaId);
		gesture = null;
		if (previous.target.hasPointerCapture(previous.pointer))
			previous.target.releasePointerCapture(previous.pointer);
	}
	function nudge(event: KeyboardEvent, index?: number, areaId = selectedId) {
		const directions: Record<string, [number, number]> = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, -1],
			ArrowDown: [0, 1]
		};
		const direction = directions[event.key];
		if (!direction || disabled || gesture) return;
		event.preventDefault();
		const previous = displayed.find((area) => area.id === areaId)?.box ?? box;
		onselect?.(areaId);
		const step = event.shiftKey ? 0.01 : 0.002;
		if (index === undefined) {
			update(translate(previous, direction[0] * step, direction[1] * step), areaId);
			return;
		}
		const currentPoints = corners(previous);
		const moved = {
			x: clamp(currentPoints[index].x + direction[0] * step),
			y: clamp(currentPoints[index].y + direction[1] * step)
		};
		const next = rectangle(moved, currentPoints[(index + 2) % 4]);
		if (next.width >= 0.015 && next.height >= 0.015) update(next, areaId);
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') finish(undefined, true);
	}}
	onpointerup={(event) => finish(event)}
/>
<div class="space-y-3">
	<p class="text-xs text-base-content/65">
		Drag inside {areas.length ? 'any box' : 'the selected box'} to move it, or drag a selected corner
		to resize. Drag outside the boxes to draw a new one. Arrow keys move the focused box or corner; Shift
		makes larger steps. Escape cancels.
	</p>
	<div
		bind:this={viewport}
		role="group"
		aria-label="Marked area editor"
		class="relative touch-none border border-base-300 bg-white select-none"
		onpointerdown={(e) => begin(e)}
		onpointermove={move}
		onpointerup={(e) => finish(e)}
		onpointercancel={(e) => finish(e, true)}
		onlostpointercapture={(e) => finish(e, true)}
	>
		<img
			{src}
			alt="Aligned reference for marking printed details"
			draggable="false"
			class="pointer-events-none block w-full"
		/>
		<svg
			class="pointer-events-none absolute inset-0 h-full w-full"
			viewBox="0 0 100 100"
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			{#each displayed as area (area.id)}
				<rect
					x={area.box.x * 100}
					y={area.box.y * 100}
					width={area.box.width * 100}
					height={area.box.height * 100}
					fill={area.color}
					fill-opacity={area.id === selectedId ? 0.18 : 0.08}
					stroke={area.color}
					stroke-width={area.id === selectedId ? '.5' : '.3'}
				/>
			{/each}
		</svg>
		{#each displayed as area (area.id)}
			{#if area.box.width > 0 && area.box.height > 0}
				<button
					type="button"
					aria-label={areas.length ? `Move ${area.label}` : 'Move selected area'}
					aria-pressed={area.id === selectedId}
					{disabled}
					class="absolute cursor-grab touch-none border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing disabled:cursor-default"
					style:left={`${area.box.x * 100}%`}
					style:top={`${area.box.y * 100}%`}
					style:width={`${area.box.width * 100}%`}
					style:height={`${area.box.height * 100}%`}
					onpointerdown={(e) => begin(e, 'move', 0, area.id)}
					onkeydown={(e) => nudge(e, undefined, area.id)}
				></button>
			{/if}
		{/each}
		{#if box.width > 0 && box.height > 0}
			{#each points as p, i (i)}
				<button
					type="button"
					aria-label={`Resize area ${names[i]}`}
					{disabled}
					class="absolute z-10 grid size-10 -translate-x-1/2 -translate-y-1/2 touch-none place-items-center"
					style:left={`${p.x * 100}%`}
					style:top={`${p.y * 100}%`}
					onpointerdown={(e) => resize(e, i)}
					onkeydown={(e) => nudge(e, i)}
				>
					<span
						class="size-4 rounded-full border-2 border-white shadow"
						style:background-color={selectedColor}
					></span>
				</button>
			{/each}
		{/if}
	</div>
	<fieldset {disabled} class="grid grid-cols-2 gap-2 sm:grid-cols-4">
		<legend class="sr-only">Area coordinates</legend>
		{#each ['x', 'y', 'width', 'height'] as axis (axis)}
			<label class="text-xs">
				{axis} %
				<input
					type="number"
					min="0"
					max="100"
					step="0.1"
					class="input w-full input-sm"
					value={+(box[axis as keyof Box] * 100).toFixed(1)}
					oninput={(e) => {
						const n = Number(e.currentTarget.value);
						if (Number.isFinite(n)) update({ ...box, [axis]: clamp(n / 100) }, selectedId);
					}}
				/>
			</label>
		{/each}
	</fieldset>
</div>
