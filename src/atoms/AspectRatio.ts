/**
 * AspectRatio — hold a box at a fixed width-to-height ratio.
 *
 * The ratio is arbitrary, so it cannot be a utility class, and it cannot be a
 * `style` attribute either: a Content-Security-Policy without `'unsafe-inline'`
 * blocks those. A `.style` property passes the policy, but the server does not
 * write properties, and the box would collapse until hydration.
 *
 * So the box takes its height from an empty SVG whose `viewBox` carries the
 * ratio: an `<svg>` at full width and automatic height is as tall as its
 * viewBox says, and a `viewBox` is an attribute the policy does not touch. The
 * content sits over it, absolutely positioned — Radix's own structure, with the
 * SVG in place of its padding trick.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read, readOr } from "../lib/props.js";

export interface AspectRatioProps {
	children?: Slot;
	/** Width divided by height. `16 / 9` for widescreen, `1` for a square. */
	ratio?: Reactive<number>;
	class?: Reactive<string>;
}

export const AspectRatio = component<AspectRatioProps>((props) => {
	/** A ratio that is not a positive finite number would make no box at all. */
	const ratio = (): number => {
		const given = readOr(props.ratio, 1);
		return Number.isFinite(given) && given > 0 ? given : 1;
	};
	return html`<div
		data-slot="aspect-ratio"
		class="${() => cn("relative w-full", read(props.class))}"
	><svg
			aria-hidden="true"
			focusable="false"
			viewBox="${() => `0 0 ${ratio()} 1`}"
			class="block h-auto w-full"
		></svg><div class="absolute inset-0">${slot(props.children)}</div></div>`;
});
