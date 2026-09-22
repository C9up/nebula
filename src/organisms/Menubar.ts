/**
 * Menubar — the application menu bar.
 *
 *   Menubar({ children: () => html`
 *     ${MenubarMenu({ children: () => html`
 *       ${MenubarTrigger({ children: "File" })}
 *       ${MenubarContent({ children: () => html`
 *         ${MenubarItem({ children: "New", onSelect: create })}
 *       ` })}
 *     ` })}
 *   ` })
 *
 * One surface for the whole bar, not one per menu: only one menu is ever open,
 * and moving between them is a change of anchor and contents rather than a
 * close and an open. That is what makes left/right feel like walking a bar
 * instead of dismissing and summoning.
 *
 * Each `MenubarMenu` claims an index as it is built, which is the order the
 * arrows walk. The rows themselves come from `createMenuParts`, so a menu in
 * the bar and a dropdown menu cannot drift apart.
 */

import {
	component,
	createContext,
	html,
	inject,
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

const triggerClasses =
	"focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex items-center rounded-sm px-2 py-1 text-sm font-medium outline-hidden select-none disabled:pointer-events-none disabled:opacity-50";

interface MenuRegistration {
	readonly triggerId: string;
	disabled: boolean;
	body: Child;
	panelClass: Reactive<string> | undefined;
}

interface MenubarApi extends MenuOwner {
	readonly contentId: string;
	/** Claim the next index. Registration order is the order arrows walk. */
	claim(triggerId: string): number;
	describe(index: number, patch: Partial<MenuRegistration>): void;
	readonly openIndex: () => number;
	openAt(index: number, withKeyboard: boolean): void;
	close(): void;
	focusTrigger(index: number): void;
}

const MenubarContext = createContext<MenubarApi>("Menubar");

interface MenubarMenuApi {
	readonly index: number;
	readonly triggerId: string;
}

const MenubarMenuContext = createContext<MenubarMenuApi>("MenubarMenu");

export interface MenubarProps {
	class?: Reactive<string>;
	children?: Parts;
}

export const Menubar = component<MenubarProps>((props) => {
	const contentId = uid("menubar-content");
	const menus: MenuRegistration[] = [];
	const openIndex = signal(-1);

	let unwire: (() => void) | null = null;
	let focusFirstOnOpen = false;

	function close(): void {
		openIndex(-1);
	}

	function openAt(index: number, withKeyboard: boolean): void {
		if (menus[index]?.disabled === true) return;
		focusFirstOnOpen = withKeyboard;
		openIndex(index);
	}

	function focusTrigger(index: number): void {
		const count = menus.length;
		if (count === 0) return;
		const entry = menus[(index + count) % count];
		if (entry === undefined) return;
		document.getElementById(entry.triggerId)?.focus({ preventScroll: true });
	}

	function move(delta: number): void {
		const count = menus.length;
		if (count === 0) return;
		const from = openIndex();
		if (from === -1) return;
		openAt((from + delta + count) % count, true);
	}

	function onPanelKeyDown(event: KeyboardEvent): void {
		if (event.key === "ArrowRight") {
			event.preventDefault();
			move(1);
		} else if (event.key === "ArrowLeft") {
			event.preventDefault();
			move(-1);
		}
	}

	provide<MenubarApi>(MenubarContext, {
		contentId,
		claim(triggerId) {
			menus.push({
				triggerId,
				disabled: false,
				body: null,
				panelClass: undefined,
			});
			return menus.length - 1;
		},
		describe(index, patch) {
			const entry = menus[index];
			if (entry === undefined) return;
			Object.assign(entry, patch);
		},
		openIndex: () => openIndex(),
		openAt,
		close,
		focusTrigger,
		closeAll: close,
	});

	const parts = props.children?.();

	floatingSurface({
		anchor: () => {
			const entry = menus[openIndex()];
			return entry === undefined
				? null
				: document.getElementById(entry.triggerId);
		},
		open: () => openIndex() !== -1,
		onClose: close,
		placement: "bottom-start",
		offset: 4,
		content: () => renderPanel(menus[openIndex()], contentId),
		onOpened: (panel) => {
			const enterItems = focusFirstOnOpen;
			focusFirstOnOpen = false;
			unwire = wireMenu(panel, {
				onCloseAll: close,
				autoFocusFirst: enterItems,
			});
			// Only when no item took focus. Focusing the panel unconditionally
			// steals focus back from the item `autoFocusFirst` just landed on, and
			// opening a menu with the keyboard would never reach its first entry.
			if (!enterItems) panel.focus({ preventScroll: true });
			// Left/right walk the bar from inside the open panel. `menu.js` claims
			// ArrowLeft for closing a submenu and stops propagation when it does,
			// so this only fires at the top level.
			panel.addEventListener("keydown", onPanelKeyDown);
		},
		onClosed: () => {
			unwire?.();
			unwire = null;
		},
	});

	return html`<div
		data-slot="menubar"
		role="menubar"
		class="${() =>
			cn(
				"bg-background flex h-9 items-center gap-1 rounded-md border p-1 shadow-xs",
				read(props.class),
			)}"
	>${parts}</div>`;
});

export interface MenubarMenuProps {
	children?: Parts;
}

/**
 * One menu in the bar.
 *
 * Claims its index as it is built, and provides it to the trigger and the
 * content inside — neither of which then has to be told which menu it belongs
 * to.
 */
export const MenubarMenu = component<MenubarMenuProps>((props) => {
	const bar = inject(MenubarContext);
	const triggerId = uid("menubar-trigger");
	const index = bar.claim(triggerId);

	provide<MenubarMenuApi>(MenubarMenuContext, { index, triggerId });

	return html`${props.children?.()}`;
});

export interface MenubarTriggerProps {
	children?: Slot;
	disabled?: boolean;
	class?: Reactive<string>;
}

export const MenubarTrigger = component<MenubarTriggerProps>((props) => {
	const bar = inject(MenubarContext);
	const menu = inject(MenubarMenuContext);
	if (props.disabled === true) {
		bar.describe(menu.index, { disabled: true });
	}
	const open = (): boolean => bar.openIndex() === menu.index;

	function onKeyDown(event: KeyboardEvent): void {
		if (
			event.key === "ArrowDown" ||
			event.key === "Enter" ||
			event.key === " "
		) {
			event.preventDefault();
			bar.openAt(menu.index, true);
		} else if (event.key === "ArrowRight") {
			event.preventDefault();
			bar.focusTrigger(menu.index + 1);
		} else if (event.key === "ArrowLeft") {
			event.preventDefault();
			bar.focusTrigger(menu.index - 1);
		}
	}

	return html`<button
		type="button"
		data-slot="menubar-trigger"
		id="${menu.triggerId}"
		role="menuitem"
		aria-haspopup="menu"
		aria-expanded="${() => (open() ? "true" : "false")}"
		aria-controls="${() => (open() ? bar.contentId : undefined)}"
		data-state="${() => (open() ? "open" : "closed")}"
		?disabled="${props.disabled === true}"
		class="${() => cn(triggerClasses, read(props.class))}"
		@click="${() => (open() ? bar.close() : bar.openAt(menu.index, false))}"
		@pointerenter="${() => {
			// Hover switches menus only while one is already open — otherwise the
			// bar would spring menus at a pointer merely passing over it.
			if (bar.openIndex() !== -1) bar.openAt(menu.index, false);
		}}"
		@keydown="${onKeyDown}"
	>${slot(props.children)}</button>`;
});

export interface MenubarContentProps {
	children?: Parts;
	class?: Reactive<string>;
}

export const MenubarContent = component<MenubarContentProps>((props) => {
	const bar = inject(MenubarContext);
	const menu = inject(MenubarMenuContext);
	bar.describe(menu.index, {
		body: props.children?.(),
		panelClass: props.class,
	});
	return html``;
});

const parts = createMenuParts("menubar", MenubarContext);

export const MenubarGroup = parts.Group;
export const MenubarItem = parts.Item;
export const MenubarCheckboxItem = parts.CheckboxItem;
export const MenubarRadioGroup = parts.RadioGroup;
export const MenubarRadioItem = parts.RadioItem;
export const MenubarLabel = parts.Label;
export const MenubarSeparator = parts.Separator;
export const MenubarShortcut = parts.Shortcut;
export const MenubarSub = parts.Sub;
export const MenubarSubTrigger = parts.SubTrigger;
export const MenubarSubContent = parts.SubContent;
export const MenubarPortal = parts.Portal;

export type {
	MenuCheckboxItemProps as MenubarCheckboxItemProps,
	MenuGroupProps as MenubarGroupProps,
	MenuItemProps as MenubarItemProps,
	MenuLabelProps as MenubarLabelProps,
	MenuPortalProps as MenubarPortalProps,
	MenuRadioGroupProps as MenubarRadioGroupProps,
	MenuRadioItemProps as MenubarRadioItemProps,
	MenuSeparatorProps as MenubarSeparatorProps,
	MenuShortcutProps as MenubarShortcutProps,
	MenuSubContentProps as MenubarSubContentProps,
	MenuSubProps as MenubarSubProps,
	MenuSubTriggerProps as MenubarSubTriggerProps,
} from "../primitives/menuParts.js";

function renderPanel(
	entry: MenuRegistration | undefined,
	contentId: string,
): TemplateResult {
	return html`<div
		data-slot="menubar-content"
		id="${contentId}"
		role="menu"
		aria-labelledby="${entry?.triggerId}"
		aria-orientation="vertical"
		tabindex="-1"
		class="${cn(
			menuPanelClasses,
			zoomInOut,
			slideInFromSide,
			read(entry?.panelClass),
		)}"
	>${entry?.body}</div>`;
}
