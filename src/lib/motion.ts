/**
 * Enter and exit animations for overlays.
 *
 * These are shadcn's own class strings, verbatim, and they come from the same
 * place shadcn's do: `tw-animate-css`, which registers `animate-in` /
 * `animate-out` and the `fade-*` / `zoom-*` / `slide-*` modifiers through
 * `@theme inline` and `@utility`.
 *
 * nebula used to declare four bespoke keyframes and reference them through
 * ARBITRARY animation values (`animate-[nebula-zoom-out_120ms_ease-in]`), to
 * avoid the plugin. That is what made a missing stylesheet fatal rather than
 * cosmetic: Tailwind compiles an arbitrary value unconditionally, so the
 * `animation` property was always set while the keyframes behind it might exist
 * nowhere — the browser then never fires `animationend` and every closed
 * overlay stays in the document. With a theme-registered utility the class
 * simply is not emitted when the theme is absent, the element animates not at
 * all, and closing is instant. That is the whole reason upstream registers
 * rather than inlines, and it is why the deviation is gone.
 *
 * The durations are shadcn's too, which means asymmetric by way of the sheet
 * variants only; everything else takes `tw-animate-css`'s defaults.
 */

import type { Side } from "../primitives/floating.js";

/**
 * Popovers, menus, selects — scale up from the anchor.
 *
 * shadcn's dialog and popover string. `motion-reduce:animate-none` is ours and
 * stays: it also makes `onExitFinished` see no animation and remove the node at
 * once, so reduced motion gets an instant close with no branch in the component.
 */
export const zoomInOut =
	"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 motion-reduce:animate-none";

/** Backdrops and tooltips — no movement, just opacity. */
export const fadeInOut =
	"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none";

/**
 * Panels that slide in from an edge — Sheet, Drawer.
 *
 * The transform is a utility pair rather than a keyframe, because the distance
 * depends on the panel's own size and only `translate-x-full` knows that.
 */
export function slideFrom(side: Side): string {
	// shadcn's sheet: a slide utility per side, and its asymmetric durations —
	// entering is slower than leaving, because a surface appearing wants to be
	// noticed while one dismissed wants to be out of the way.
	const slide = `data-[state=open]:slide-in-from-${side} data-[state=closed]:slide-out-to-${side}`;
	return `data-[state=open]:animate-in data-[state=closed]:animate-out ${slide} data-[state=open]:duration-500 data-[state=closed]:duration-300 motion-reduce:animate-none`;
}
