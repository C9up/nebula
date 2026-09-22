/**
 * Command — the palette: type to filter, arrows to move, Enter to run.
 *
 *   Command({ children: () => html`
 *     ${CommandInput({ placeholder: "Search…" })}
 *     ${CommandList({ children: () => html`
 *       ${CommandEmpty({ children: "Nothing found." })}
 *       ${CommandGroup({ heading: "Actions", children: () => html`
 *         ${CommandItem({ value: "new", children: "New file", onSelect: create })}
 *       ` })}
 *     ` })}
 *   ` })
 *
 * Filtering happens WITHOUT re-rendering. Each item registers itself as it is
 * built and then hides itself when the query stops matching — Aurora never
 * re-runs a component's setup, so a palette that rebuilt its list on every
 * keystroke would lose the DOM the highlight and the scroll position live in.
 * A group hides itself the same way, once none of its own items are showing,
 * so an empty heading never sits over nothing.
 *
 * `role="combobox"` on the input with `aria-activedescendant`, and focus never
 * leaves it. The list is a `listbox` whose options are named rather than
 * focused, which is what lets a screen reader read each result as the arrows
 * pass over it while typing continues to work.
 */

import {
	component,
	createContext,
	html,
	inject,
	provide,
	signal,
} from "@c9up/aurora";
import type { Parts, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { SearchIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";

/** What the filter is given. */
export interface CommandCandidate {
	readonly value: string;
	/** The visible text, or `textValue` when the children are markup. */
	readonly textValue: string;
	/** Extra terms that should match this item. */
	readonly keywords: readonly string[];
}

export function defaultFilter(
	candidate: CommandCandidate,
	query: string,
): boolean {
	if (query === "") return true;
	const needle = query.toLowerCase();
	if (candidate.textValue.toLowerCase().includes(needle)) return true;
	return candidate.keywords.some((keyword) =>
		keyword.toLowerCase().includes(needle),
	);
}

interface RegisteredItem extends CommandCandidate {
	readonly id: string;
	readonly disabled: boolean;
	readonly groupId: string | undefined;
	run(): void;
}

interface CommandApi {
	readonly inputId: string;
	readonly listId: string;
	readonly query: () => string;
	readonly active: () => string | undefined;
	setActive(value: string | undefined): void;
	register(item: Omit<RegisteredItem, "id">): void;
	/** This palette's element id for a value. Per instance: ids are page-wide. */
	itemId(value: string): string;
	/** Does this item survive the current query? */
	isVisible(value: string): boolean;
	/** Does this group have anything left to show? */
	groupHasMatches(groupId: string): boolean;
	readonly hasMatches: () => boolean;
	run(value: string): void;
	onInput(event: Event): void;
	onKeyDown(event: KeyboardEvent): void;
}

const CommandContext = createContext<CommandApi>("Command");

interface CommandGroupApi {
	readonly groupId: string;
}

/**
 * Which group an item belongs to.
 *
 * Defaulted rather than required: an item outside any group is ordinary, so
 * there is nothing to raise about.
 */
const CommandGroupContext = createContext<CommandGroupApi | undefined>(
	"CommandGroup",
	undefined,
);

export interface CommandProps {
	/** Replace the built-in substring filter. */
	filter?: (candidate: CommandCandidate, query: string) => boolean;
	onSelect?: (value: string) => void;
	class?: Reactive<string>;
	children?: Parts;
}

export const Command = component<CommandProps>((props) => {
	const inputId = uid("command-input");
	const listId = uid("command-list");
	const items: RegisteredItem[] = [];
	/** Per instance, not per module: two palettes may offer the same value. */
	const itemIds = new Map<string, string>();
	const query = signal("");

	function itemId(value: string): string {
		let id = itemIds.get(value);
		if (id === undefined) {
			id = uid("command-item");
			itemIds.set(value, id);
		}
		return id;
	}

	/**
	 * The highlighted value, or `undefined` for "the first match".
	 *
	 * DERIVED rather than seeded at registration. Writing it while the items
	 * registered would be a signal write during the render that is building
	 * them, and a surface rebuilds its content inside an effect — the write
	 * re-entered that effect and the palette recursed until the stack gave out.
	 * Nothing needs the value stored before the user moves.
	 */
	const explicitActive = signal<string | undefined>(undefined);

	function active(): string | undefined {
		const chosen = explicitActive();
		if (chosen !== undefined) return chosen;
		return matches()[0]?.value;
	}

	function matches(): readonly RegisteredItem[] {
		const filter = props.filter ?? defaultFilter;
		return items.filter((item) => !item.disabled && filter(item, query()));
	}

	function run(value: string): void {
		const item = items.find((entry) => entry.value === value);
		if (item === undefined || item.disabled) return;
		item.run();
		props.onSelect?.(value);
	}

	function move(delta: number): void {
		const list = matches();
		if (list.length === 0) return;
		const from = list.findIndex((item) => item.value === active());
		const next = from === -1 ? (delta > 0 ? 0 : list.length - 1) : from + delta;
		// Wrapping is right here, unlike in a menu: a palette is a search result
		// list and the user is scanning it, not navigating a fixed structure.
		const target = list[(next + list.length) % list.length];
		if (target === undefined) return;
		explicitActive(target.value);
		document.getElementById(target.id)?.scrollIntoView({ block: "nearest" });
	}

	provide<CommandApi>(CommandContext, {
		inputId,
		listId,
		query: () => query(),
		active,
		setActive: (value) => explicitActive(value),
		itemId,
		register(item) {
			items.push({ ...item, id: itemId(item.value) });
		},
		isVisible(value) {
			return matches().some((item) => item.value === value);
		},
		groupHasMatches(groupId) {
			return matches().some((item) => item.groupId === groupId);
		},
		hasMatches: () => matches().length > 0,
		run,
		onInput(event) {
			const target = event.target;
			if (!(target instanceof HTMLInputElement)) return;
			query(target.value);
			// Back to "the first match": leaving the highlight on an item the new
			// query filtered out means Enter runs something invisible.
			explicitActive(undefined);
		},
		onKeyDown(event) {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				move(1);
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				move(-1);
			} else if (event.key === "Enter") {
				event.preventDefault();
				const current = active();
				if (current !== undefined && matches().some((i) => i.value === current))
					run(current);
			}
		},
	});

	return html`<div
		data-slot="command"
		class="${() =>
			cn(
				"bg-popover text-popover-foreground flex size-full flex-col overflow-hidden rounded-md",
				read(props.class),
			)}"
	>${props.children?.()}</div>`;
});

export interface CommandInputProps {
	placeholder?: string;
	class?: Reactive<string>;
}

export const CommandInput = component<CommandInputProps>((props) => {
	const command = inject(CommandContext);
	return html`<div
		data-slot="command-input-wrapper"
		class="flex h-9 items-center gap-2 border-b px-3"
	>${SearchIcon({ class: "size-4 shrink-0 opacity-50" })}<input
			data-slot="command-input"
			id="${command.inputId}"
			type="text"
			role="combobox"
			autocomplete="off"
			aria-expanded="true"
			aria-controls="${command.listId}"
			aria-activedescendant="${() => {
				const current = command.active();
				return current === undefined ? undefined : command.itemId(current);
			}}"
			placeholder="${props.placeholder ?? "Type a command or search…"}"
			class="${() =>
				cn(
					"placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
					read(props.class),
				)}"
			@input="${(event: Event) => command.onInput(event)}"
			@keydown="${(event: KeyboardEvent) => command.onKeyDown(event)}"
		/></div>`;
});

export interface CommandListProps {
	children?: Parts;
	class?: Reactive<string>;
}

export const CommandList = component<CommandListProps>((props) => {
	const command = inject(CommandContext);
	return html`<div
		data-slot="command-list"
		id="${command.listId}"
		role="listbox"
		class="${() =>
			cn(
				"max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto p-1",
				read(props.class),
			)}"
	>${props.children?.()}</div>`;
});

export interface CommandEmptyProps {
	children?: Slot;
	class?: Reactive<string>;
}

/** Shown when the query matches nothing. Hidden, not removed — see `Command`. */
export const CommandEmpty = component<CommandEmptyProps>((props) => {
	const command = inject(CommandContext);
	return html`<div
		data-slot="command-empty"
		role="presentation"
		?hidden="${() => command.hasMatches()}"
		class="${() => cn("py-6 text-center text-sm", read(props.class))}"
	>${slot(props.children)}</div>`;
});

export interface CommandGroupProps {
	heading?: Slot;
	children?: Parts;
	class?: Reactive<string>;
}

export const CommandGroup = component<CommandGroupProps>((props) => {
	const command = inject(CommandContext);
	const groupId = uid("command-group");
	provide<CommandGroupApi | undefined>(CommandGroupContext, { groupId });
	const rows = props.children?.();
	return html`<div
		data-slot="command-group"
		role="group"
		?hidden="${() => !command.groupHasMatches(groupId)}"
		class="${() => cn("text-foreground overflow-hidden p-1", read(props.class))}"
	>${
		props.heading === undefined
			? null
			: html`<div
					role="presentation"
					class="text-muted-foreground px-2 py-1.5 text-xs font-medium"
				>${slot(props.heading)}</div>`
	}${rows}</div>`;
});

export interface CommandItemProps {
	value: string;
	children?: Slot;
	/** What the filter matches, when the children are markup. */
	textValue?: string;
	/** Extra terms that should match this item. */
	keywords?: readonly string[];
	disabled?: boolean;
	onSelect?: () => void;
	class?: Reactive<string>;
}

export const CommandItem = component<CommandItemProps>((props) => {
	const command = inject(CommandContext);
	const group = inject(CommandGroupContext);
	const children = props.children;

	const id = command.itemId(props.value);
	command.register({
		value: props.value,
		textValue:
			props.textValue ??
			(typeof children === "string" ? children : props.value),
		keywords: props.keywords ?? [],
		disabled: props.disabled === true,
		groupId: group?.groupId,
		run: () => props.onSelect?.(),
	});

	const chosen = (): boolean => command.active() === props.value;
	return html`<div
		data-slot="command-item"
		id="${id}"
		role="option"
		?hidden="${() => !command.isVisible(props.value)}"
		aria-selected="${() => (chosen() ? "true" : "false")}"
		aria-disabled="${props.disabled === true ? "true" : undefined}"
		data-active="${() => (chosen() ? "" : undefined)}"
		data-disabled="${props.disabled === true ? "" : undefined}"
		class="${() =>
			cn(
				"relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[active]:bg-accent data-[active]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
				read(props.class),
			)}"
		@click="${() => command.run(props.value)}"
		@pointerenter="${() => command.setActive(props.value)}"
	>${slot(children)}</div>`;
});

export interface CommandSeparatorProps {
	class?: Reactive<string>;
}

export const CommandSeparator = component<CommandSeparatorProps>(
	(props) => html`<div
		data-slot="command-separator"
		role="separator"
		class="${() => cn("bg-border -mx-1 h-px", read(props.class))}"
	></div>`,
);

export interface CommandShortcutProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const CommandShortcut = component<CommandShortcutProps>(
	(props) => html`<span
		data-slot="command-shortcut"
		class="${() =>
			cn(
				"text-muted-foreground ml-auto text-xs tracking-widest",
				read(props.class),
			)}"
	>${slot(props.children)}</span>`,
);
