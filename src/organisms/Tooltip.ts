/**
 * Tooltip — a label that appears on hover or focus.
 *
 * Four parts, as upstream: a `TooltipProvider` that owns the timing for a
 * group, a `Tooltip` that owns one tooltip's state, a `TooltipTrigger` and a
 * `TooltipContent`. The state lives in the middle and both ends read it
 * through context, which is why the trigger can describe content it never
 * sees.
 *
 *   TooltipProvider({ children: () => html`
 *     ${Tooltip({ children: () => html`
 *       ${TooltipTrigger({ children: () => Button({ children: "Save" }) })}
 *       ${TooltipContent({ children: "Saves and closes" })}
 *     ` })}
 *   ` })
 *
 * The `() =>` is not decoration. Aurora builds eagerly, so children handed
 * over already built would have run before the provider existed and found no
 * context — see `Parts`.
 *
 * Three rules separate a usable tooltip from an irritating one, and all three
 * are about time rather than appearance:
 *
 * - An **open delay**, so moving the pointer across a toolbar does not fire
 *   six tooltips on the way past.
 * - A **close delay**, so travelling from the trigger to the tooltip — which a
 *   user does to read a long one, or click a link inside — does not dismiss it
 *   halfway.
 * - **No delay between neighbours.** Once one tooltip is showing, the next one
 *   appears instantly; the user has clearly decided to browse the toolbar, and
 *   re-serving the delay each time makes the interface feel stuck. That is
 *   what `skipDelayDuration` bounds, and why the window belongs to the
 *   provider rather than to either tooltip.
 *
 * Focus opens it with no delay at all. A keyboard user landing on a control
 * has already committed to it, and a delay just looks like lag.
 *
 * `role="tooltip"` plus `aria-describedby` — never `aria-labelledby`. A
 * tooltip supplements a control's name; it is not the name. A button labelled
 * only by its tooltip is unlabelled to anything that does not hover.
 */

import {
	component,
	createContext,
	html,
	inject,
	onUnmount,
	provide,
	signal,
	type TemplateResult,
} from "@c9up/aurora";
import type { Child, Parts, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { slideInFromSide, zoomInOut } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";
import type { Align, Placement, Side } from "../primitives/floating.js";
import { floatingSurface } from "../primitives/floatingSurface.js";

/** Upstream's default once shadcn has overridden Radix's 700ms. */
const DEFAULT_DELAY_MS = 0;
/** Radix's `skipDelayDuration`. */
const DEFAULT_SKIP_DELAY_MS = 300;
const CLOSE_DELAY_MS = 150;

interface TooltipGroup {
	readonly delayDuration: number;
	readonly skipDelayDuration: number;
	readonly disableHoverableContent: boolean;
	/** When the last tooltip in this group closed — the skip window. */
	lastClosedAt: number;
}

/**
 * NAMED DEVIATION — a default, where Radix throws without a `TooltipProvider`.
 *
 * Radix raises so the skip-delay grouping is always an explicit choice. Here
 * the default IS a group: one page-wide window, which is what nebula did
 * before the parts were split out and what a single tooltip on a page wants.
 * Wrapping a toolbar in a provider still gives it a window of its own, so
 * nothing is lost — only the raise.
 */
const TooltipProviderContext = createContext<TooltipGroup>("TooltipProvider", {
	delayDuration: DEFAULT_DELAY_MS,
	skipDelayDuration: DEFAULT_SKIP_DELAY_MS,
	disableHoverableContent: false,
	lastClosedAt: 0,
});

interface RegisteredContent {
	readonly render: () => Child;
	readonly side: Side;
	readonly align: Align;
	readonly sideOffset: number;
	readonly class?: Reactive<string>;
}

interface TooltipApi {
	readonly triggerId: string;
	readonly contentId: string;
	/** An accessor, not a signal: controlled tooltips read the caller's prop. */
	readonly open: () => boolean;
	/** Hover opens after the group's delay; focus opens at once. */
	requestOpen(immediate: boolean): void;
	requestClose(): void;
	cancelPending(): void;
	register(content: RegisteredContent): void;
}

const TooltipContext = createContext<TooltipApi>("Tooltip");

export interface TooltipProviderProps {
	/** Hover delay before opening, in ms. */
	delayDuration?: number;
	/** How long after one closes that the next in the group opens instantly. */
	skipDelayDuration?: number;
	/** Close as soon as the pointer leaves the trigger, even towards the tooltip. */
	disableHoverableContent?: boolean;
	children?: Parts;
}

/**
 * Timing shared by every tooltip inside it.
 *
 * Renders no element of its own, exactly as upstream: it is a context holder,
 * and giving it a wrapper would put a box into a layout that did not ask for
 * one. `data-slot="tooltip-provider"` is inert upstream for the same reason.
 */
export const TooltipProvider = component<TooltipProviderProps>((props) => {
	provide<TooltipGroup>(TooltipProviderContext, {
		delayDuration: props.delayDuration ?? DEFAULT_DELAY_MS,
		skipDelayDuration: props.skipDelayDuration ?? DEFAULT_SKIP_DELAY_MS,
		disableHoverableContent: props.disableHoverableContent ?? false,
		lastClosedAt: 0,
	});
	return html`${props.children?.()}`;
});

export interface TooltipProps {
	/** Controlled state. Omit to let the tooltip own it. */
	open?: Reactive<boolean>;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	/** Overrides the provider's delay for this tooltip only. */
	delayDuration?: number;
	disableHoverableContent?: boolean;
	children?: Parts;
}

/**
 * One tooltip: the state its trigger and its content both read.
 *
 * Renders no element of its own — see `TooltipProvider`. The parts are built
 * here, inside setup, which is what puts the context within their reach; the
 * content registers itself during that call, so the floating surface can be
 * wired straight afterwards.
 */
export const Tooltip = component<TooltipProps>((props) => {
	const group = inject(TooltipProviderContext);
	const triggerId = uid("tooltip-trigger");
	const contentId = uid("tooltip-content");
	const internal = signal(props.defaultOpen ?? false);
	let content: RegisteredContent | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;

	/** Controlled when `open` reads as anything but `undefined`, on every read. */
	function isOpen(): boolean {
		const external = read(props.open);
		return external === undefined ? internal() : external;
	}

	function setOpen(next: boolean): void {
		// Written even when controlled: the caller may ignore `onOpenChange` and
		// leave its own state put, and the internal value has to stay in step for
		// the moment it stops controlling.
		internal(next);
		props.onOpenChange?.(next);
	}

	function cancelPending(): void {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
	}

	function requestOpen(immediate: boolean): void {
		cancelPending();
		const withinSkipWindow =
			Date.now() - group.lastClosedAt < group.skipDelayDuration;
		const delay =
			immediate || withinSkipWindow
				? 0
				: (props.delayDuration ?? group.delayDuration);
		if (delay === 0) {
			setOpen(true);
			return;
		}
		timer = setTimeout(() => setOpen(true), delay);
	}

	function requestClose(): void {
		cancelPending();
		timer = setTimeout(() => {
			setOpen(false);
			group.lastClosedAt = Date.now();
		}, CLOSE_DELAY_MS);
	}

	onUnmount(cancelPending);

	provide<TooltipApi>(TooltipContext, {
		triggerId,
		contentId,
		open: isOpen,
		requestOpen,
		requestClose,
		cancelPending,
		register(registered) {
			content = registered;
		},
	});

	// Built HERE so the parts see the context, and so the content has
	// registered by the time the surface below needs it.
	const parts = props.children?.();

	if (content !== undefined) {
		const registered = content;
		const placement: Placement =
			registered.align === "center"
				? registered.side
				: `${registered.side}-${registered.align}`;
		floatingSurface({
			anchor: () => document.getElementById(triggerId),
			open: isOpen,
			onClose: () => {
				cancelPending();
				setOpen(false);
			},
			placement,
			offset: registered.sideOffset,
			arrowSize: ARROW_SIZE_PX,
			arrow: (element) => element.querySelector('[data-slot="tooltip-arrow"]'),
			// A tooltip is not a layer the pointer dismisses: it closes because
			// the pointer left, which the trigger's own handlers already say.
			outsidePointer: false,
			content: () =>
				renderContent(registered, contentId, {
					hoverable: !(
						props.disableHoverableContent ?? group.disableHoverableContent
					),
					cancelPending,
					requestClose,
				}),
		});
	}

	return html`${parts}`;
});

export interface TooltipTriggerProps {
	children?: Slot;
	class?: Reactive<string>;
}

/**
 * The control being described.
 *
 * NAMED DEVIATION — a wrapping `<span>`, where upstream is used as
 * `<TooltipTrigger asChild>` and merges onto the control itself. `asChild`
 * needs an element to merge INTO, and Aurora has no element until the template
 * is rendered; a `<button>` wrapper would nest a button inside a button, which
 * is invalid and unfocusable. `inline-flex` keeps the wrapper out of the
 * layout. Focus still opens it because `focusin` bubbles out of the control.
 */
export const TooltipTrigger = component<TooltipTriggerProps>((props) => {
	const tooltip = inject(TooltipContext);
	return html`<span
		data-slot="tooltip-trigger"
		id="${tooltip.triggerId}"
		data-state="${() => (tooltip.open() ? "open" : "closed")}"
		aria-describedby="${() => (tooltip.open() ? tooltip.contentId : undefined)}"
		class="${() => cn("inline-flex", read(props.class))}"
		@pointerenter="${() => tooltip.requestOpen(false)}"
		@pointerleave="${() => tooltip.requestClose()}"
		@focusin="${() => tooltip.requestOpen(true)}"
		@focusout="${() => tooltip.requestClose()}"
	>${slot(props.children)}</span>`;
});

export interface TooltipContentProps {
	children?: Child;
	/** Which edge of the trigger to sit on. Flips when there is no room. */
	side?: Side;
	align?: Align;
	sideOffset?: number;
	class?: Reactive<string>;
}

/**
 * The label itself.
 *
 * Renders nothing where it is written: the tooltip portals its content out of
 * the tree when it opens, so this registers what to build and returns an empty
 * template. Writing it inside `Tooltip` — rather than passing content as a
 * prop — is what keeps the call site shaped like the thing it describes.
 */
export const TooltipContent = component<TooltipContentProps>((props) => {
	const tooltip = inject(TooltipContext);
	tooltip.register({
		render: () => props.children,
		side: props.side ?? "top",
		align: props.align ?? "center",
		sideOffset: props.sideOffset ?? 0,
		class: props.class,
	});
	return html``;
});

/** `size-2.5` in pixels — what the positioner centres on the anchor. */
const ARROW_SIZE_PX = 10;

const CONTENT_CLASSES =
	"bg-foreground text-background z-50 w-fit origin-(--nebula-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance";

/**
 * NAMED DEVIATION — the arrow is placed per side here, where shadcn writes one
 * `translate-y`. Radix wraps its arrow in a span the popper rotates to face the
 * anchor, so upstream's single nudge is applied in an already-oriented frame.
 * `autoPosition` positions the arrow along the CROSS axis only, by design, and
 * leaves the facing edge to CSS — so the edge has to be named for each side.
 * The look is upstream's: a 10px square, rotated, softly rounded.
 */
const ARROW_CLASSES = [
	"bg-foreground fill-foreground absolute z-50 size-2.5 rotate-45 rounded-[2px]",
	"data-[side=top]:bottom-0 data-[side=top]:translate-y-[calc(50%_-_2px)]",
	"data-[side=bottom]:top-0 data-[side=bottom]:translate-y-[calc(-50%_+_2px)]",
	"data-[side=left]:right-0 data-[side=left]:translate-x-[calc(50%_-_2px)]",
	"data-[side=right]:left-0 data-[side=right]:translate-x-[calc(-50%_+_2px)]",
].join(" ");

interface ContentHandlers {
	readonly hoverable: boolean;
	cancelPending(): void;
	requestClose(): void;
}

function renderContent(
	registered: RegisteredContent,
	contentId: string,
	handlers: ContentHandlers,
): TemplateResult {
	// Hoverable content keeps the tooltip open while the pointer is inside it,
	// which is the only way to read a long one or click a link in it.
	const enter = handlers.hoverable ? () => handlers.cancelPending() : undefined;
	const leave = handlers.hoverable ? () => handlers.requestClose() : undefined;
	return html`<div
		data-slot="tooltip-content"
		id="${contentId}"
		role="tooltip"
		class="${cn(
			CONTENT_CLASSES,
			zoomInOut,
			slideInFromSide,
			read(registered.class),
		)}"
		@pointerenter="${enter}"
		@pointerleave="${leave}"
	>${registered.render()}<span
			data-slot="tooltip-arrow"
			class="${ARROW_CLASSES}"
		></span></div>`;
}
