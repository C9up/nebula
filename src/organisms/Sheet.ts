/**
 * Sheet — a panel that slides in from an edge.
 *
 * Structurally a Dialog whose panel is pinned to a side rather than centred,
 * so it shares `modalSurface` and everything that comes with it. What differs
 * is the motion: it translates rather than scaling, and the distance depends
 * on the panel's own size, which only `translate-x-full` knows. That is why
 * `slideFrom` produces a transition and not a keyframe animation.
 *
 *   Sheet({ children: () => html`
 *     ${SheetTrigger({ children: "Filters" })}
 *     ${SheetContent({ side: "left", children: () => html`
 *       ${SheetHeader({ children: SheetTitle({ children: "Filters" }) })}
 *       ${SheetFooter({ children: SheetClose({ children: "Done" }) })}
 *     ` })}
 *   ` })
 *
 * `inset-y-0` for the side panels and `inset-x-0` for the top and bottom ones
 * is what makes the sheet span its edge; the opposite axis takes the width or
 * height. Getting that pair the wrong way round produces a panel floating in a
 * corner, which is the usual first attempt.
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
import { XIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { fadeInOut, slideFrom } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";
import type { Side } from "../primitives/floating.js";
import { modalSurface } from "../primitives/modalSurface.js";
import { dialogBackdropClasses } from "./Dialog.js";

const panelBaseClasses =
	"bg-background fixed z-50 flex flex-col gap-4 shadow-lg outline-none transition ease-in-out";

const closeButtonClasses =
	"ring-offset-background focus-visible:ring-ring absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none";

interface RegisteredContent {
	readonly body: Child;
	readonly side: Side;
	readonly showCloseButton: boolean;
	readonly class?: Reactive<string>;
}

interface SheetApi {
	readonly triggerId: string;
	readonly panelId: string;
	readonly titleId: string;
	readonly descriptionId: string;
	readonly open: () => boolean;
	setOpen(next: boolean): void;
	declareTitle(): void;
	declareDescription(): void;
	register(content: RegisteredContent): void;
}

const SheetContext = createContext<SheetApi>("Sheet");

/** Edge placement and the axis the panel is sized on. */
function panelClassesFor(side: Side): string {
	if (side === "left") {
		return "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm";
	}
	if (side === "right") {
		return "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm";
	}
	if (side === "top") return "inset-x-0 top-0 h-auto border-b";
	return "inset-x-0 bottom-0 h-auto border-t";
}

export interface SheetProps {
	open?: Reactive<boolean>;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	children?: Parts;
}

export const Sheet = component<SheetProps>((props) => {
	const triggerId = uid("sheet-trigger");
	const panelId = uid("sheet-panel");
	const titleId = uid("sheet-title");
	const descriptionId = uid("sheet-description");
	let hasTitle = false;
	let hasDescription = false;
	let content: RegisteredContent | undefined;

	const state = controllable<boolean>({
		value: props.open,
		initial: props.defaultOpen ?? false,
		onChange: props.onOpenChange,
	});

	provide<SheetApi>(SheetContext, {
		triggerId,
		panelId,
		titleId,
		descriptionId,
		open: () => state.current(),
		setOpen: (next) => state.set(next),
		declareTitle() {
			hasTitle = true;
		},
		declareDescription() {
			hasDescription = true;
		},
		register(registered) {
			content = registered;
		},
	});

	const parts = props.children?.();

	if (content !== undefined) {
		const registered = content;
		if (!hasTitle) {
			console.warn(
				"nebula: a Sheet has no SheetTitle. It will be announced only as “dialog”.",
			);
		}
		modalSurface({
			open: () => state.current(),
			onClose: () => state.set(false),
			panel: (root) => root.querySelector(`#${CSS.escape(panelId)}`),
			returnFocus: () => document.getElementById(triggerId),
			content: () =>
				renderSurface(registered, {
					panelId,
					titleId: hasTitle ? titleId : undefined,
					descriptionId: hasDescription ? descriptionId : undefined,
					close: () => state.set(false),
				}),
		});
	}

	return html`${parts}`;
});

export interface SheetTriggerProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const SheetTrigger = component<SheetTriggerProps>((props) => {
	const sheet = inject(SheetContext);
	return html`<button
		type="button"
		data-slot="sheet-trigger"
		id="${sheet.triggerId}"
		aria-haspopup="dialog"
		aria-expanded="${() => (sheet.open() ? "true" : "false")}"
		data-state="${() => (sheet.open() ? "open" : "closed")}"
		class="${() => cn(read(props.class))}"
		@click="${() => sheet.setOpen(true)}"
	>${slot(props.children)}</button>`;
});

export interface SheetCloseProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const SheetClose = component<SheetCloseProps>((props) => {
	const sheet = inject(SheetContext);
	return html`<button
		type="button"
		data-slot="sheet-close"
		class="${() => cn(read(props.class))}"
		@click="${() => sheet.setOpen(false)}"
	>${slot(props.children)}</button>`;
});

export interface SheetOverlayProps {
	class?: Reactive<string>;
}

export const SheetOverlay = component<SheetOverlayProps>(
	(props) => html`<div
		data-slot="sheet-overlay"
		class="${() => cn(dialogBackdropClasses, read(props.class))}"
	></div>`,
);

export interface SheetContentProps {
	children?: Parts;
	/** Which edge it comes from. Default `"right"`. */
	side?: Side;
	showCloseButton?: boolean;
	class?: Reactive<string>;
}

/**
 * The panel.
 *
 * NAMED DEVIATION FROM NEBULA'S OWN PAST — there is no `sheet-body` wrapper
 * any more. Upstream puts the padding on the header and footer and leaves the
 * middle to the caller, and an extra flex child here would not sit where a
 * design copied from upstream expects it. A long middle scrolls by wrapping it
 * in `flex-1 overflow-y-auto`, which is what upstream's own examples do.
 */
export const SheetContent = component<SheetContentProps>((props) => {
	const sheet = inject(SheetContext);
	const body = props.children?.();
	sheet.register({
		body,
		side: props.side ?? "right",
		showCloseButton: props.showCloseButton ?? true,
		class: props.class,
	});
	return html``;
});

export interface SheetSectionProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const SheetHeader = component<SheetSectionProps>(
	(props) => html`<div
		data-slot="sheet-header"
		class="${() => cn("flex flex-col gap-1.5 p-4", read(props.class))}"
	>${slot(props.children)}</div>`,
);

export const SheetFooter = component<SheetSectionProps>(
	(props) => html`<div
		data-slot="sheet-footer"
		class="${() => cn("mt-auto flex flex-col gap-2 p-4", read(props.class))}"
	>${slot(props.children)}</div>`,
);

export interface SheetTitleProps {
	children?: Slot;
	/** Keep it for screen readers but out of the layout. */
	srOnly?: boolean;
	class?: Reactive<string>;
}

export const SheetTitle = component<SheetTitleProps>((props) => {
	const sheet = inject(SheetContext);
	sheet.declareTitle();
	return html`<h2
		id="${sheet.titleId}"
		data-slot="sheet-title"
		class="${() =>
			cn(
				"text-foreground font-semibold",
				props.srOnly === true ? "sr-only" : "",
				read(props.class),
			)}"
	>${slot(props.children)}</h2>`;
});

export const SheetDescription = component<SheetSectionProps>((props) => {
	const sheet = inject(SheetContext);
	sheet.declareDescription();
	return html`<p
		id="${sheet.descriptionId}"
		data-slot="sheet-description"
		class="${() => cn("text-muted-foreground text-sm", read(props.class))}"
	>${slot(props.children)}</p>`;
});

interface SurfaceIds {
	readonly panelId: string;
	readonly titleId: string | undefined;
	readonly descriptionId: string | undefined;
	close(): void;
}

function renderSurface(
	registered: RegisteredContent,
	ids: SurfaceIds,
): TemplateResult {
	const corner = registered.showCloseButton
		? html`<button
				type="button"
				data-slot="sheet-close"
				class="${closeButtonClasses}"
				@click="${() => ids.close()}"
			>${XIcon({ class: "size-4" })}<span class="sr-only">Close</span></button>`
		: null;
	return html`<div data-slot="sheet-portal" class="${cn("fixed inset-0 z-50", fadeInOut)}">
		<div data-slot="sheet-overlay" class="${dialogBackdropClasses}"></div>
		<div
			data-slot="sheet-content"
			data-side="${registered.side}"
			id="${ids.panelId}"
			role="dialog"
			aria-modal="true"
			aria-labelledby="${ids.titleId}"
			aria-describedby="${ids.descriptionId}"
			tabindex="-1"
			class="${cn(
				panelBaseClasses,
				panelClassesFor(registered.side),
				slideFrom(registered.side),
				read(registered.class),
			)}"
		>${registered.body}${corner}</div>
	</div>`;
}
