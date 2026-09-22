/**
 * The rows every menu is made of.
 *
 * DropdownMenu, ContextMenu and Menubar are the same menu with three different
 * opening gestures: a button, a right-click, a bar. Upstream repeats all
 * fifteen row components in each of the three files, because each file is
 * copied on its own and has to stand alone. Here the three already share
 * `menu.ts` — its class strings, its keyboard model, its submenu registry —
 * and the registry copies it with them, so repeating the rows would only be
 * three places to fix when one of them is wrong.
 *
 *   const parts = createMenuParts("context-menu", ContextMenuContext);
 *   export const ContextMenuItem = parts.Item;
 *
 * What differs between the three is exactly two things: the `data-slot`
 * prefix, and which context tells a row how to close the menu it is in. Both
 * are arguments.
 *
 * The rows carry `data-nebula-item` and a `role`, which is the whole of the
 * contract `wireMenu` reads — roving focus, type-ahead, arrows and submenu
 * traversal all work on the rendered DOM, so a row built here behaves the same
 * as one written by hand.
 */

import {
	type Context,
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
import {
	menuCheckItemClasses,
	menuIndicatorClasses,
	menuItemClasses,
	menuLabelClasses,
	menuSeparatorClasses,
	menuShortcutClasses,
	menuSubPanelClasses,
	menuSubTriggerClasses,
	registerSubmenu,
} from "./menu.js";
import { portal } from "./portal.js";

/** What a row needs from the menu it is in. */
export interface MenuOwner {
	/** A row was chosen: the whole stack closes. */
	closeAll(): void;
}

export interface MenuGroupProps {
	children?: Slot;
	class?: Reactive<string>;
}

export interface MenuItemProps {
	children?: Slot;
	/** Indent to line up with the checkbox and radio rows. */
	inset?: boolean;
	variant?: "default" | "destructive";
	disabled?: boolean;
	onSelect?: () => void;
	class?: Reactive<string>;
}

export interface MenuCheckboxItemProps {
	children?: Slot;
	checked?: Reactive<boolean>;
	onCheckedChange?: (checked: boolean) => void;
	disabled?: boolean;
	class?: Reactive<string>;
}

export interface MenuRadioGroupProps {
	children?: Parts;
	value?: Reactive<string | undefined>;
	onValueChange?: (value: string) => void;
	class?: Reactive<string>;
}

export interface MenuRadioItemProps {
	children?: Slot;
	value: string;
	disabled?: boolean;
	class?: Reactive<string>;
}

export interface MenuLabelProps {
	children?: Slot;
	inset?: boolean;
	class?: Reactive<string>;
}

export interface MenuSeparatorProps {
	class?: Reactive<string>;
}

export interface MenuShortcutProps {
	children?: Slot;
	class?: Reactive<string>;
}

export interface MenuSubProps {
	children?: Parts;
}

export interface MenuSubTriggerProps {
	children?: Slot;
	inset?: boolean;
	disabled?: boolean;
	class?: Reactive<string>;
}

export interface MenuSubContentProps {
	children?: Parts;
	class?: Reactive<string>;
}

export interface MenuPortalProps {
	children?: Slot;
	container?: () => Element | null;
}

export interface MenuParts {
	Group: (props?: MenuGroupProps) => TemplateResult;
	Item: (props?: MenuItemProps) => TemplateResult;
	CheckboxItem: (props?: MenuCheckboxItemProps) => TemplateResult;
	RadioGroup: (props?: MenuRadioGroupProps) => TemplateResult;
	RadioItem: (props: MenuRadioItemProps) => TemplateResult;
	Label: (props?: MenuLabelProps) => TemplateResult;
	Separator: (props?: MenuSeparatorProps) => TemplateResult;
	Shortcut: (props?: MenuShortcutProps) => TemplateResult;
	Sub: (props?: MenuSubProps) => TemplateResult;
	SubTrigger: (props?: MenuSubTriggerProps) => TemplateResult;
	SubContent: (props?: MenuSubContentProps) => TemplateResult;
	Portal: (props?: MenuPortalProps) => TemplateResult;
}

interface RadioGroupApi {
	readonly value: () => string | undefined;
	select(value: string): void;
}

interface SubmenuApi {
	readonly triggerId: string;
	register(body: Child, className: Reactive<string> | undefined): void;
}

/**
 * Build one menu's fifteen rows.
 *
 * @param prefix The `data-slot` prefix, e.g. `"dropdown-menu"`.
 * @param owner The context carrying that menu's `closeAll`.
 */
export function createMenuParts(
	prefix: string,
	owner: Context<MenuOwner>,
): MenuParts {
	const RadioGroupContext = createContext<RadioGroupApi>(
		`${prefix}-radio-group`,
	);
	const SubContext = createContext<SubmenuApi>(`${prefix}-sub`);

	const Group = component<MenuGroupProps>(
		(props) => html`<div
			data-slot="${`${prefix}-group`}"
			role="group"
			class="${() => cn(read(props.class))}"
		>${slot(props.children)}</div>`,
	);

	const Item = component<MenuItemProps>((props) => {
		const menu = inject(owner);
		function activate(): void {
			if (props.disabled === true) return;
			props.onSelect?.();
			menu.closeAll();
		}
		return html`<div
			data-slot="${`${prefix}-item`}"
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

	const CheckboxItem = component<MenuCheckboxItemProps>((props) => {
		const menu = inject(owner);
		const checked = (): boolean => read(props.checked) === true;
		function activate(): void {
			if (props.disabled === true) return;
			props.onCheckedChange?.(!checked());
			menu.closeAll();
		}
		return html`<div
			data-slot="${`${prefix}-checkbox-item`}"
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

	const RadioGroup = component<MenuRadioGroupProps>((props) => {
		const menu = inject(owner);
		provide<RadioGroupApi>(RadioGroupContext, {
			value: () => read(props.value),
			select(next) {
				props.onValueChange?.(next);
				menu.closeAll();
			},
		});
		const rows = props.children?.();
		return html`<div
			data-slot="${`${prefix}-radio-group`}"
			role="group"
			class="${() => cn(read(props.class))}"
		>${rows}</div>`;
	});

	const RadioItem = component<MenuRadioItemProps>((props) => {
		const group = inject(RadioGroupContext);
		const selected = (): boolean => group.value() === props.value;
		function activate(): void {
			if (props.disabled === true) return;
			group.select(props.value);
		}
		return html`<div
			data-slot="${`${prefix}-radio-item`}"
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
	});

	const Label = component<MenuLabelProps>(
		(props) => html`<div
			data-slot="${`${prefix}-label`}"
			data-inset="${props.inset === true ? "" : undefined}"
			class="${() => cn(menuLabelClasses, read(props.class))}"
		>${slot(props.children)}</div>`,
	);

	const Separator = component<MenuSeparatorProps>(
		(props) => html`<div
			data-slot="${`${prefix}-separator`}"
			role="separator"
			class="${() => cn(menuSeparatorClasses, read(props.class))}"
		></div>`,
	);

	const Shortcut = component<MenuShortcutProps>(
		(props) => html`<span
			data-slot="${`${prefix}-shortcut`}"
			class="${() => cn(menuShortcutClasses, read(props.class))}"
		>${slot(props.children)}</span>`,
	);

	const Sub = component<MenuSubProps>((props) => {
		const triggerId = uid(`${prefix}-sub-trigger`);
		let body: Child;
		let panelClass: Reactive<string> | undefined;

		provide<SubmenuApi>(SubContext, {
			triggerId,
			register(registered, className) {
				body = registered;
				panelClass = className;
			},
		});

		const parts = props.children?.();

		// Registered AFTER the parts are built, so `body` is the panel the
		// `SubContent` among them just handed over. A submenu is built fresh on
		// each open, which is why this is a factory.
		registerSubmenu(
			triggerId,
			({ id }) => html`<div
				data-slot="${`${prefix}-sub-content`}"
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

	const SubTrigger = component<MenuSubTriggerProps>((props) => {
		const sub = inject(SubContext);
		return html`<div
			data-slot="${`${prefix}-sub-trigger`}"
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
	});

	const SubContent = component<MenuSubContentProps>((props) => {
		const sub = inject(SubContext);
		sub.register(props.children?.(), props.class);
		return html``;
	});

	const Portal = component<MenuPortalProps>((props) => {
		const mounted = portal(html`${slot(props.children)}`, {
			container: props.container,
		});
		mounted.host.setAttribute("data-slot", `${prefix}-portal`);
		return html``;
	});

	return {
		Group,
		Item,
		CheckboxItem,
		RadioGroup,
		RadioItem,
		Label,
		Separator,
		Shortcut,
		Sub,
		SubTrigger,
		SubContent,
		Portal,
	};
}
