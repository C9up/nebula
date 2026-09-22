/**
 * Tabs — one panel visible at a time.
 *
 *   Tabs({ defaultValue: "account", children: () => html`
 *     ${TabsList({ children: html`
 *       ${TabsTrigger({ value: "account", children: "Account" })}
 *       ${TabsTrigger({ value: "password", children: "Password" })}
 *     ` })}
 *     ${TabsContent({ value: "account", children: "…" })}
 *     ${TabsContent({ value: "password", children: "…" })}
 *   ` })
 *
 * The WAI-ARIA tabs pattern in full: the tab list is a single tab stop with
 * arrows moving between tabs, each tab points at its panel with
 * `aria-controls`, and each panel points back with `aria-labelledby`. A
 * trigger and its panel find each other through the shared `value` — the ids
 * are minted once per value by the context, so neither has to know the other
 * exists.
 *
 * Activation is automatic — moving to a tab selects it — which is the right
 * default when panels are already rendered and switching costs nothing. The
 * `activateOnFocus: false` escape hatch exists for panels that fetch on
 * display, where arrowing past three tabs would fire three requests.
 *
 * Hidden panels stay mounted so a form or a scroll position inside one
 * survives a trip to another tab. `hidden` keeps them out of the layout and
 * the accessibility tree, which is the behaviour `display: none` would give
 * without also removing them from the DOM.
 */

import {
	component,
	createContext,
	html,
	inject,
	onMount,
	onUnmount,
	provide,
	signal,
} from "@c9up/aurora";
import type { Parts, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { cva, type VariantProps } from "../lib/cva.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";
import { type RovingFocus, rovingFocus } from "../primitives/rovingFocus.js";

export const tabsListVariants = cva(
	"group/tabs-list text-muted-foreground inline-flex w-fit items-center justify-center rounded-lg p-[3px] group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
	{
		variants: {
			variant: {
				default: "bg-muted",
				line: "gap-1 bg-transparent",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

export type TabsListVariants = VariantProps<typeof tabsListVariants>;

const triggerClasses =
	"relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

/** The filled look: the active tab gets a surface of its own. */
const triggerSurfaceClasses =
	"data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent";

/** The underlined look: a rule along the active tab's edge, faded in. */
const triggerUnderlineClasses =
	"after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100";

interface TabIds {
	readonly tab: string;
	readonly panel: string;
}

interface TabsApi {
	readonly orientation: "horizontal" | "vertical";
	readonly activateOnFocus: boolean;
	readonly active: () => string;
	select(value: string): void;
	/**
	 * This Tabs' ids for a value.
	 *
	 * Minted on first ask and kept, so a trigger and its panel — built at
	 * different moments and knowing only the value they share — name the same
	 * pair. Per instance, because ids must be unique on a page.
	 */
	ids(value: string): TabIds;
	/**
	 * A trigger announcing itself, so the first ENABLED one becomes the default
	 * when the caller named none. A disabled tab selected by default shows a
	 * panel nothing can navigate back to.
	 */
	registerTrigger(value: string, disabled: boolean): void;
}

const TabsContext = createContext<TabsApi>("Tabs");

export interface TabsProps {
	/** Selected at first render. Defaults to the first trigger built. */
	defaultValue?: string;
	value?: Reactive<string | undefined>;
	orientation?: "horizontal" | "vertical";
	/** Selecting follows focus. Default `true`. */
	activateOnFocus?: boolean;
	onValueChange?: (value: string) => void;
	class?: Reactive<string>;
	children?: Parts;
}

export const Tabs = component<TabsProps>((props) => {
	const orientation = props.orientation ?? "horizontal";
	const internal = signal(props.defaultValue ?? "");
	const ids = new Map<string, TabIds>();

	function active(): string {
		const external = read(props.value);
		return external === undefined ? internal() : external;
	}

	function select(value: string): void {
		if (active() === value) return;
		internal(value);
		props.onValueChange?.(value);
	}

	provide<TabsApi>(TabsContext, {
		orientation,
		activateOnFocus: props.activateOnFocus !== false,
		active,
		select,
		ids(value) {
			let found = ids.get(value);
			if (found === undefined) {
				found = { tab: uid("tab"), panel: uid("tab-panel") };
				ids.set(value, found);
			}
			return found;
		},
		registerTrigger(value, disabled) {
			if (disabled) return;
			if (props.defaultValue !== undefined || internal() !== "") return;
			internal(value);
		},
	});

	return html`<div
		data-slot="tabs"
		data-orientation="${orientation}"
		class="${() =>
			cn(
				"group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
				read(props.class),
			)}"
	>${props.children?.()}</div>`;
});

export interface TabsListProps extends TabsListVariants {
	children?: Slot;
	class?: Reactive<string>;
}

/**
 * The row of triggers, and the single tab stop that holds them.
 *
 * `rovingFocus` is wired here rather than in `Tabs`: it needs the element the
 * tabs are actually in, and only this part has one.
 */
export const TabsList = component<TabsListProps>((props) => {
	const tabs = inject(TabsContext);
	const listId = uid("tabs-list");
	let group: RovingFocus | undefined;

	onMount(() => {
		group = rovingFocus({
			container: () => document.getElementById(listId),
			itemSelector: "[role='tab']",
			orientation: tabs.orientation,
			onFocusChange: (item) => {
				if (!tabs.activateOnFocus) return;
				const value = item.getAttribute("data-value");
				if (value !== null) tabs.select(value);
			},
			onSelect: (item) => {
				const value = item.getAttribute("data-value");
				if (value !== null) tabs.select(value);
			},
		});
		group.sync();
	});
	onUnmount(() => group?.destroy());

	return html`<div
		data-slot="tabs-list"
		id="${listId}"
		role="tablist"
		data-variant="${props.variant ?? "default"}"
		aria-orientation="${tabs.orientation}"
		class="${() =>
			cn(tabsListVariants({ variant: props.variant }), read(props.class))}"
	>${slot(props.children)}</div>`;
});

export interface TabsTriggerProps {
	value: string;
	children?: Slot;
	disabled?: boolean;
	class?: Reactive<string>;
}

export const TabsTrigger = component<TabsTriggerProps>((props) => {
	const tabs = inject(TabsContext);
	const ids = tabs.ids(props.value);
	tabs.registerTrigger(props.value, props.disabled === true);
	const selected = (): boolean => tabs.active() === props.value;

	return html`<button
		type="button"
		data-slot="tabs-trigger"
		id="${ids.tab}"
		role="tab"
		data-value="${props.value}"
		data-state="${() => (selected() ? "active" : "inactive")}"
		data-disabled="${props.disabled === true ? "" : undefined}"
		aria-selected="${() => (selected() ? "true" : "false")}"
		aria-controls="${ids.panel}"
		?disabled="${props.disabled === true}"
		class="${() =>
			cn(
				triggerClasses,
				triggerSurfaceClasses,
				triggerUnderlineClasses,
				read(props.class),
			)}"
		@click="${() => tabs.select(props.value)}"
	>${slot(props.children)}</button>`;
});

export interface TabsContentProps {
	value: string;
	children?: Slot;
	class?: Reactive<string>;
}

export const TabsContent = component<TabsContentProps>((props) => {
	const tabs = inject(TabsContext);
	const ids = tabs.ids(props.value);
	return html`<div
		data-slot="tabs-content"
		id="${ids.panel}"
		role="tabpanel"
		aria-labelledby="${ids.tab}"
		tabindex="0"
		?hidden="${() => tabs.active() !== props.value}"
		class="${() => cn("flex-1 outline-none", read(props.class))}"
	>${slot(props.children)}</div>`;
});
