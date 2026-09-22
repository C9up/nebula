/**
 * HoverCard — a preview that appears when the pointer rests on a link.
 *
 *   HoverCard({ children: () => html`
 *     ${HoverCardTrigger({ children: "@nebula" })}
 *     ${HoverCardContent({ children: "…" })}
 *   ` })
 *
 * Longer delays than a Tooltip, in both directions, and for different reasons.
 * Opening is slow because a hover card is a heavier interruption than a label
 * — it covers content, so it should appear only on a deliberate rest. Closing
 * is slow because the card is meant to be entered: it holds links.
 *
 * `role="dialog"`, not `role="tooltip"`. A tooltip is a label and must contain
 * nothing interactive; a hover card is a small window that may.
 */

import {
	component,
	createContext,
	html,
	inject,
	onUnmount,
	provide,
	type TemplateResult,
} from "@c9up/aurora";
import type { Child, Parts, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { slideInFromSide, zoomInOut } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";
import type { Align, Placement, Side } from "../primitives/floating.js";
import { floatingSurface } from "../primitives/floatingSurface.js";

const OPEN_DELAY_MS = 700;
const CLOSE_DELAY_MS = 300;

interface RegisteredContent {
	readonly body: Child;
	readonly side: Side;
	readonly align: Align;
	readonly sideOffset: number;
	readonly class?: Reactive<string>;
}

interface HoverCardApi {
	readonly triggerId: string;
	readonly contentId: string;
	readonly open: () => boolean;
	scheduleOpen(): void;
	scheduleClose(): void;
	cancelPending(): void;
	register(content: RegisteredContent): void;
}

const HoverCardContext = createContext<HoverCardApi>("HoverCard");

export interface HoverCardProps {
	open?: Reactive<boolean>;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	openDelay?: number;
	closeDelay?: number;
	children?: Parts;
}

export const HoverCard = component<HoverCardProps>((props) => {
	const triggerId = uid("hover-card-trigger");
	const contentId = uid("hover-card-content");
	let content: RegisteredContent | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const state = controllable<boolean>({
		value: props.open,
		initial: props.defaultOpen ?? false,
		onChange: props.onOpenChange,
	});

	function cancelPending(): void {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
	}

	function schedule(next: boolean, delay: number): void {
		cancelPending();
		timer = setTimeout(() => state.set(next), delay);
	}

	onUnmount(cancelPending);

	provide<HoverCardApi>(HoverCardContext, {
		triggerId,
		contentId,
		open: () => state.current(),
		scheduleOpen: () => schedule(true, props.openDelay ?? OPEN_DELAY_MS),
		scheduleClose: () => schedule(false, props.closeDelay ?? CLOSE_DELAY_MS),
		cancelPending,
		register(registered) {
			content = registered;
		},
	});

	const parts = props.children?.();

	if (content !== undefined) {
		const registered = content;
		const placement: Placement =
			registered.align === "center"
				? registered.side
				: `${registered.side}-${registered.align}`;
		floatingSurface({
			anchor: () => document.getElementById(triggerId),
			open: () => state.current(),
			onClose: () => {
				cancelPending();
				state.set(false);
			},
			placement,
			offset: registered.sideOffset,
			content: () =>
				renderContent(registered, {
					contentId,
					triggerId,
					enter: cancelPending,
					leave: () => schedule(false, props.closeDelay ?? CLOSE_DELAY_MS),
				}),
		});
	}

	return html`${parts}`;
});

export interface HoverCardTriggerProps {
	children?: Slot;
	href?: string;
	class?: Reactive<string>;
}

/**
 * What the pointer rests on.
 *
 * An `<a>` when given an `href`, a `<span>` otherwise — upstream is used with
 * `asChild` around a link, and a `<span>` wrapping one would put the hover
 * target and the link in different elements.
 */
export const HoverCardTrigger = component<HoverCardTriggerProps>((props) => {
	const card = inject(HoverCardContext);
	const shared = {
		id: card.triggerId,
		open: () => card.open(),
	};
	if (props.href !== undefined) {
		return html`<a
			data-slot="hover-card-trigger"
			id="${shared.id}"
			href="${props.href}"
			data-state="${() => (shared.open() ? "open" : "closed")}"
			class="${() => cn(read(props.class))}"
			@pointerenter="${() => card.scheduleOpen()}"
			@pointerleave="${() => card.scheduleClose()}"
			@focusin="${() => card.scheduleOpen()}"
			@focusout="${() => card.scheduleClose()}"
		>${slot(props.children)}</a>`;
	}
	return html`<span
		data-slot="hover-card-trigger"
		id="${shared.id}"
		data-state="${() => (shared.open() ? "open" : "closed")}"
		class="${() => cn("inline-flex", read(props.class))}"
		@pointerenter="${() => card.scheduleOpen()}"
		@pointerleave="${() => card.scheduleClose()}"
		@focusin="${() => card.scheduleOpen()}"
		@focusout="${() => card.scheduleClose()}"
	>${slot(props.children)}</span>`;
});

export interface HoverCardContentProps {
	children?: Slot;
	side?: Side;
	align?: Align;
	sideOffset?: number;
	class?: Reactive<string>;
}

export const HoverCardContent = component<HoverCardContentProps>((props) => {
	const card = inject(HoverCardContext);
	card.register({
		body: slot(props.children)(),
		side: props.side ?? "bottom",
		align: props.align ?? "center",
		sideOffset: props.sideOffset ?? 8,
		class: props.class,
	});
	return html``;
});

interface ContentHandlers {
	readonly contentId: string;
	readonly triggerId: string;
	enter(): void;
	leave(): void;
}

function renderContent(
	registered: RegisteredContent,
	handlers: ContentHandlers,
): TemplateResult {
	// The card stays open while the pointer is inside it, which is the only way
	// to reach the links it exists to show.
	return html`<div
		data-slot="hover-card-content"
		id="${handlers.contentId}"
		role="dialog"
		aria-labelledby="${handlers.triggerId}"
		class="${cn(
			"bg-popover text-popover-foreground z-50 w-64 origin-(--nebula-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
			zoomInOut,
			slideInFromSide,
			read(registered.class),
		)}"
		@pointerenter="${() => handlers.enter()}"
		@pointerleave="${() => handlers.leave()}"
	>${registered.body}</div>`;
}
