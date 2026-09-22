/**
 * Dialog — a modal window over the page.
 *
 * `modalSurface` supplies the contract (trap, scroll lock, backdrop dismissal,
 * hiding the page from assistive technology); these parts supply the markup.
 *
 *   Dialog({ children: () => html`
 *     ${DialogTrigger({ children: "Edit" })}
 *     ${DialogContent({ children: () => html`
 *       ${DialogHeader({ children: () => html`
 *         ${DialogTitle({ children: "Edit profile" })}
 *         ${DialogDescription({ children: "Change it." })}
 *       ` })}
 *       ${DialogFooter({ children: () => Button({ children: "Save" }) })}
 *     ` })}
 *   ` })
 *
 * Every part is built during `Dialog`'s setup, including the ones inside
 * `DialogContent`. That is not only the context rule — `DialogTitle` has to
 * have registered before the surface is wired, because the panel names itself
 * with the title's id and a panel rendered first would have had nothing to
 * point at.
 *
 * The `panel` callback matters more than it looks. The overlay's root spans
 * the viewport so the backdrop can, which means containment has to be answered
 * against the panel — check the root and every click on the page counts as
 * inside, and clicking the backdrop silently stops closing the dialog.
 *
 * `aria-labelledby` points at the title and `aria-describedby` at the
 * description, so a screen reader announces what the dialog is for on open. A
 * dialog with neither announces only "dialog", which is why a missing
 * `DialogTitle` is warned about — as upstream warns — rather than tolerated.
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
import { Button } from "../atoms/Button.js";
import type { Child, Parts, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { XIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { fadeInOut, zoomInOut } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";
import { modalSurface } from "../primitives/modalSurface.js";
import { portal } from "../primitives/portal.js";

export const dialogBackdropClasses =
	"fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0";

export const dialogPanelClasses =
	"bg-background fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border p-6 shadow-lg duration-200 outline-none sm:max-w-lg";

const closeButtonClasses =
	"ring-offset-background focus-visible:ring-ring absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0";

interface RegisteredContent {
	readonly body: Child;
	readonly showCloseButton: boolean;
	readonly dismissOnOutside: boolean;
	readonly dismissOnEscape: boolean;
	readonly class?: Reactive<string>;
}

interface DialogApi {
	readonly triggerId: string;
	readonly panelId: string;
	readonly titleId: string;
	readonly descriptionId: string;
	readonly open: () => boolean;
	setOpen(next: boolean): void;
	/** A part announcing it exists, so the panel can point `aria-*` at it. */
	declareTitle(): void;
	declareDescription(): void;
	register(content: RegisteredContent): void;
}

const DialogContext = createContext<DialogApi>("Dialog");

export interface DialogProps {
	open?: Reactive<boolean>;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	children?: Parts;
}

/**
 * The state every part reads.
 *
 * Renders no element of its own, as upstream does not: `data-slot="dialog"`
 * sits on a Radix Root that produces no DOM.
 */
export const Dialog = component<DialogProps>((props) => {
	const triggerId = uid("dialog-trigger");
	const panelId = uid("dialog-panel");
	const titleId = uid("dialog-title");
	const descriptionId = uid("dialog-description");
	let hasTitle = false;
	let hasDescription = false;
	let content: RegisteredContent | undefined;

	const state = controllable<boolean>({
		value: props.open,
		initial: props.defaultOpen ?? false,
		onChange: props.onOpenChange,
	});

	provide<DialogApi>(DialogContext, {
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
			// Upstream warns rather than raises, and so does this: a dialog with
			// no accessible name is a real defect, but not one worth taking a
			// page down for at runtime.
			console.warn(
				"nebula: a Dialog has no DialogTitle. It will be announced only as “dialog”.",
			);
		}
		modalSurface({
			open: () => state.current(),
			onClose: () => state.set(false),
			panel: (root) => root.querySelector(`#${CSS.escape(panelId)}`),
			returnFocus: () => document.getElementById(triggerId),
			dismissOnOutside: registered.dismissOnOutside,
			dismissOnEscape: registered.dismissOnEscape,
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

export interface DialogTriggerProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const DialogTrigger = component<DialogTriggerProps>((props) => {
	const dialog = inject(DialogContext);
	return html`<button
		type="button"
		data-slot="dialog-trigger"
		id="${dialog.triggerId}"
		aria-haspopup="dialog"
		aria-expanded="${() => (dialog.open() ? "true" : "false")}"
		data-state="${() => (dialog.open() ? "open" : "closed")}"
		class="${() => cn(read(props.class))}"
		@click="${() => dialog.setOpen(true)}"
	>${slot(props.children)}</button>`;
});

export interface DialogCloseProps {
	children?: Slot;
	class?: Reactive<string>;
}

/** Anything that dismisses the dialog — a Cancel button, the corner cross. */
export const DialogClose = component<DialogCloseProps>((props) => {
	const dialog = inject(DialogContext);
	return html`<button
		type="button"
		data-slot="dialog-close"
		class="${() => cn(read(props.class))}"
		@click="${() => dialog.setOpen(false)}"
	>${slot(props.children)}</button>`;
});

export interface DialogOverlayProps {
	class?: Reactive<string>;
}

/** The backdrop. Rendered by `DialogContent`; exported to compose your own. */
export const DialogOverlay = component<DialogOverlayProps>(
	(props) => html`<div
		data-slot="dialog-overlay"
		class="${() => cn(dialogBackdropClasses, read(props.class))}"
	></div>`,
);

export interface DialogPortalProps {
	children?: Slot;
	/** Where to mount. Defaults to `document.body`. */
	container?: () => Element | null;
}

/**
 * Mount children outside the component's own DOM position.
 *
 * `DialogContent` does NOT need it — `Dialog` portals the whole overlay
 * through `modalSurface`, which also owns the trap and the scroll lock. It is
 * exported because upstream exports it, and it does here what its name says
 * rather than standing in as a passthrough.
 */
export const DialogPortal = component<DialogPortalProps>((props) => {
	const mounted = portal(html`${slot(props.children)}`, {
		container: props.container,
	});
	mounted.host.setAttribute("data-slot", "dialog-portal");
	onUnmount(() => mounted.close());
	return html``;
});

export interface DialogContentProps {
	children?: Parts;
	/** The corner cross. */
	showCloseButton?: boolean;
	/** A click outside closes. `false` for a decision that must be made. */
	dismissOnOutside?: boolean;
	/** Escape closes. `false` for the same reason. */
	dismissOnEscape?: boolean;
	class?: Reactive<string>;
}

/**
 * The panel.
 *
 * Renders nothing where it is written: the dialog portals its overlay out of
 * the tree when it opens. Its children are built HERE, during setup, so the
 * parts inside see the context and register before the surface is wired.
 */
export const DialogContent = component<DialogContentProps>((props) => {
	const dialog = inject(DialogContext);
	const body = props.children?.();
	dialog.register({
		body,
		showCloseButton: props.showCloseButton ?? true,
		dismissOnOutside: props.dismissOnOutside ?? true,
		dismissOnEscape: props.dismissOnEscape ?? true,
		class: props.class,
	});
	return html``;
});

export interface DialogSectionProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const DialogHeader = component<DialogSectionProps>(
	(props) => html`<div
		data-slot="dialog-header"
		class="${() => cn("flex flex-col gap-2 text-center sm:text-left", read(props.class))}"
	>${slot(props.children)}</div>`,
);

export interface DialogFooterProps extends DialogSectionProps {
	/** Append a "Close" button after the children, as upstream can. */
	showCloseButton?: boolean;
}

export const DialogFooter = component<DialogFooterProps>((props) => {
	const dialog = inject(DialogContext);
	const trailing =
		props.showCloseButton === true
			? html`<button
					type="button"
					data-slot="dialog-close"
					@click="${() => dialog.setOpen(false)}"
				>${Button({ variant: "outline", children: "Close" })}</button>`
			: null;
	return html`<div
		data-slot="dialog-footer"
		class="${() => cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", read(props.class))}"
	>${slot(props.children)}${trailing}</div>`;
});

export interface DialogTitleProps {
	children?: Slot;
	/** Keep it for screen readers but out of the layout. */
	srOnly?: boolean;
	class?: Reactive<string>;
}

export const DialogTitle = component<DialogTitleProps>((props) => {
	const dialog = inject(DialogContext);
	dialog.declareTitle();
	return html`<h2
		id="${dialog.titleId}"
		data-slot="dialog-title"
		class="${() =>
			cn(
				"text-lg leading-none font-semibold",
				props.srOnly === true ? "sr-only" : "",
				read(props.class),
			)}"
	>${slot(props.children)}</h2>`;
});

export const DialogDescription = component<DialogSectionProps>((props) => {
	const dialog = inject(DialogContext);
	dialog.declareDescription();
	return html`<p
		id="${dialog.descriptionId}"
		data-slot="dialog-description"
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
				data-slot="dialog-close"
				class="${closeButtonClasses}"
				@click="${() => ids.close()}"
			>${XIcon({ class: "size-4" })}<span class="sr-only">Close</span></button>`
		: null;
	return html`<div data-slot="dialog-portal" class="${cn("fixed inset-0 z-50", fadeInOut)}">
		<div data-slot="dialog-overlay" class="${dialogBackdropClasses}"></div>
		<div
			data-slot="dialog-content"
			id="${ids.panelId}"
			role="dialog"
			aria-modal="true"
			aria-labelledby="${ids.titleId}"
			aria-describedby="${ids.descriptionId}"
			tabindex="-1"
			class="${cn(dialogPanelClasses, zoomInOut, read(registered.class))}"
		>${registered.body}${corner}</div>
	</div>`;
}

/** A dialog driven purely by a signal, with no trigger of its own. */
export function useDialog(initial = false): {
	open: () => boolean;
	show(): void;
	hide(): void;
} {
	const open = signal(initial);
	return {
		open: () => open(),
		show: () => open(true),
		hide: () => open(false),
	};
}
