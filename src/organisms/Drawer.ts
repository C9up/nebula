/**
 * Drawer — a bottom sheet you can swipe away.
 *
 * A Sheet from the bottom edge, plus the one gesture that makes it feel native
 * on a phone: drag the panel down to dismiss it.
 *
 * The drag rules are what separate this from a panel that merely follows the
 * finger:
 *
 * - Downward only. Dragging up would peel the panel off its edge and leave a
 *   gap under it.
 * - Released past a threshold, it closes; short of it, it springs back. A
 *   distance threshold alone punishes a fast flick, so velocity counts too —
 *   a quick short drag dismisses, which is what the gesture means.
 * - The transition is disabled during the drag and restored on release.
 *   Leaving it on makes the panel lag the finger by its own duration, which
 *   reads as a broken gesture rather than a smooth one.
 *
 * The grab handle is decorative. Everything the drag does, the close button,
 * Escape and the backdrop already do — a gesture must never be the only way
 * out of a modal surface.
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
import { fadeInOut, slideFrom } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";
import { modalSurface } from "../primitives/modalSurface.js";
import { dialogBackdropClasses } from "./Dialog.js";

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.5;

const panelClasses =
	"bg-background fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[80vh] touch-none flex-col gap-4 rounded-t-lg border-t shadow-lg outline-none";

interface RegisteredContent {
	readonly body: Child;
	readonly showHandle: boolean;
	readonly disableDrag: boolean;
	readonly class?: Reactive<string>;
}

interface DrawerApi {
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

const DrawerContext = createContext<DrawerApi>("Drawer");

export interface DrawerProps {
	open?: Reactive<boolean>;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	children?: Parts;
}

export const Drawer = component<DrawerProps>((props) => {
	const triggerId = uid("drawer-trigger");
	const panelId = uid("drawer-panel");
	const titleId = uid("drawer-title");
	const descriptionId = uid("drawer-description");
	let hasTitle = false;
	let hasDescription = false;
	let content: RegisteredContent | undefined;

	const state = controllable<boolean>({
		value: props.open,
		initial: props.defaultOpen ?? false,
		onChange: props.onOpenChange,
	});

	/**
	 * Drag to dismiss.
	 *
	 * Distance OR velocity: a slow long drag and a quick flick both mean the
	 * same thing, and requiring distance alone makes a flick feel ignored.
	 * Everything it does, Escape and the backdrop already do — a gesture must
	 * never be the only way out of a modal surface.
	 */
	function onPointerDown(event: PointerEvent): void {
		const panel = document.getElementById(panelId);
		if (panel === null) return;

		const startY = event.clientY;
		const startedAt = performance.now();
		let offset = 0;
		panel.setPointerCapture(event.pointerId);
		panel.style.transition = "none";

		const onMove = (move: PointerEvent): void => {
			offset = Math.max(0, move.clientY - startY);
			panel.style.transform = `translateY(${offset}px)`;
		};

		const onUp = (): void => {
			panel.releasePointerCapture(event.pointerId);
			panel.removeEventListener("pointermove", onMove);
			panel.removeEventListener("pointerup", onUp);
			panel.removeEventListener("pointercancel", onUp);

			// Restore the transition before deciding, so both outcomes animate.
			panel.style.transition = "";
			panel.style.transform = "";
			const velocity = offset / Math.max(1, performance.now() - startedAt);
			if (offset > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
				state.set(false);
			}
		};

		panel.addEventListener("pointermove", onMove);
		panel.addEventListener("pointerup", onUp);
		panel.addEventListener("pointercancel", onUp);
	}

	provide<DrawerApi>(DrawerContext, {
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
				"nebula: a Drawer has no DrawerTitle. It will be announced only as \u201cdialog\u201d.",
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
					onPointerDown: registered.disableDrag ? undefined : onPointerDown,
				}),
		});
	}

	return html`${parts}`;
});

export interface DrawerTriggerProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const DrawerTrigger = component<DrawerTriggerProps>((props) => {
	const drawer = inject(DrawerContext);
	return html`<button
		type="button"
		data-slot="drawer-trigger"
		id="${drawer.triggerId}"
		aria-haspopup="dialog"
		aria-expanded="${() => (drawer.open() ? "true" : "false")}"
		data-state="${() => (drawer.open() ? "open" : "closed")}"
		class="${() => cn(read(props.class))}"
		@click="${() => drawer.setOpen(true)}"
	>${slot(props.children)}</button>`;
});

export interface DrawerCloseProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const DrawerClose = component<DrawerCloseProps>((props) => {
	const drawer = inject(DrawerContext);
	return html`<button
		type="button"
		data-slot="drawer-close"
		class="${() => cn(read(props.class))}"
		@click="${() => drawer.setOpen(false)}"
	>${slot(props.children)}</button>`;
});

export interface DrawerOverlayProps {
	class?: Reactive<string>;
}

export const DrawerOverlay = component<DrawerOverlayProps>(
	(props) => html`<div
		data-slot="drawer-overlay"
		class="${() => cn(dialogBackdropClasses, read(props.class))}"
	></div>`,
);

export interface DrawerContentProps {
	children?: Parts;
	/** The grab bar. Decorative — see `onPointerDown`. */
	showHandle?: boolean;
	/** Turn off drag-to-dismiss — for a drawer holding a scrollable list. */
	disableDrag?: boolean;
	class?: Reactive<string>;
}

export const DrawerContent = component<DrawerContentProps>((props) => {
	const drawer = inject(DrawerContext);
	drawer.register({
		body: props.children?.(),
		showHandle: props.showHandle !== false,
		disableDrag: props.disableDrag === true,
		class: props.class,
	});
	return html``;
});

export interface DrawerSectionProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const DrawerHeader = component<DrawerSectionProps>(
	(props) => html`<div
		data-slot="drawer-header"
		class="${() => cn("flex flex-col gap-1.5 p-4", read(props.class))}"
	>${slot(props.children)}</div>`,
);

export const DrawerFooter = component<DrawerSectionProps>(
	(props) => html`<div
		data-slot="drawer-footer"
		class="${() => cn("mt-auto flex flex-col gap-2 p-4", read(props.class))}"
	>${slot(props.children)}</div>`,
);

export const DrawerTitle = component<DrawerSectionProps>((props) => {
	const drawer = inject(DrawerContext);
	drawer.declareTitle();
	return html`<h2
		id="${drawer.titleId}"
		data-slot="drawer-title"
		class="${() => cn("text-foreground font-semibold", read(props.class))}"
	>${slot(props.children)}</h2>`;
});

export const DrawerDescription = component<DrawerSectionProps>((props) => {
	const drawer = inject(DrawerContext);
	drawer.declareDescription();
	return html`<p
		id="${drawer.descriptionId}"
		data-slot="drawer-description"
		class="${() => cn("text-muted-foreground text-sm", read(props.class))}"
	>${slot(props.children)}</p>`;
});

interface SurfaceIds {
	readonly panelId: string;
	readonly titleId: string | undefined;
	readonly descriptionId: string | undefined;
	readonly onPointerDown: ((event: PointerEvent) => void) | undefined;
}

function renderSurface(
	registered: RegisteredContent,
	ids: SurfaceIds,
): TemplateResult {
	const handle = registered.showHandle
		? html`<div
				data-slot="drawer-handle"
				aria-hidden="true"
				class="bg-muted mx-auto mt-4 h-1.5 w-12 shrink-0 rounded-full"
			></div>`
		: null;
	return html`<div data-slot="drawer-portal" class="${cn("fixed inset-0 z-50", fadeInOut)}">
		<div data-slot="drawer-overlay" class="${dialogBackdropClasses}"></div>
		<div
			data-slot="drawer-content"
			id="${ids.panelId}"
			role="dialog"
			aria-modal="true"
			aria-labelledby="${ids.titleId}"
			aria-describedby="${ids.descriptionId}"
			tabindex="-1"
			class="${cn(panelClasses, slideFrom("bottom"), read(registered.class))}"
			@pointerdown="${ids.onPointerDown}"
		>${handle}${registered.body}</div>
	</div>`;
}
