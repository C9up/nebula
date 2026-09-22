/**
 * DropdownMenu — a menu opened from a button.
 *
 * The keyboard model comes from `wireMenu`: roving focus, type-ahead, arrows,
 * Home/End, Escape and submenu traversal. It works on the RENDERED DOM — the
 * `[data-nebula-item]` rows and their `role` — never on a description of it,
 * which is what lets these parts compose freely and still behave like one
 * menu.
 *
 *   DropdownMenu({ children: () => html`
 *     ${DropdownMenuTrigger({ children: "Open" })}
 *     ${DropdownMenuContent({ children: () => html`
 *       ${DropdownMenuLabel({ children: "Account" })}
 *       ${DropdownMenuItem({ children: "Profile", onSelect: openProfile })}
 *       ${DropdownMenuSeparator({})}
 *       ${DropdownMenuItem({ children: "Delete", variant: "destructive" })}
 *     ` })}
 *   ` })
 *
 * Two behaviours are specific to a button-opened menu:
 *
 * - Opening with the keyboard focuses the first item; opening with the pointer
 *   does not. A keyboard user has no other way in, while pre-highlighting an
 *   item for a mouse user suggests it is about to be chosen.
 * - ArrowDown on the trigger opens the menu *and* enters it, which is the
 *   behaviour of every native menu button and the one users try first.
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
import { menuPanelClasses, wireMenu } from "../primitives/menu.js";
import { createMenuParts, type MenuOwner } from "../primitives/menuParts.js";

interface RegisteredContent {
	readonly body: Child;
	readonly side: Side;
	readonly align: Align;
	readonly sideOffset: number;
	readonly class?: Reactive<string>;
}

interface DropdownMenuApi extends MenuOwner {
	readonly triggerId: string;
	readonly contentId: string;
	readonly open: () => boolean;
	setOpen(next: boolean): void;
	/** Open and land on the first item — the keyboard path. */
	openAndEnter(): void;
	register(content: RegisteredContent): void;
}

const DropdownMenuContext = createContext<DropdownMenuApi>("DropdownMenu");

export interface DropdownMenuProps {
	open?: Reactive<boolean>;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	children?: Parts;
}

export const DropdownMenu = component<DropdownMenuProps>((props) => {
	const triggerId = uid("dropdown-menu-trigger");
	const contentId = uid("dropdown-menu-content");
	let content: RegisteredContent | undefined;

	const state = controllable<boolean>({
		value: props.open,
		initial: props.defaultOpen ?? false,
		onChange: props.onOpenChange,
	});

	// Set by the trigger's key handler just before opening, and consumed by
	// `onOpened`. The panel does not exist yet at the moment of the keypress, so
	// the intent has to survive the gap.
	let enterOnOpen = false;
	let unwire: (() => void) | null = null;

	function close(): void {
		state.set(false);
	}

	provide<DropdownMenuApi>(DropdownMenuContext, {
		triggerId,
		contentId,
		open: () => state.current(),
		setOpen: (next) => state.set(next),
		openAndEnter() {
			enterOnOpen = true;
			state.set(true);
		},
		closeAll: close,
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
			onClose: close,
			placement,
			offset: registered.sideOffset,
			content: () =>
				renderPanel(registered, { id: contentId, labelledBy: triggerId }),
			onOpened: (panel) => {
				const enterItems = enterOnOpen;
				enterOnOpen = false;
				unwire = wireMenu(panel, {
					onCloseAll: close,
					autoFocusFirst: enterItems,
				});
				// The panel takes focus only when no item did — it needs to hold
				// focus so Escape and the arrows reach it rather than the page
				// behind, but focusing it unconditionally steals focus straight back
				// from the item `autoFocusFirst` just landed on, and opening with
				// the keyboard would never reach the first entry.
				if (!enterItems) panel.focus({ preventScroll: true });
			},
			onClosed: () => {
				unwire?.();
				unwire = null;
			},
		});
	}

	return html`${parts}`;
});

export interface DropdownMenuTriggerProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const DropdownMenuTrigger = component<DropdownMenuTriggerProps>(
	(props) => {
		const menu = inject(DropdownMenuContext);
		function onKeyDown(event: KeyboardEvent): void {
			if (
				event.key !== "ArrowDown" &&
				event.key !== "Enter" &&
				event.key !== " "
			) {
				return;
			}
			event.preventDefault();
			menu.openAndEnter();
		}
		return html`<button
			type="button"
			data-slot="dropdown-menu-trigger"
			id="${menu.triggerId}"
			aria-haspopup="menu"
			aria-expanded="${() => (menu.open() ? "true" : "false")}"
			aria-controls="${() => (menu.open() ? menu.contentId : undefined)}"
			data-state="${() => (menu.open() ? "open" : "closed")}"
			class="${() => cn(read(props.class))}"
			@click="${() => menu.setOpen(!menu.open())}"
			@keydown="${onKeyDown}"
		>${slot(props.children)}</button>`;
	},
);

export interface DropdownMenuContentProps {
	children?: Parts;
	side?: Side;
	align?: Align;
	sideOffset?: number;
	class?: Reactive<string>;
}

/**
 * The panel.
 *
 * Renders nothing where it is written — the menu portals it on open — and
 * builds its children HERE, during setup, so every row sees the context.
 */
export const DropdownMenuContent = component<DropdownMenuContentProps>(
	(props) => {
		const menu = inject(DropdownMenuContext);
		const body = props.children?.();
		menu.register({
			body,
			side: props.side ?? "bottom",
			align: props.align ?? "start",
			sideOffset: props.sideOffset ?? 4,
			class: props.class,
		});
		return html``;
	},
);

const parts = createMenuParts("dropdown-menu", DropdownMenuContext);

export const DropdownMenuGroup = parts.Group;
export const DropdownMenuItem = parts.Item;
export const DropdownMenuCheckboxItem = parts.CheckboxItem;
export const DropdownMenuRadioGroup = parts.RadioGroup;
export const DropdownMenuRadioItem = parts.RadioItem;
export const DropdownMenuLabel = parts.Label;
export const DropdownMenuSeparator = parts.Separator;
export const DropdownMenuShortcut = parts.Shortcut;
export const DropdownMenuSub = parts.Sub;
export const DropdownMenuSubTrigger = parts.SubTrigger;
export const DropdownMenuSubContent = parts.SubContent;
/**
 * Mount children outside the component's own DOM position.
 *
 * `DropdownMenuContent` does not need it — the menu portals its own panel —
 * and it is exported because upstream exports it, doing here what its name
 * says rather than standing in as a passthrough.
 */
export const DropdownMenuPortal = parts.Portal;

export type {
	MenuCheckboxItemProps as DropdownMenuCheckboxItemProps,
	MenuGroupProps as DropdownMenuGroupProps,
	MenuItemProps as DropdownMenuItemProps,
	MenuLabelProps as DropdownMenuLabelProps,
	MenuPortalProps as DropdownMenuPortalProps,
	MenuRadioGroupProps as DropdownMenuRadioGroupProps,
	MenuRadioItemProps as DropdownMenuRadioItemProps,
	MenuSeparatorProps as DropdownMenuSeparatorProps,
	MenuShortcutProps as DropdownMenuShortcutProps,
	MenuSubContentProps as DropdownMenuSubContentProps,
	MenuSubProps as DropdownMenuSubProps,
	MenuSubTriggerProps as DropdownMenuSubTriggerProps,
} from "../primitives/menuParts.js";

function renderPanel(
	registered: RegisteredContent,
	ids: { id: string; labelledBy: string },
): TemplateResult {
	return html`<div
		data-slot="dropdown-menu-content"
		id="${ids.id}"
		role="menu"
		aria-labelledby="${ids.labelledBy}"
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
