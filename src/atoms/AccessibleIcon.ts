/**
 * AccessibleIcon — an icon with a name only a screen reader hears.
 *
 * An icon on its own is a picture of a word. Sighted users read the picture;
 * a screen reader reads nothing at all, because an `<svg>` with no label is
 * announced as nothing — which is how a delete button becomes an unlabelled
 * button in the middle of a row of unlabelled buttons.
 *
 * Two halves, and both matter. The icon is marked `aria-hidden` so its own
 * internals — a `<title>`, a stray `<text>` — are not announced on top of the
 * label; the label is visually hidden text beside it. `aria-label` on the
 * parent would do for a plain string, but it does not survive translation
 * tooling the way real text does, and it cannot carry markup.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read } from "../lib/props.js";
import { VisuallyHidden } from "./VisuallyHidden.js";

export interface AccessibleIconProps {
	/** The icon. Hidden from the accessibility tree. */
	children?: Slot;
	/** What the icon means, in words. */
	label: Reactive<string>;
	class?: Reactive<string>;
}

export const AccessibleIcon = component<AccessibleIconProps>((props) => {
	return html`<span
		data-slot="accessible-icon"
		class="${() => cn("contents", read(props.class))}"
	><span aria-hidden="true" class="contents">${slot(props.children)}</span>${VisuallyHidden(
		{
			children: () => read(props.label),
		},
	)}</span>`;
});
