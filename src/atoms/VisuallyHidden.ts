/**
 * VisuallyHidden — text for a screen reader and nothing else.
 *
 * Not `display: none`, which removes it from the accessibility tree as well,
 * and not `opacity: 0`, which keeps it taking space. The clip rectangle is the
 * one technique that leaves the node announced and unrendered, and it is
 * fiddly enough that hand-writing it in each component is how one of them ends
 * up subtly wrong.
 *
 * Its main job is the label a sighted user does not need: a dialog whose title
 * is a logo, an icon button, a table caption. `aria-label` covers some of
 * those, but not the ones where the content is real markup — a heading that a
 * `aria-labelledby` has to point at, for instance.
 *
 * `focusable` keeps it hidden until it is tabbed to, which is what a skip link
 * needs: invisible in the layout, and visible the moment it has focus.
 *
 * Always a `<span>`. Radix takes an `asChild` here so a hidden heading can be
 * a real `<h2>`; aurora's template parser fixes the tag at compile time, so
 * the equivalent is to put this inside the heading rather than to become one.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read } from "../lib/props.js";

export interface VisuallyHiddenProps {
	children?: Slot;
	/** Reveal it once focused — for a skip link. Default `false`. */
	focusable?: boolean;
	class?: Reactive<string>;
}

/** Tailwind's own `sr-only`, plus its counterpart for the focusable case. */
const HIDDEN = "sr-only";
const FOCUSABLE = "sr-only focus-within:not-sr-only focus:not-sr-only";

export const VisuallyHidden = component<VisuallyHiddenProps>((props) => {
	const base = props.focusable === true ? FOCUSABLE : HIDDEN;
	return html`<span
		data-slot="visually-hidden"
		class="${() => cn(base, read(props.class))}"
	>${slot(props.children)}</span>`;
});
