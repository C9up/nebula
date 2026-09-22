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
import { CheckIcon, ChevronRightIcon, CircleIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { slideInFromSide, zoomInOut } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";
import type { Align, Placement, Side } from "../primitives/floating.js";
import { floatingSurface } from "../primitives/floatingSurface.js";
import {
	menuCheckItemClasses,
	menuIndicatorClasses,
	menuItemClasses,
	menuLabelClasses,
	menuPanelClasses,
	menuSeparatorClasses,
	menuShortcutClasses,
	menuSubPanelClasses,
	menuSubTriggerClasses,
	registerSubmenu,
	wireMenu,
} from "../primitives/menu.js";
import { portal } from "../primitives/portal.js";

interface RegisteredContent {
	readonly body: Child;
	readonly side: Side;
	readonly align: Align;
	readonly sideOffset: number;
	readonly class?: Reactive<string>;
}

interface DropdownMenuApi {
	readonly triggerId: string;
	readonly contentId: string;
	readonly open: () => boolean;
	setOpen(next: boolean): void;
	/** Open and land on the first item — the keyboard path. */
	openAndEnter(): void;
	/** An item was chosen: the whole stack closes. */
	closeAll(): void;
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

export interface DropdownMenuPortalProps {
	children?: Slot;
	container?: () => Element | null;
}

/**
 * Mount children outside the component's own DOM position.
 *
 * `DropdownMenuContent` does not need it — the menu portals its own panel —
 * and it is exported because upstream exports it, doing here what its name
 * says rather than standing in as a passthrough.
 */
export const DropdownMenuPortal = component<DropdownMenuPortalProps>(
	(props) => {
		const mounted = portal(html`${slot(props.children)}`, {
			container: props.container,
		});
		mounted.host.setAttribute("data-slot", "dropdown-menu-portal");
		return html``;
	},
);

export interface DropdownMenuGroupProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const DropdownMenuGroup = component<DropdownMenuGroupProps>(
	(props) => html`<div
		data-slot="dropdown-menu-group"
		role="group"
		class="${() => cn(read(props.class))}"
	>${slot(props.children)}</div>`,
);

export interface DropdownMenuItemProps {
	children?: Slot;
	/** Indent to line up with the checkbox and radio rows. */
	inset?: boolean;
	variant?: "default" | "destructive";
	disabled?: boolean;
	onSelect?: () => void;
	class?: Reactive<string>;
}

export const DropdownMenuItem = component<DropdownMenuItemProps>((props) => {
	const menu = inject(DropdownMenuContext);
	function activate(): void {
		if (props.disabled === true) return;
		props.onSelect?.();
		menu.closeAll();
	}
	return html`<div
		data-slot="dropdown-menu-item"
		data-nebula-item
		role="menuitem"
		data-inset="${props.inset === true ? "" : undefined}"
		data-variant="${props.variant ?? "default"}"
		data-disabled="${props.disabled === true ? "" : undefined}"
		aria-disabled="${props.disabled === true ? "true" : undefined}"
		tabindex="-1"
		class="${() => cn(menuItemClasses, read(props.class))}"
		@click="${activate}"
	>${slot(props.children)}</div>`;
});

export interface DropdownMenuCheckboxItemProps {
	children?: Slot;
	checked?: Reactive<boolean>;
	onCheckedChange?: (checked: boolean) => void;
	disabled?: boolean;
	class?: Reactive<string>;
}

export const DropdownMenuCheckboxItem =
	component<DropdownMenuCheckboxItemProps>((props) => {
		const menu = inject(DropdownMenuContext);
		const checked = (): boolean => read(props.checked) === true;
		function activate(): void {
			if (props.disabled === true) return;
			props.onCheckedChange?.(!checked());
			menu.closeAll();
		}
		return html`<div
			data-slot="dropdown-menu-checkbox-item"
			data-nebula-item
			role="menuitemcheckbox"
			aria-checked="${() => (checked() ? "true" : "false")}"
			data-disabled="${props.disabled === true ? "" : undefined}"
			aria-disabled="${props.disabled === true ? "true" : undefined}"
			tabindex="-1"
			class="${() => cn(menuCheckItemClasses, read(props.class))}"
			@click="${activate}"
		><span class="${menuIndicatorClasses}">${() =>
			checked() ? CheckIcon({ class: "size-4" }) : null}</span>${slot(
			props.children,
		)}</div>`;
	});

interface RadioGroupApi {
	readonly value: () => string | undefined;
	select(value: string): void;
}

const RadioGroupContext = createContext<RadioGroupApi>(
	"DropdownMenuRadioGroup",
);

export interface DropdownMenuRadioGroupProps {
	children?: Parts;
	value?: Reactive<string | undefined>;
	onValueChange?: (value: string) => void;
	class?: Reactive<string>;
}

/**
 * Groups radio rows around one value.
 *
 * Takes `Parts`, not `Slot`: its rows read the group's value through context,
 * so they have to be built inside its setup.
 */
export const DropdownMenuRadioGroup = component<DropdownMenuRadioGroupProps>(
	(props) => {
		const menu = inject(DropdownMenuContext);
		provide<RadioGroupApi>(RadioGroupContext, {
			value: () => read(props.value),
			select(next) {
				props.onValueChange?.(next);
				menu.closeAll();
			},
		});
		const rows = props.children?.();
		return html`<div
			data-slot="dropdown-menu-radio-group"
			role="group"
			class="${() => cn(read(props.class))}"
		>${rows}</div>`;
	},
);

export interface DropdownMenuRadioItemProps {
	children?: Slot;
	value: string;
	disabled?: boolean;
	class?: Reactive<string>;
}

export const DropdownMenuRadioItem = component<DropdownMenuRadioItemProps>(
	(props) => {
		const group = inject(RadioGroupContext);
		const selected = (): boolean => group.value() === props.value;
		function activate(): void {
			if (props.disabled === true) return;
			group.select(props.value);
		}
		return html`<div
			data-slot="dropdown-menu-radio-item"
			data-nebula-item
			role="menuitemradio"
			aria-checked="${() => (selected() ? "true" : "false")}"
			data-disabled="${props.disabled === true ? "" : undefined}"
			aria-disabled="${props.disabled === true ? "true" : undefined}"
			tabindex="-1"
			class="${() => cn(menuCheckItemClasses, read(props.class))}"
			@click="${activate}"
		><span class="${menuIndicatorClasses}">${() =>
			selected()
				? CircleIcon({ class: "size-2 fill-current" })
				: null}</span>${slot(props.children)}</div>`;
	},
);

export interface DropdownMenuLabelProps {
	children?: Slot;
	inset?: boolean;
	class?: Reactive<string>;
}

export const DropdownMenuLabel = component<DropdownMenuLabelProps>(
	(props) => html`<div
		data-slot="dropdown-menu-label"
		data-inset="${props.inset === true ? "" : undefined}"
		class="${() => cn(menuLabelClasses, read(props.class))}"
	>${slot(props.children)}</div>`,
);

export interface DropdownMenuSeparatorProps {
	class?: Reactive<string>;
}

export const DropdownMenuSeparator = component<DropdownMenuSeparatorProps>(
	(props) => html`<div
		data-slot="dropdown-menu-separator"
		role="separator"
		class="${() => cn(menuSeparatorClasses, read(props.class))}"
	></div>`,
);

export interface DropdownMenuShortcutProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const DropdownMenuShortcut = component<DropdownMenuShortcutProps>(
	(props) => html`<span
		data-slot="dropdown-menu-shortcut"
		class="${() => cn(menuShortcutClasses, read(props.class))}"
	>${slot(props.children)}</span>`,
);

interface SubmenuApi {
	readonly triggerId: string;
	register(body: Child, className: Reactive<string> | undefined): void;
}

const SubmenuContext = createContext<SubmenuApi>("DropdownMenuSub");

export interface DropdownMenuSubProps {
	children?: Parts;
}

/**
 * A nested menu.
 *
 * Renders only its trigger row: `wireMenu` opens the panel from the row's
 * `data-submenu` id when the pointer rests on it or the right arrow is
 * pressed, and builds it fresh each time — a panel kept from a previous open
 * carries the DOM state the last teardown left on it.
 */
export const DropdownMenuSub = component<DropdownMenuSubProps>((props) => {
	const triggerId = uid("dropdown-menu-sub-trigger");
	let body: Child;
	let panelClass: Reactive<string> | undefined;

	provide<SubmenuApi>(SubmenuContext, {
		triggerId,
		register(registered, className) {
			body = registered;
			panelClass = className;
		},
	});

	const parts = props.children?.();

	registerSubmenu(
		triggerId,
		({ id }) => html`<div
			data-slot="dropdown-menu-sub-content"
			id="${id}"
			role="menu"
			aria-orientation="vertical"
			tabindex="-1"
			class="${cn(
				menuSubPanelClasses,
				zoomInOut,
				slideInFromSide,
				read(panelClass),
			)}"
		>${body}</div>`,
	);

	return html`${parts}`;
});

export interface DropdownMenuSubTriggerProps {
	children?: Slot;
	inset?: boolean;
	disabled?: boolean;
	class?: Reactive<string>;
}

export const DropdownMenuSubTrigger = component<DropdownMenuSubTriggerProps>(
	(props) => {
		const sub = inject(SubmenuContext);
		return html`<div
			data-slot="dropdown-menu-sub-trigger"
			data-nebula-item
			data-submenu="${sub.triggerId}"
			role="menuitem"
			aria-haspopup="menu"
			aria-expanded="false"
			data-inset="${props.inset === true ? "" : undefined}"
			data-disabled="${props.disabled === true ? "" : undefined}"
			tabindex="-1"
			class="${() => cn(menuSubTriggerClasses, read(props.class))}"
		>${slot(props.children)}${ChevronRightIcon({ class: "ml-auto size-4" })}</div>`;
	},
);

export interface DropdownMenuSubContentProps {
	children?: Parts;
	class?: Reactive<string>;
}

/**
 * The nested panel.
 *
 * Renders nothing where it is written, like every other content part, and
 * builds its rows during setup so they see both menus' contexts.
 */
export const DropdownMenuSubContent = component<DropdownMenuSubContentProps>(
	(props) => {
		const sub = inject(SubmenuContext);
		sub.register(props.children?.(), props.class);
		return html``;
	},
);

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
