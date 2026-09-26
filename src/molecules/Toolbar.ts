/**
 * Toolbar — a row of controls that behaves as one tab stop.
 *
 * Radix ships this as a primitive and shadcn styles no equivalent, which is
 * why it is easy to miss: a page builds a `<div class="flex gap-2">` full of
 * buttons and it looks right. What it is not is navigable. Eleven buttons in a
 * formatting bar are eleven presses of Tab to get past, and a keyboard user
 * reaching the content below pays for every one of them.
 *
 * The WAI-ARIA toolbar pattern says: one tab stop, arrows move inside it. That
 * is `rovingFocus`, which nebula already owns for menus and tab lists — the
 * only thing a toolbar adds is `role="toolbar"`, the orientation, and a
 * separator that is announced as one.
 *
 * The items are whatever the caller puts in — `Button`, `Toggle`, a `Select`
 * trigger, a plain `<a>` — found by the same tabbable selector the focus trap
 * uses. No marker attribute to remember: a control that a keyboard could
 * reach on its own is a control the arrows reach here, and one that could not
 * was never in the tab order to begin with.
 */

import { component, html, onMount, onUnmount, uid } from "@c9up/aurora";
import { Button, type ButtonProps } from "../atoms/Button.js";
import { Separator } from "../atoms/Separator.js";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read } from "../lib/props.js";
import { FOCUSABLE_SELECTOR } from "../primitives/focusable.js";
import { type RovingFocus, rovingFocus } from "../primitives/rovingFocus.js";

export interface ToolbarProps {
	children?: Slot;
	/** Which arrows move focus. Default `"horizontal"`, as a toolbar reads. */
	orientation?: "horizontal" | "vertical";
	/** Wrap from the last control back to the first. Default `true`. */
	loop?: boolean;
	/** Announced name — a page with two toolbars needs to tell them apart. */
	label?: Reactive<string>;
	class?: Reactive<string>;
}

export const Toolbar = component<ToolbarProps>((props) => {
	const orientation = props.orientation ?? "horizontal";
	const barId = uid("toolbar");
	let group: RovingFocus | undefined;

	onMount(() => {
		group = rovingFocus({
			container: () => document.getElementById(barId),
			itemSelector: FOCUSABLE_SELECTOR,
			orientation,
			loop: props.loop !== false,
		});
		// The controls exist by now; without this none of them carries
		// `tabindex="0"` and the bar cannot be reached by Tab at all.
		group.sync();
	});
	onUnmount(() => group?.destroy());

	return html`<div
		data-slot="toolbar"
		id="${barId}"
		role="toolbar"
		aria-orientation="${orientation}"
		aria-label="${() => read(props.label) ?? ""}"
		class="${() =>
			cn(
				"flex items-center gap-1",
				orientation === "vertical" ? "flex-col" : "flex-row",
				read(props.class),
			)}"
	>${slot(props.children)}</div>`;
});

export interface ToolbarButtonProps extends ButtonProps {}

/**
 * A control inside the bar.
 *
 * `Button` with the defaults a toolbar wants — ghost, small — so a row of them
 * reads as a bar rather than as six primary actions competing for attention.
 * Nothing else: a plain `Button` dropped in the bar navigates identically,
 * which is the point of finding items by focusability.
 */
export const ToolbarButton = component<ToolbarButtonProps>((props) =>
	Button({ variant: "ghost", size: "sm", ...props }),
);

export interface ToolbarSeparatorProps {
	class?: Reactive<string>;
}

/** A boundary between groups of controls, announced as one. */
export const ToolbarSeparator = component<ToolbarSeparatorProps>((props) => {
	return Separator({
		orientation: "vertical",
		decorative: false,
		class: () => cn("mx-1 h-6 self-center", read(props.class)),
	});
});
