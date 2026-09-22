/**
 * ContextMenu — the menu a right-click opens.
 *
 *   ContextMenu({ children: () => html`
 *     ${ContextMenuTrigger({ children: "Right-click me" })}
 *     ${ContextMenuContent({ children: () => html`
 *       ${ContextMenuItem({ children: "Cut", onSelect: cut })}
 *     ` })}
 *   ` })
 *
 * The rows come from `createMenuParts`, so a context menu and a dropdown menu
 * cannot drift apart. What is specific here is the anchor: a context menu
 * opens at the POINTER, not against a control, so a zero-size element is moved
 * to the click coordinates and the surface is positioned against that.
 *
 * Touch gets a long press, because there is no right button. It is cancelled
 * by movement, so a scroll that starts on the region does not open a menu
 * under the thumb.
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
import { floatingSurface } from "../primitives/floatingSurface.js";
import { menuPanelClasses, wireMenu } from "../primitives/menu.js";
import { createMenuParts, type MenuOwner } from "../primitives/menuParts.js";

const LONG_PRESS_MS = 500;

interface RegisteredContent {
	readonly body: Child;
	readonly class?: Reactive<string>;
}

interface ContextMenuApi extends MenuOwner {
	readonly anchorId: string;
	readonly open: () => boolean;
	openAt(x: number, y: number): void;
	startLongPress(event: PointerEvent): void;
	cancelLongPress(): void;
	register(content: RegisteredContent): void;
}

const ContextMenuContext = createContext<ContextMenuApi>("ContextMenu");

export interface ContextMenuProps {
	onOpenChange?: (open: boolean) => void;
	children?: Parts;
}

export const ContextMenu = component<ContextMenuProps>((props) => {
	const anchorId = uid("context-menu-anchor");
	const contentId = uid("context-menu-content");
	const open = signal(false);
	let content: RegisteredContent | undefined;
	let unwire: (() => void) | null = null;
	let pressTimer: ReturnType<typeof setTimeout> | undefined;

	function setOpen(next: boolean): void {
		open(next);
		props.onOpenChange?.(next);
	}

	function cancelLongPress(): void {
		if (pressTimer !== undefined) clearTimeout(pressTimer);
		pressTimer = undefined;
	}

	function openAt(x: number, y: number): void {
		const anchor = document.getElementById(anchorId);
		if (anchor !== null) {
			anchor.style.left = `${x}px`;
			anchor.style.top = `${y}px`;
		}
		setOpen(true);
	}

	onUnmount(cancelLongPress);

	provide<ContextMenuApi>(ContextMenuContext, {
		anchorId,
		open: () => open(),
		openAt,
		startLongPress(event) {
			if (event.pointerType !== "touch") return;
			cancelLongPress();
			pressTimer = setTimeout(
				() => openAt(event.clientX, event.clientY),
				LONG_PRESS_MS,
			);
		},
		cancelLongPress,
		closeAll: () => setOpen(false),
		register(registered) {
			content = registered;
		},
	});

	const parts = props.children?.();

	if (content !== undefined) {
		const registered = content;
		floatingSurface({
			anchor: () => document.getElementById(anchorId),
			open: () => open(),
			onClose: () => setOpen(false),
			placement: "bottom-start",
			offset: 2,
			content: () => renderPanel(registered, contentId),
			onOpened: (panel) => {
				unwire = wireMenu(panel, { onCloseAll: () => setOpen(false) });
				panel.focus({ preventScroll: true });
			},
			onClosed: () => {
				unwire?.();
				unwire = null;
			},
		});
	}

	return html`${parts}`;
});

export interface ContextMenuTriggerProps {
	children?: Slot;
	class?: Reactive<string>;
}

/** The region that answers to right-click, and the anchor the menu opens at. */
export const ContextMenuTrigger = component<ContextMenuTriggerProps>(
	(props) => {
		const menu = inject(ContextMenuContext);
		function onContextMenu(event: MouseEvent): void {
			event.preventDefault();
			menu.openAt(event.clientX, event.clientY);
		}
		return html`<div
			data-slot="context-menu-trigger"
			data-state="${() => (menu.open() ? "open" : "closed")}"
			class="${() => cn(read(props.class))}"
			@contextmenu="${onContextMenu}"
			@pointerdown="${(event: PointerEvent) => menu.startLongPress(event)}"
			@pointerup="${() => menu.cancelLongPress()}"
			@pointermove="${() => menu.cancelLongPress()}"
			@pointercancel="${() => menu.cancelLongPress()}"
		>${slot(props.children)}<span
				id="${menu.anchorId}"
				aria-hidden="true"
				class="pointer-events-none fixed size-0"
			></span></div>`;
	},
);

export interface ContextMenuContentProps {
	children?: Parts;
	class?: Reactive<string>;
}

export const ContextMenuContent = component<ContextMenuContentProps>(
	(props) => {
		const menu = inject(ContextMenuContext);
		menu.register({ body: props.children?.(), class: props.class });
		return html``;
	},
);

const parts = createMenuParts("context-menu", ContextMenuContext);

export const ContextMenuGroup = parts.Group;
export const ContextMenuItem = parts.Item;
export const ContextMenuCheckboxItem = parts.CheckboxItem;
export const ContextMenuRadioGroup = parts.RadioGroup;
export const ContextMenuRadioItem = parts.RadioItem;
export const ContextMenuLabel = parts.Label;
export const ContextMenuSeparator = parts.Separator;
export const ContextMenuShortcut = parts.Shortcut;
export const ContextMenuSub = parts.Sub;
export const ContextMenuSubTrigger = parts.SubTrigger;
export const ContextMenuSubContent = parts.SubContent;
export const ContextMenuPortal = parts.Portal;

export type {
	MenuCheckboxItemProps as ContextMenuCheckboxItemProps,
	MenuGroupProps as ContextMenuGroupProps,
	MenuItemProps as ContextMenuItemProps,
	MenuLabelProps as ContextMenuLabelProps,
	MenuPortalProps as ContextMenuPortalProps,
	MenuRadioGroupProps as ContextMenuRadioGroupProps,
	MenuRadioItemProps as ContextMenuRadioItemProps,
	MenuSeparatorProps as ContextMenuSeparatorProps,
	MenuShortcutProps as ContextMenuShortcutProps,
	MenuSubContentProps as ContextMenuSubContentProps,
	MenuSubProps as ContextMenuSubProps,
	MenuSubTriggerProps as ContextMenuSubTriggerProps,
} from "../primitives/menuParts.js";

function renderPanel(
	registered: RegisteredContent,
	contentId: string,
): TemplateResult {
	return html`<div
		data-slot="context-menu-content"
		id="${contentId}"
		role="menu"
		aria-orientation="vertical"
		tabindex="-1"
		class="${cn(
			menuPanelClasses,
			zoomInOut,
			slideInFromSide,
			read(registered.class),
		)}"
	>${registered.body}</div>`;
}
