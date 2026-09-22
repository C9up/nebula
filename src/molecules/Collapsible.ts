/**
 * Collapsible — a trigger that shows and hides a panel.
 *
 *   Collapsible({ children: () => html`
 *     ${CollapsibleTrigger({ children: "Show more" })}
 *     ${CollapsibleContent({ children: "…" })}
 *   ` })
 *
 * One deviation from upstream remains, and it is the animation. Radix measures
 * the content and publishes its height as
 * `--radix-collapsible-content-height` for the keyframes to interpolate,
 * because `height: auto` is not animatable. A CSS grid whose single row goes
 * from `0fr` to `1fr` animates the same transition with no measurement, no
 * resize observer, and no stale height when the content changes while closed.
 *
 * The closed panel stays in the DOM — that is what makes the transition
 * possible — so it is marked `inert`. Without it the panel keeps its tab stops
 * and stays in the accessibility tree, and a keyboard user tabs into content
 * that is not on screen.
 */

import { component, createContext, html, inject, provide } from "@c9up/aurora";
import type { Parts, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { type Reactive, read, readOr } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";

interface CollapsibleApi {
	readonly triggerId: string;
	readonly contentId: string;
	readonly open: () => boolean;
	readonly disabled: () => boolean;
	toggle(): void;
}

const CollapsibleContext = createContext<CollapsibleApi>("Collapsible");

export interface CollapsibleProps {
	open?: Reactive<boolean>;
	defaultOpen?: boolean;
	disabled?: Reactive<boolean>;
	onOpenChange?: (open: boolean) => void;
	class?: Reactive<string>;
	children?: Parts;
}

export const Collapsible = component<CollapsibleProps>((props) => {
	const state = controllable<boolean>({
		value: props.open,
		initial: props.defaultOpen ?? false,
		onChange: props.onOpenChange,
	});

	const contentId = uid("collapsible-content");
	const triggerId = uid("collapsible-trigger");

	provide<CollapsibleApi>(CollapsibleContext, {
		triggerId,
		contentId,
		open: () => state.current(),
		disabled: () => readOr(props.disabled, false),
		toggle() {
			if (readOr(props.disabled, false)) return;
			state.set(!state.current());
		},
	});

	return html`<div
		data-slot="collapsible"
		data-state="${() => (state.current() ? "open" : "closed")}"
		class="${() => cn("flex flex-col", read(props.class))}"
	>${props.children?.()}</div>`;
});

export interface CollapsibleTriggerProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const CollapsibleTrigger = component<CollapsibleTriggerProps>(
	(props) => {
		const collapsible = inject(CollapsibleContext);
		return html`<button
			type="button"
			data-slot="collapsible-trigger"
			id="${collapsible.triggerId}"
			data-state="${() => (collapsible.open() ? "open" : "closed")}"
			aria-expanded="${() => (collapsible.open() ? "true" : "false")}"
			aria-controls="${collapsible.contentId}"
			?disabled="${() => collapsible.disabled()}"
			class="${() =>
				cn(
					"flex items-center justify-between gap-2 outline-none disabled:opacity-50",
					read(props.class),
				)}"
			@click="${() => collapsible.toggle()}"
		>${slot(props.children)}</button>`;
	},
);

export interface CollapsibleContentProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const CollapsibleContent = component<CollapsibleContentProps>(
	(props) => {
		const collapsible = inject(CollapsibleContext);
		return html`<div
			data-slot="collapsible-content"
			id="${collapsible.contentId}"
			role="region"
			data-state="${() => (collapsible.open() ? "open" : "closed")}"
			aria-labelledby="${collapsible.triggerId}"
			?inert="${() => !collapsible.open()}"
			class="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
			style="${() =>
				`grid-template-rows: ${collapsible.open() ? "1fr" : "0fr"}`}"
		><div class="${() => cn("overflow-hidden", read(props.class))}">${slot(
			props.children,
		)}</div></div>`;
	},
);
