/**
 * Resizable — two panes with a draggable divider.
 *
 * `react-resizable-panels`, which shadcn wraps, supports arbitrarily nested
 * groups with persisted layouts and collapse-to-zero. nebula ships the case
 * that covers almost every use of it: two panes, one handle. Nesting two of
 * these gets a three-pane layout, which is where the demand stops.
 *
 * The split is one number — the first pane's percentage — driving both panes
 * through `flex-basis`. One source of truth means the two can never disagree,
 * which is the failure mode of tracking a size per pane.
 *
 * Pointer capture on the handle is what keeps the drag alive when the pointer
 * outruns it, which it will: the handle is a few pixels wide and the pointer
 * moves faster than layout. Without capture the drag drops the moment the
 * cursor leaves.
 *
 * The handle is also a real `separator` with `aria-valuenow`, and arrow keys
 * move it. A resizable layout reachable only by dragging is unusable by
 * keyboard, and this is the whole of what it takes to fix that.
 */

import {
	component,
	createContext,
	html,
	inject,
	provide,
	signal,
} from "@c9up/aurora";
import type { Parts, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { GripVerticalIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";

const KEYBOARD_STEP = 5;

interface ResizableApi {
	readonly rootId: string;
	readonly horizontal: boolean;
	readonly min: number;
	readonly max: number;
	readonly size: () => number;
	setSize(percent: number): void;
	/** Claim a position: the FIRST panel is the one the size applies to. */
	claimPanel(): number;
}

const ResizableContext = createContext<ResizableApi>("ResizablePanelGroup");

export interface ResizablePanelGroupProps {
	direction?: "horizontal" | "vertical";
	/** First pane's share at first render, in percent. Default `50`. */
	defaultSize?: number;
	minSize?: number;
	maxSize?: number;
	onResize?: (percent: number) => void;
	class?: Reactive<string>;
	children?: Parts;
}

export const ResizablePanelGroup = component<ResizablePanelGroupProps>(
	(props) => {
		const horizontal = props.direction !== "vertical";
		const min = props.minSize ?? 10;
		const max = props.maxSize ?? 90;
		const size = signal(clamp(props.defaultSize ?? 50, min, max));
		const rootId = uid("resizable");
		let panels = 0;

		function setSize(percent: number): void {
			const next = clamp(percent, min, max);
			size(next);
			props.onResize?.(next);
		}

		provide<ResizableApi>(ResizableContext, {
			rootId,
			horizontal,
			min,
			max,
			size: () => size(),
			setSize,
			claimPanel() {
				panels += 1;
				return panels;
			},
		});

		return html`<div
			data-slot="resizable-panel-group"
			id="${rootId}"
			data-direction="${horizontal ? "horizontal" : "vertical"}"
			class="${() =>
				cn(
					"flex h-full w-full",
					horizontal ? "flex-row" : "flex-col",
					read(props.class),
				)}"
		>${props.children?.()}</div>`;
	},
);

export interface ResizablePanelProps {
	children?: Slot;
	class?: Reactive<string>;
}

/**
 * One pane.
 *
 * NAMED DEVIATION — two panes, not n. Upstream's `react-resizable-panels`
 * distributes a size array across any number of panels and persists it;
 * `ResizablePanelGroup` here holds ONE split, so the first panel takes the
 * share and the second takes the rest. The parts are upstream's so a layout
 * written against them reads the same; a third panel would simply have no
 * share of its own.
 */
export const ResizablePanel = component<ResizablePanelProps>((props) => {
	const group = inject(ResizableContext);
	const first = group.claimPanel() === 1;
	return html`<div
		data-slot="resizable-panel"
		class="${() => cn("overflow-hidden", first ? "" : "flex-1", read(props.class))}"
		style="${() => (first ? `flex: 0 0 ${group.size()}%` : "")}"
	>${slot(props.children)}</div>`;
});

export interface ResizableHandleProps {
	/** Show the grip dots. */
	withHandle?: boolean;
	class?: Reactive<string>;
}

/**
 * The divider.
 *
 * `role="separator"` with `aria-valuenow`, and it takes focus: the arrows,
 * Home and End move it. A drag handle that only answers to a pointer is not
 * reachable at all for a keyboard user, and there is no other way to resize.
 */
export const ResizableHandle = component<ResizableHandleProps>((props) => {
	const group = inject(ResizableContext);

	function percentAt(event: PointerEvent): number | null {
		const root = document.getElementById(group.rootId);
		if (root === null) return null;
		const rect = root.getBoundingClientRect();
		const span = group.horizontal ? rect.width : rect.height;
		if (span === 0) return null;
		const offset = group.horizontal
			? event.clientX - rect.left
			: event.clientY - rect.top;
		return (offset / span) * 100;
	}

	function onPointerDown(event: PointerEvent): void {
		const target = event.currentTarget;
		if (!(target instanceof HTMLElement)) return;
		event.preventDefault();
		target.setPointerCapture(event.pointerId);

		const onMove = (move: PointerEvent): void => {
			const percent = percentAt(move);
			if (percent !== null) group.setSize(percent);
		};
		const onUp = (): void => {
			target.releasePointerCapture(event.pointerId);
			target.removeEventListener("pointermove", onMove);
			target.removeEventListener("pointerup", onUp);
			target.removeEventListener("pointercancel", onUp);
		};

		target.addEventListener("pointermove", onMove);
		target.addEventListener("pointerup", onUp);
		target.addEventListener("pointercancel", onUp);
	}

	function onKeyDown(event: KeyboardEvent): void {
		const back = group.horizontal ? "ArrowLeft" : "ArrowUp";
		const forward = group.horizontal ? "ArrowRight" : "ArrowDown";

		if (event.key === back) {
			event.preventDefault();
			group.setSize(group.size() - KEYBOARD_STEP);
		} else if (event.key === forward) {
			event.preventDefault();
			group.setSize(group.size() + KEYBOARD_STEP);
		} else if (event.key === "Home") {
			event.preventDefault();
			group.setSize(group.min);
		} else if (event.key === "End") {
			event.preventDefault();
			group.setSize(group.max);
		}
	}

	return html`<div
		data-slot="resizable-handle"
		role="separator"
		tabindex="0"
		aria-orientation="${group.horizontal ? "vertical" : "horizontal"}"
		aria-valuemin="${group.min}"
		aria-valuemax="${group.max}"
		aria-valuenow="${() => Math.round(group.size())}"
		aria-label="Resize panes"
		class="${() =>
			cn(
				"bg-border relative flex shrink-0 items-center justify-center outline-none",
				"focus-visible:ring-ring focus-visible:ring-1 focus-visible:ring-offset-1",
				group.horizontal ? "w-px cursor-col-resize" : "h-px cursor-row-resize",
				read(props.class),
			)}"
		@pointerdown="${onPointerDown}"
		@keydown="${onKeyDown}"
	>${
		props.withHandle === true
			? html`<span
					class="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border"
				>${GripVerticalIcon({ class: "size-2.5" })}</span>`
			: null
	}</div>`;
});

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
