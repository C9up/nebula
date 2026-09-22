/**
 * Select — choose one option from a list.
 *
 * A custom listbox, not a styled `<select>`. This is the one place nebula
 * gives up native behaviour, and the reason is that a `<select>` popup is
 * drawn by the operating system: its font, its colours and its checkmarks
 * cannot be styled at all, and options cannot contain anything but text. A
 * design system that can style every control except this one is not a design
 * system.
 *
 *   Select({ name: "plan", children: () => html`
 *     ${SelectTrigger({ children: SelectValue({ placeholder: "Pick one" }) })}
 *     ${SelectContent({ children: () => html`
 *       ${SelectGroup({ children: html`
 *         ${SelectLabel({ children: "Plans" })}
 *         ${SelectItem({ value: "free", children: "Free" })}
 *         ${SelectItem({ value: "pro", children: "Pro" })}
 *       ` })}
 *     ` })}
 *   ` })
 *
 * The items REGISTER themselves as they are built, in document order, and the
 * keyboard model then walks that list rather than the DOM. That is deliberate:
 * the listbox pattern keeps focus on the trigger and only moves
 * `aria-activedescendant`, so there is no focused element to walk from.
 *
 * What a native `<select>` was doing for free, and all of which has to be put
 * back by hand:
 *
 * - `role="combobox"` on the trigger, `role="listbox"` on the panel,
 *   `role="option"` with `aria-selected` on each entry.
 * - `aria-activedescendant` rather than moving DOM focus — it is what lets a
 *   screen reader announce the highlighted option without the focus ring
 *   jumping.
 * - Type-ahead, arrows, Home/End, Enter and Escape.
 * - A hidden input, so the control still posts with a plain HTML form.
 *
 * The panel is sized to the trigger and capped at the space available below
 * it, so a hundred-option list scrolls rather than running off the screen.
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
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { slideInFromSide, zoomInOut } from "../lib/motion.js";
import { type Reactive, read, readOr } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";
import type { Align, Placement, Side } from "../primitives/floating.js";
import { floatingSurface } from "../primitives/floatingSurface.js";
import { focusSilently } from "../primitives/focusable.js";

export const selectTriggerClasses =
	"border-input dark:bg-input/30 dark:hover:bg-input/50 flex w-fit min-w-0 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground";

export const selectContentClasses =
	"bg-popover text-popover-foreground relative z-50 max-h-(--nebula-available-height) min-w-(--nebula-anchor-width) origin-(--nebula-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border shadow-md";

const itemClasses =
	"relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[active]:bg-accent data-[active]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground";

const scrollButtonClasses =
	"flex cursor-default items-center justify-center py-1";

/** One registered option. Built by `SelectItem` as the parts are assembled. */
interface RegisteredItem {
	readonly value: string;
	readonly id: string;
	/** What type-ahead matches against. */
	readonly textValue: string;
	readonly disabled: boolean;
}

interface RegisteredContent {
	readonly body: Child;
	readonly side: Side;
	readonly align: Align;
	readonly sideOffset: number;
	readonly class?: Reactive<string>;
}

interface SelectApi {
	readonly triggerId: string;
	readonly listId: string;
	readonly open: () => boolean;
	readonly value: () => string | undefined;
	readonly active: () => string | undefined;
	readonly disabled: () => boolean;
	readonly invalid: () => boolean;
	readonly required: boolean;
	/** The label of the chosen option, for `SelectValue`. */
	readonly chosenLabel: () => string | undefined;
	/** This select's id for a value. Per instance: ids must be unique on a page. */
	itemId(value: string): string;
	toggle(): void;
	choose(value: string): void;
	setActive(value: string | undefined): void;
	onTriggerKeyDown(event: KeyboardEvent): void;
	registerItem(item: RegisteredItem): void;
	registerContent(content: RegisteredContent): void;
}

const SelectContext = createContext<SelectApi>("Select");

export interface SelectProps {
	name?: string;
	value?: Reactive<string | undefined>;
	defaultValue?: string;
	disabled?: Reactive<boolean>;
	invalid?: Reactive<boolean>;
	required?: boolean;
	onValueChange?: (value: string) => void;
	class?: Reactive<string>;
	children?: Parts;
}

export const Select = component<SelectProps>((props) => {
	const triggerId = uid("select-trigger");
	const listId = uid("select-list");
	const items: RegisteredItem[] = [];
	/** Per instance, not per module: two selects may offer the same value. */
	const optionIds = new Map<string, string>();
	let content: RegisteredContent | undefined;

	const open = signal(false);
	const selection = controllable<string | undefined>({
		value: props.value,
		initial: props.defaultValue,
		onChange: (next) => {
			if (next !== undefined) props.onValueChange?.(next);
		},
	});
	/** The option the keyboard is on. Distinct from the selected one. */
	const active = signal<string | undefined>(undefined);

	const enabled = (): readonly RegisteredItem[] =>
		items.filter((item) => !item.disabled);

	function choose(value: string): void {
		selection.set(value);
		active(value);
		open(false);
		focusSilently(document.getElementById(triggerId));
	}

	function moveActive(delta: number): void {
		const list = enabled();
		if (list.length === 0) return;
		const from = list.findIndex((item) => item.value === active());
		const next = from === -1 ? (delta > 0 ? 0 : list.length - 1) : from + delta;
		const clamped = Math.min(Math.max(next, 0), list.length - 1);
		const target = list[clamped];
		if (target !== undefined) active(target.value);
	}

	/**
	 * Type-ahead over the registered options, not over elements.
	 *
	 * The shared primitive walks DOM nodes, which works for menus where focus
	 * moves. Here focus stays on the trigger and only `aria-activedescendant`
	 * moves, so the search runs over the registration list instead.
	 */
	let buffer = "";
	let bufferTimer: ReturnType<typeof setTimeout> | undefined;

	function seekByText(character: string): void {
		buffer += character.toLowerCase();
		if (bufferTimer !== undefined) clearTimeout(bufferTimer);
		bufferTimer = setTimeout(() => {
			buffer = "";
		}, 1000);

		const list = enabled();
		const from = list.findIndex((item) => item.value === active());
		for (let i = 1; i <= list.length; i += 1) {
			const item = list[(Math.max(from, 0) + i) % list.length];
			if (item === undefined) continue;
			if (item.textValue.toLowerCase().startsWith(buffer)) {
				active(item.value);
				return;
			}
		}
	}

	onUnmount(() => {
		if (bufferTimer !== undefined) clearTimeout(bufferTimer);
	});

	function onTriggerKeyDown(event: KeyboardEvent): void {
		if (readOr(props.disabled, false)) return;

		if (!open()) {
			if (
				event.key === "ArrowDown" ||
				event.key === "Enter" ||
				event.key === " "
			) {
				event.preventDefault();
				active(selection.current() ?? enabled()[0]?.value);
				open(true);
			}
			return;
		}

		if (event.key === "ArrowDown") {
			event.preventDefault();
			moveActive(1);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			moveActive(-1);
		} else if (event.key === "Home") {
			event.preventDefault();
			active(enabled()[0]?.value);
		} else if (event.key === "End") {
			event.preventDefault();
			active(enabled()[enabled().length - 1]?.value);
		} else if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			const current = active();
			if (current !== undefined) choose(current);
		} else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
			seekByText(event.key);
		}
	}

	provide<SelectApi>(SelectContext, {
		triggerId,
		listId,
		open: () => open(),
		value: () => selection.current(),
		active: () => active(),
		disabled: () => readOr(props.disabled, false),
		invalid: () => read(props.invalid) === true,
		required: props.required === true,
		chosenLabel: () =>
			items.find((item) => item.value === selection.current())?.textValue,
		itemId(value) {
			let id = optionIds.get(value);
			if (id === undefined) {
				id = uid("select-item");
				optionIds.set(value, id);
			}
			return id;
		},
		toggle() {
			active(selection.current() ?? enabled()[0]?.value);
			open(!open());
		},
		choose,
		setActive: (value) => active(value),
		onTriggerKeyDown,
		registerItem(item) {
			items.push(item);
		},
		registerContent(registered) {
			content = registered;
		},
	});

	// Built HERE: every item registers during this call, in document order,
	// which is the order the arrows and type-ahead walk.
	const parts = props.children?.();

	if (content !== undefined) {
		const registered = content;
		const placement: Placement =
			registered.align === "center"
				? registered.side
				: `${registered.side}-${registered.align}`;
		floatingSurface({
			anchor: () => document.getElementById(triggerId),
			open: () => open(),
			onClose: () => open(false),
			placement,
			offset: registered.sideOffset,
			matchWidth: true,
			// Focus never enters the panel — the listbox pattern keeps it on the
			// trigger — so nothing here traps or moves it.
			content: () => renderList(registered, { listId, triggerId }),
			onOpened: scrollActiveIntoView,
		});
	}

	/**
	 * Bring the highlighted option into view when the panel opens.
	 *
	 * Opening a two-hundred-option select on the one already chosen and showing
	 * the top of the list is the standard failure of a custom select.
	 */
	function scrollActiveIntoView(panel: HTMLElement): void {
		const current = active() ?? selection.current();
		if (current === undefined) return;
		const id = items.find((item) => item.value === current)?.id;
		if (id === undefined) return;
		panel
			.querySelector(`#${CSS.escape(id)}`)
			?.scrollIntoView({ block: "nearest" });
	}

	return html`<div
		data-slot="select"
		class="${() => cn("inline-flex", read(props.class))}"
	>${parts}<input
			type="hidden"
			name="${props.name}"
			.value="${() => selection.current() ?? ""}"
		/></div>`;
});

export interface SelectTriggerProps {
	children?: Slot;
	size?: "default" | "sm";
	class?: Reactive<string>;
}

export const SelectTrigger = component<SelectTriggerProps>((props) => {
	const select = inject(SelectContext);
	return html`<button
		type="button"
		data-slot="select-trigger"
		id="${select.triggerId}"
		role="combobox"
		aria-haspopup="listbox"
		aria-expanded="${() => (select.open() ? "true" : "false")}"
		aria-controls="${() => (select.open() ? select.listId : undefined)}"
		aria-activedescendant="${() => activeDescendant(select)}"
		aria-invalid="${() => (select.invalid() ? "true" : undefined)}"
		aria-required="${select.required ? "true" : undefined}"
		data-size="${props.size ?? "default"}"
		data-state="${() => (select.open() ? "open" : "closed")}"
		data-placeholder="${() => (select.value() === undefined ? "" : undefined)}"
		?disabled="${() => select.disabled()}"
		class="${() => cn(selectTriggerClasses, read(props.class))}"
		@click="${() => select.toggle()}"
		@keydown="${(event: KeyboardEvent) => select.onTriggerKeyDown(event)}"
	>${slot(props.children)}${ChevronDownIcon({ class: "size-4 opacity-50" })}</button>`;
});

function activeDescendant(select: SelectApi): string | undefined {
	if (!select.open()) return undefined;
	const current = select.active();
	return current === undefined ? undefined : select.itemId(current);
}

export interface SelectValueProps {
	/** Shown until something is chosen. */
	placeholder?: string;
	class?: Reactive<string>;
}

/** The chosen option's text, or the placeholder. */
export const SelectValue = component<SelectValueProps>((props) => {
	const select = inject(SelectContext);
	return html`<span
		data-slot="select-value"
		class="${() => cn("truncate", read(props.class))}"
	>${() => select.chosenLabel() ?? props.placeholder ?? "Select…"}</span>`;
});

export interface SelectContentProps {
	children?: Parts;
	side?: Side;
	align?: Align;
	sideOffset?: number;
	class?: Reactive<string>;
}

/**
 * The listbox.
 *
 * Renders nothing where it is written — the select portals it on open — and
 * builds its items HERE, during setup, which is both what puts them within
 * reach of the context and what fixes their order.
 */
export const SelectContent = component<SelectContentProps>((props) => {
	const select = inject(SelectContext);
	const body = props.children?.();
	select.registerContent({
		body,
		side: props.side ?? "bottom",
		align: props.align ?? "start",
		sideOffset: props.sideOffset ?? 4,
		class: props.class,
	});
	return html``;
});

export interface SelectGroupProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const SelectGroup = component<SelectGroupProps>(
	(props) => html`<div
		data-slot="select-group"
		role="group"
		class="${() => cn("p-1", read(props.class))}"
	>${slot(props.children)}</div>`,
);

export interface SelectLabelProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const SelectLabel = component<SelectLabelProps>(
	(props) => html`<div
		data-slot="select-label"
		class="${() => cn("text-muted-foreground px-2 py-1.5 text-xs", read(props.class))}"
	>${slot(props.children)}</div>`,
);

export interface SelectItemProps {
	value: string;
	children?: Slot;
	/**
	 * What type-ahead matches against.
	 *
	 * Defaults to the children when they are a plain string. An item built from
	 * markup has no text a component can read before it is in the DOM, so one
	 * that wants type-ahead says so.
	 */
	textValue?: string;
	disabled?: boolean;
	class?: Reactive<string>;
}

export const SelectItem = component<SelectItemProps>((props) => {
	const select = inject(SelectContext);
	const id = select.itemId(props.value);
	const children = props.children;
	select.registerItem({
		value: props.value,
		id,
		textValue:
			props.textValue ??
			(typeof children === "string" ? children : props.value),
		disabled: props.disabled === true,
	});

	const chosen = (): boolean => select.value() === props.value;
	return html`<div
		data-slot="select-item"
		id="${id}"
		role="option"
		data-value="${props.value}"
		aria-selected="${() => (chosen() ? "true" : "false")}"
		data-active="${() => (select.active() === props.value ? "" : undefined)}"
		data-disabled="${props.disabled === true ? "" : undefined}"
		class="${() => cn(itemClasses, read(props.class))}"
		@click="${() => {
			if (props.disabled !== true) select.choose(props.value);
		}}"
		@pointerenter="${() => {
			if (props.disabled !== true) select.setActive(props.value);
		}}"
	><span class="flex-1 truncate">${slot(children)}</span><span
			data-slot="select-item-indicator"
			class="absolute right-2 flex size-3.5 items-center justify-center"
		>${() => (chosen() ? CheckIcon({ class: "size-4" }) : null)}</span></div>`;
});

export interface SelectSeparatorProps {
	class?: Reactive<string>;
}

export const SelectSeparator = component<SelectSeparatorProps>(
	(props) => html`<div
		data-slot="select-separator"
		role="separator"
		class="${() => cn("bg-border pointer-events-none -mx-1 my-1 h-px", read(props.class))}"
	></div>`,
);

export interface SelectScrollButtonProps {
	class?: Reactive<string>;
}

/**
 * Scroll affordances for a list taller than its panel.
 *
 * Upstream shows them because Radix's item-aligned position hides the native
 * scrollbar. The panel here scrolls natively, so these are an affordance
 * rather than the only way down — which is why they scroll while hovered and
 * need no keyboard equivalent.
 */
export const SelectScrollUpButton = component<SelectScrollButtonProps>(
	(props) => scrollButton("up", props),
);

export const SelectScrollDownButton = component<SelectScrollButtonProps>(
	(props) => scrollButton("down", props),
);

const SCROLL_STEP_PX = 24;

function scrollButton(
	direction: "up" | "down",
	props: SelectScrollButtonProps,
): TemplateResult {
	let timer: ReturnType<typeof setInterval> | undefined;
	function stop(): void {
		if (timer !== undefined) clearInterval(timer);
		timer = undefined;
	}
	function start(event: Event): void {
		stop();
		const target = event.currentTarget;
		if (!(target instanceof Element)) return;
		const panel = target.closest("[data-slot='select-content']");
		if (panel === null) return;
		timer = setInterval(() => {
			panel.scrollTop += direction === "up" ? -SCROLL_STEP_PX : SCROLL_STEP_PX;
		}, 50);
	}
	onUnmount(stop);
	return html`<div
		data-slot="${`select-scroll-${direction}-button`}"
		aria-hidden="true"
		class="${() => cn(scrollButtonClasses, read(props.class))}"
		@pointerenter="${start}"
		@pointerleave="${stop}"
	>${direction === "up" ? ChevronUpIcon({ class: "size-4" }) : ChevronDownIcon({ class: "size-4" })}</div>`;
}

function renderList(
	registered: RegisteredContent,
	ids: { listId: string; triggerId: string },
): TemplateResult {
	return html`<div
		data-slot="select-content"
		id="${ids.listId}"
		role="listbox"
		aria-labelledby="${ids.triggerId}"
		class="${cn(
			selectContentClasses,
			zoomInOut,
			slideInFromSide,
			read(registered.class),
		)}"
	>${registered.body}</div>`;
}
