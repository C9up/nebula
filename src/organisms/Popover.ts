/**
 * Popover — a floating panel anchored to a trigger.
 *
 * The plainest use of `floatingSurface`, and the one to read first: the other
 * anchored overlays in this directory are this component with a different
 * opening gesture and different contents.
 *
 *   Popover({ children: () => html`
 *     ${PopoverTrigger({ children: "Open" })}
 *     ${PopoverContent({ children: () => html`
 *       ${PopoverHeader({ children: () => html`
 *         ${PopoverTitle({ children: "Dimensions" })}
 *         ${PopoverDescription({ children: "Set the box size." })}
 *       ` })}
 *     ` })}
 *   ` })
 *
 * The `() =>` on a part that provides context is load-bearing — see `Parts`.
 * The purely presentational parts below take ordinary children.
 *
 * `modal` decides whether focus is trapped. A popover holding a form should
 * trap — tabbing out of a half-filled form into the page behind loses the
 * user's place. A popover holding a paragraph of help should not, because
 * trapping focus in something the user can only read is a dead end.
 */

import {
	component,
	createContext,
	html,
	inject,
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

export const popoverContentClasses =
	"bg-popover text-popover-foreground z-50 w-72 origin-(--nebula-transform-origin) rounded-md border p-4 shadow-md outline-hidden";

interface RegisteredContent {
	readonly render: () => Child;
	readonly side: Side;
	readonly align: Align;
	readonly sideOffset: number;
	readonly modal: boolean;
	readonly class?: Reactive<string>;
}

interface PopoverApi {
	readonly triggerId: string;
	readonly contentId: string;
	readonly open: () => boolean;
	toggle(): void;
	setOpen(next: boolean): void;
	/** An explicit anchor wins over the trigger — see `PopoverAnchor`. */
	useAnchor(id: string): void;
	register(content: RegisteredContent): void;
}

const PopoverContext = createContext<PopoverApi>("Popover");

export interface PopoverProps {
	open?: Reactive<boolean>;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	children?: Parts;
}

/**
 * The state its trigger and its content both read.
 *
 * Renders no element of its own, as upstream does not: a wrapper would put a
 * box into a layout that did not ask for one, and `data-slot="popover"` is
 * inert upstream for the same reason.
 */
export const Popover = component<PopoverProps>((props) => {
	const triggerId = uid("popover-trigger");
	const contentId = uid("popover-content");
	let anchorId = triggerId;
	let content: RegisteredContent | undefined;

	const state = controllable<boolean>({
		value: props.open,
		initial: props.defaultOpen ?? false,
		onChange: props.onOpenChange,
	});

	provide<PopoverApi>(PopoverContext, {
		triggerId,
		contentId,
		open: () => state.current(),
		toggle: () => state.set(!state.current()),
		setOpen: (next) => state.set(next),
		useAnchor(id) {
			anchorId = id;
		},
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
			anchor: () => document.getElementById(anchorId),
			open: () => state.current(),
			onClose: () => state.set(false),
			placement,
			offset: registered.sideOffset,
			trapFocus: registered.modal,
			autoFocus: !registered.modal,
			content: () => renderContent(registered, contentId, triggerId),
		});
	}

	return html`${parts}`;
});

export interface PopoverTriggerProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const PopoverTrigger = component<PopoverTriggerProps>((props) => {
	const popover = inject(PopoverContext);
	return html`<button
		type="button"
		data-slot="popover-trigger"
		id="${popover.triggerId}"
		aria-haspopup="dialog"
		aria-expanded="${() => (popover.open() ? "true" : "false")}"
		aria-controls="${() => (popover.open() ? popover.contentId : undefined)}"
		data-state="${() => (popover.open() ? "open" : "closed")}"
		class="${() => cn(read(props.class))}"
		@click="${() => popover.toggle()}"
	>${slot(props.children)}</button>`;
});

export interface PopoverAnchorProps {
	children?: Slot;
	class?: Reactive<string>;
}

/**
 * Position the panel against something other than the trigger.
 *
 * A cell menu whose button sits in the corner but whose panel should line up
 * with the whole cell, or a mention popover anchored to a caret marker rather
 * than to any control.
 */
export const PopoverAnchor = component<PopoverAnchorProps>((props) => {
	const popover = inject(PopoverContext);
	const anchorId = uid("popover-anchor");
	popover.useAnchor(anchorId);
	return html`<span
		data-slot="popover-anchor"
		id="${anchorId}"
		class="${() => cn(read(props.class))}"
	>${slot(props.children)}</span>`;
});

export interface PopoverContentProps {
	children?: Slot;
	/** Which edge of the anchor to sit on. Flips when there is no room. */
	side?: Side;
	align?: Align;
	sideOffset?: number;
	/** Trap focus inside. Use for panels holding form controls. */
	modal?: boolean;
	class?: Reactive<string>;
}

/**
 * The panel.
 *
 * Renders nothing where it is written: the popover portals its content out of
 * the tree when it opens, so this registers what to build and returns an empty
 * template.
 */
export const PopoverContent = component<PopoverContentProps>((props) => {
	const popover = inject(PopoverContext);
	popover.register({
		render: () => slot(props.children)(),
		side: props.side ?? "bottom",
		align: props.align ?? "center",
		sideOffset: props.sideOffset ?? 4,
		modal: props.modal === true,
		class: props.class,
	});
	return html``;
});

export interface PopoverSectionProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const PopoverHeader = component<PopoverSectionProps>(
	(props) => html`<div
		data-slot="popover-header"
		class="${() => cn("flex flex-col gap-1 text-sm", read(props.class))}"
	>${slot(props.children)}</div>`,
);

/**
 * NAMED DEVIATION — a `<div>`, matching what upstream RENDERS rather than what
 * it types. shadcn declares `PopoverTitle` as `ComponentProps<"h2">` and then
 * returns a `<div>`; a heading here would land inside a `role="dialog"` and
 * change how a screen reader announces the panel, which is not a difference to
 * introduce silently. The panel is already named by its trigger.
 */
export const PopoverTitle = component<PopoverSectionProps>(
	(props) => html`<div
		data-slot="popover-title"
		class="${() => cn("font-medium", read(props.class))}"
	>${slot(props.children)}</div>`,
);

export const PopoverDescription = component<PopoverSectionProps>(
	(props) => html`<p
		data-slot="popover-description"
		class="${() => cn("text-muted-foreground", read(props.class))}"
	>${slot(props.children)}</p>`,
);

function renderContent(
	registered: RegisteredContent,
	contentId: string,
	triggerId: string,
): TemplateResult {
	return html`<div
		data-slot="popover-content"
		id="${contentId}"
		role="dialog"
		aria-labelledby="${triggerId}"
		tabindex="-1"
		class="${cn(
			popoverContentClasses,
			zoomInOut,
			slideInFromSide,
			read(registered.class),
		)}"
	>${registered.render()}</div>`;
}
