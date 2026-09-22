/**
 * Accordion — a stack of collapsible sections.
 *
 *   Accordion({ type: "single", children: () => html`
 *     ${AccordionItem({ value: "a", children: () => html`
 *       ${AccordionTrigger({ children: "Shipping" })}
 *       ${AccordionContent({ children: "Two to four days." })}
 *     ` })}
 *   ` })
 *
 * `type: "single"` needs to know about every section at once, which is what
 * the context carries: the group owns the open SET and each item asks whether
 * it is in it. Radix does the same, for the same reason.
 *
 * The keyboard behaviour is the WAI-ARIA accordion pattern, delegated to
 * `rovingFocus` over the headers: arrows move between sections, Home and End
 * jump to the ends, and the headers are one tab stop rather than one each.
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
import { ChevronDownIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";
import { type RovingFocus, rovingFocus } from "../primitives/rovingFocus.js";

interface AccordionApi {
	isOpen(value: string): boolean;
	toggle(value: string): void;
}

const AccordionContext = createContext<AccordionApi>("Accordion");

interface AccordionItemApi {
	readonly value: string;
	readonly triggerId: string;
	readonly panelId: string;
	readonly disabled: boolean;
	readonly open: () => boolean;
	toggle(): void;
}

const AccordionItemContext = createContext<AccordionItemApi>("AccordionItem");

export interface AccordionProps {
	children?: Parts;
	/** `"single"` closes the open section when another opens. Default `"single"`. */
	type?: "single" | "multiple";
	/** Open at first render. A string, or several for `type: "multiple"`. */
	defaultValue?: string | readonly string[];
	/** `"single"` accordions can normally be closed entirely. */
	collapsible?: boolean;
	onValueChange?: (open: readonly string[]) => void;
	class?: Reactive<string>;
}

export const Accordion = component<AccordionProps>((props) => {
	const type = props.type ?? "single";
	const open = signal<readonly string[]>(normaliseInitial(props.defaultValue));
	const rootId = uid("accordion");

	function isOpen(value: string): boolean {
		return open().includes(value);
	}

	function toggle(value: string): void {
		const current = open();
		const next = nextOpenSet(current, value, type, props.collapsible !== false);
		open(next);
		props.onValueChange?.(next);
	}

	// Roving focus is attached after mount because it queries the container for
	// its items, and the container does not exist until then.
	let group: RovingFocus | undefined;
	onMount(() => {
		group = rovingFocus({
			container: () => document.getElementById(rootId),
			itemSelector: "[data-slot='accordion-trigger']",
			orientation: "vertical",
		});
		group.sync();
	});
	onUnmount(() => group?.destroy());

	provide<AccordionApi>(AccordionContext, { isOpen, toggle });

	return html`<div
		data-slot="accordion"
		id="${rootId}"
		class="${() => cn("flex w-full flex-col", read(props.class))}"
	>${props.children?.()}</div>`;
});

export interface AccordionItemProps {
	/** Stable key. Used for the open-state set and for the ARIA ids. */
	value: string;
	disabled?: boolean;
	class?: Reactive<string>;
	children?: Parts;
}

/**
 * One section.
 *
 * Provides a second context of its own, so the trigger and the panel inside it
 * share their ids without the caller repeating the value on each.
 */
export const AccordionItem = component<AccordionItemProps>((props) => {
	const accordion = inject(AccordionContext);
	const triggerId = uid("accordion-trigger");
	const panelId = uid("accordion-panel");
	const open = (): boolean => accordion.isOpen(props.value);

	provide<AccordionItemApi>(AccordionItemContext, {
		value: props.value,
		triggerId,
		panelId,
		disabled: props.disabled === true,
		open,
		toggle: () => accordion.toggle(props.value),
	});

	return html`<div
		data-slot="accordion-item"
		data-state="${() => (open() ? "open" : "closed")}"
		class="${() => cn("border-b last:border-b-0", read(props.class))}"
	>${props.children?.()}</div>`;
});

export interface AccordionTriggerProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const AccordionTrigger = component<AccordionTriggerProps>((props) => {
	const item = inject(AccordionItemContext);
	return html`<h3 class="flex"><button
			type="button"
			data-slot="accordion-trigger"
			data-nebula-item
			data-state="${() => (item.open() ? "open" : "closed")}"
			data-disabled="${item.disabled ? "" : undefined}"
			id="${item.triggerId}"
			aria-expanded="${() => (item.open() ? "true" : "false")}"
			aria-controls="${item.panelId}"
			?disabled="${item.disabled}"
			class="${() =>
				cn(
					"focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium outline-none transition-all hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
					read(props.class),
				)}"
			@click="${() => item.toggle()}"
		>${slot(props.children)}${ChevronDownIcon({
			class:
				"text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200",
		})}</button></h3>`;
});

export interface AccordionContentProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const AccordionContent = component<AccordionContentProps>((props) => {
	const item = inject(AccordionItemContext);
	return html`<div
		data-slot="accordion-content"
		id="${item.panelId}"
		role="region"
		data-state="${() => (item.open() ? "open" : "closed")}"
		aria-labelledby="${item.triggerId}"
		?inert="${() => !item.open()}"
		class="grid text-sm transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
		style="${() => `grid-template-rows: ${item.open() ? "1fr" : "0fr"}`}"
	><div class="overflow-hidden"><div
			class="${() => cn("pt-0 pb-4", read(props.class))}"
		>${slot(props.children)}</div></div></div>`;
});

function normaliseInitial(
	value: string | readonly string[] | undefined,
): readonly string[] {
	if (value === undefined) return [];
	return typeof value === "string" ? [value] : value;
}

/**
 * The open set after activating `value`.
 *
 * `collapsible: false` on a single accordion is what stops the last open
 * section from closing — the pattern used when one section must always be
 * showing, and the reason this is not simply a toggle.
 */
function nextOpenSet(
	current: readonly string[],
	value: string,
	type: "single" | "multiple",
	collapsible: boolean,
): readonly string[] {
	const isOpen = current.includes(value);

	if (type === "multiple") {
		return isOpen
			? current.filter((entry) => entry !== value)
			: [...current, value];
	}
	if (isOpen) return collapsible ? [] : current;
	return [value];
}
