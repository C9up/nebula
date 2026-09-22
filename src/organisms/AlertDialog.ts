/**
 * AlertDialog — a modal that interrupts to ask a question.
 *
 *   AlertDialog({ children: () => html`
 *     ${AlertDialogTrigger({ children: "Delete" })}
 *     ${AlertDialogContent({ children: () => html`
 *       ${AlertDialogHeader({ children: html`
 *         ${AlertDialogTitle({ children: "Delete this?" })}
 *         ${AlertDialogDescription({ children: "It cannot be undone." })}
 *       ` })}
 *       ${AlertDialogFooter({ children: html`
 *         ${AlertDialogCancel({ children: "Cancel" })}
 *         ${AlertDialogAction({ children: "Delete", variant: "destructive" })}
 *       ` })}
 *     ` })}
 *   ` })
 *
 * Everything that distinguishes it from a Dialog is about refusing to let the
 * question be dismissed by accident:
 *
 * - `role="alertdialog"`, which tells a screen reader this interrupts.
 * - No outside-click dismissal. A decision has to be made, and clicking past
 *   it is not one.
 * - Focus lands on the CANCEL button, not the confirming action. The safe
 *   choice is the one a hurried Enter should hit.
 *
 * Escape still closes, and it cancels rather than confirms — it is the
 * keyboard spelling of the same safe way out.
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
import { type ButtonVariants, buttonVariants } from "../atoms/Button.js";
import type { Child, Parts, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { fadeInOut, zoomInOut } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";
import { modalSurface } from "../primitives/modalSurface.js";
import { portal } from "../primitives/portal.js";
import { dialogBackdropClasses } from "./Dialog.js";

const panelClasses =
	"group/alert-dialog-content bg-background fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border p-6 shadow-lg duration-200 outline-none data-[size=sm]:max-w-xs sm:max-w-lg";

interface RegisteredContent {
	readonly body: Child;
	readonly size: "default" | "sm";
	readonly class?: Reactive<string>;
}

interface AlertDialogApi {
	readonly triggerId: string;
	readonly panelId: string;
	readonly titleId: string;
	readonly descriptionId: string;
	readonly cancelId: string;
	readonly open: () => boolean;
	setOpen(next: boolean): void;
	confirm(): void;
	cancel(): void;
	declareTitle(): void;
	declareDescription(): void;
	register(content: RegisteredContent): void;
}

const AlertDialogContext = createContext<AlertDialogApi>("AlertDialog");

export interface AlertDialogProps {
	open?: Reactive<boolean>;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	onConfirm?: () => void;
	onCancel?: () => void;
	children?: Parts;
}

export const AlertDialog = component<AlertDialogProps>((props) => {
	const triggerId = uid("alert-dialog-trigger");
	const panelId = uid("alert-dialog-panel");
	const titleId = uid("alert-dialog-title");
	const descriptionId = uid("alert-dialog-description");
	const cancelId = uid("alert-dialog-cancel");
	let hasTitle = false;
	let hasDescription = false;
	let content: RegisteredContent | undefined;

	const state = controllable<boolean>({
		value: props.open,
		initial: props.defaultOpen ?? false,
		onChange: props.onOpenChange,
	});

	function cancel(): void {
		props.onCancel?.();
		state.set(false);
	}

	function confirm(): void {
		props.onConfirm?.();
		state.set(false);
	}

	provide<AlertDialogApi>(AlertDialogContext, {
		triggerId,
		panelId,
		titleId,
		descriptionId,
		cancelId,
		open: () => state.current(),
		setOpen: (next) => state.set(next),
		confirm,
		cancel,
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
				"nebula: an AlertDialog has no AlertDialogTitle. It will be announced only as “alertdialog”.",
			);
		}
		modalSurface({
			open: () => state.current(),
			// Escape cancels rather than confirms: the keyboard spelling of the
			// safe way out.
			onClose: cancel,
			panel: (root) => root.querySelector(`#${CSS.escape(panelId)}`),
			initialFocus: (panel) => panel.querySelector(`#${CSS.escape(cancelId)}`),
			returnFocus: () => document.getElementById(triggerId),
			dismissOnOutside: false,
			content: () =>
				renderSurface(registered, {
					panelId,
					titleId: hasTitle ? titleId : undefined,
					descriptionId: hasDescription ? descriptionId : undefined,
				}),
		});
	}

	return html`${parts}`;
});

export interface AlertDialogTriggerProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const AlertDialogTrigger = component<AlertDialogTriggerProps>(
	(props) => {
		const dialog = inject(AlertDialogContext);
		return html`<button
			type="button"
			data-slot="alert-dialog-trigger"
			id="${dialog.triggerId}"
			aria-haspopup="dialog"
			aria-expanded="${() => (dialog.open() ? "true" : "false")}"
			data-state="${() => (dialog.open() ? "open" : "closed")}"
			class="${() => cn(read(props.class))}"
			@click="${() => dialog.setOpen(true)}"
		>${slot(props.children)}</button>`;
	},
);

export interface AlertDialogContentProps {
	children?: Parts;
	size?: "default" | "sm";
	class?: Reactive<string>;
}

export const AlertDialogContent = component<AlertDialogContentProps>(
	(props) => {
		const dialog = inject(AlertDialogContext);
		dialog.register({
			body: props.children?.(),
			size: props.size ?? "default",
			class: props.class,
		});
		return html``;
	},
);

export interface AlertDialogSectionProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const AlertDialogOverlay = component<AlertDialogSectionProps>(
	(props) => html`<div
		data-slot="alert-dialog-overlay"
		class="${() => cn(dialogBackdropClasses, read(props.class))}"
	></div>`,
);

export interface AlertDialogPortalProps {
	children?: Slot;
	container?: () => Element | null;
}

/**
 * Mount children outside the component's own DOM position.
 *
 * `AlertDialogContent` does not need it — the dialog portals its whole overlay
 * through `modalSurface`, which also owns the trap and the scroll lock. It is
 * exported because upstream exports it, doing here what its name says rather
 * than standing in as a passthrough.
 */
export const AlertDialogPortal = component<AlertDialogPortalProps>((props) => {
	const mounted = portal(html`${slot(props.children)}`, {
		container: props.container,
	});
	mounted.host.setAttribute("data-slot", "alert-dialog-portal");
	onUnmount(() => mounted.close());
	return html``;
});

export const AlertDialogHeader = component<AlertDialogSectionProps>(
	(props) => html`<div
		data-slot="alert-dialog-header"
		class="${() =>
			cn(
				"grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-6 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left",
				read(props.class),
			)}"
	>${slot(props.children)}</div>`,
);

export const AlertDialogFooter = component<AlertDialogSectionProps>(
	(props) => html`<div
		data-slot="alert-dialog-footer"
		class="${() =>
			cn(
				"flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
				read(props.class),
			)}"
	>${slot(props.children)}</div>`,
);

/** An icon block above the title — a warning glyph, a product mark. */
export const AlertDialogMedia = component<AlertDialogSectionProps>(
	(props) => html`<div
		data-slot="alert-dialog-media"
		class="${() =>
			cn(
				"bg-muted mb-2 inline-flex size-16 items-center justify-center rounded-md sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-8",
				read(props.class),
			)}"
	>${slot(props.children)}</div>`,
);

export const AlertDialogTitle = component<AlertDialogSectionProps>((props) => {
	const dialog = inject(AlertDialogContext);
	dialog.declareTitle();
	return html`<h2
		id="${dialog.titleId}"
		data-slot="alert-dialog-title"
		class="${() =>
			cn(
				"text-lg font-semibold sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
				read(props.class),
			)}"
	>${slot(props.children)}</h2>`;
});

export const AlertDialogDescription = component<AlertDialogSectionProps>(
	(props) => {
		const dialog = inject(AlertDialogContext);
		dialog.declareDescription();
		return html`<p
			id="${dialog.descriptionId}"
			data-slot="alert-dialog-description"
			class="${() => cn("text-muted-foreground text-sm", read(props.class))}"
		>${slot(props.children)}</p>`;
	},
);

export interface AlertDialogButtonProps {
	children?: Slot;
	variant?: ButtonVariants["variant"];
	size?: ButtonVariants["size"];
	class?: Reactive<string>;
}

/** The confirming action. */
export const AlertDialogAction = component<AlertDialogButtonProps>((props) => {
	const dialog = inject(AlertDialogContext);
	return html`<button
		type="button"
		data-slot="alert-dialog-action"
		class="${() =>
			cn(
				buttonVariants({
					variant: props.variant ?? "default",
					size: props.size ?? "default",
				}),
				read(props.class),
			)}"
		@click="${() => dialog.confirm()}"
	>${slot(props.children)}</button>`;
});

/**
 * The way out, and where focus lands.
 *
 * The safe choice is the one a hurried Enter should hit, which is why the
 * surface focuses this rather than the action beside it.
 */
export const AlertDialogCancel = component<AlertDialogButtonProps>((props) => {
	const dialog = inject(AlertDialogContext);
	return html`<button
		type="button"
		data-slot="alert-dialog-cancel"
		id="${dialog.cancelId}"
		class="${() =>
			cn(
				buttonVariants({
					variant: props.variant ?? "outline",
					size: props.size ?? "default",
				}),
				read(props.class),
			)}"
		@click="${() => dialog.cancel()}"
	>${slot(props.children)}</button>`;
});

interface SurfaceIds {
	readonly panelId: string;
	readonly titleId: string | undefined;
	readonly descriptionId: string | undefined;
}

function renderSurface(
	registered: RegisteredContent,
	ids: SurfaceIds,
): TemplateResult {
	return html`<div data-slot="alert-dialog-portal" class="${cn("fixed inset-0 z-50", fadeInOut)}">
		<div data-slot="alert-dialog-overlay" class="${dialogBackdropClasses}"></div>
		<div
			data-slot="alert-dialog-content"
			data-size="${registered.size}"
			id="${ids.panelId}"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="${ids.titleId}"
			aria-describedby="${ids.descriptionId}"
			tabindex="-1"
			class="${cn(panelClasses, zoomInOut, read(registered.class))}"
		>${registered.body}</div>
	</div>`;
}
