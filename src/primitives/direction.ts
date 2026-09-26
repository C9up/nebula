/// <reference lib="dom" />
/**
 * Reading direction — the one place that answers "which way is forward?".
 *
 * Radix ships a `DirectionProvider` and threads the answer through React
 * context. Aurora has a context, but a provider would be the wrong mechanism
 * here: the direction is already on the page. `<html dir="rtl">`, a `dir`
 * attribute on one panel, a stylesheet setting `direction` — all of them are
 * answered by the computed style, and none of them requires the application to
 * remember to wrap anything. A provider would be a second source of truth that
 * silently disagrees with the first.
 *
 * The distinction that matters to callers is PHYSICAL versus LOGICAL. An arrow
 * key is physical: ArrowRight means the key to the right, always. "The next
 * item" is logical, and in a right-to-left list the next item is to the LEFT.
 * `forward()` converts one into the other, and is the whole of this module's
 * job.
 */

export type Direction = "ltr" | "rtl";

/**
 * The direction this element is laid out in.
 *
 * The computed style rather than the `dir` attribute, so an element inheriting
 * from `<html dir="rtl">` answers correctly without every anchor carrying the
 * attribute itself. `ltr` wherever there is no layout to ask — a server
 * render, a jsdom without styles — which is also the correct default.
 */
export function directionOf(element: Element | null | undefined): Direction {
	if (element === null || element === undefined) return "ltr";
	if (typeof getComputedStyle !== "function") return "ltr";
	try {
		return getComputedStyle(element).direction === "rtl" ? "rtl" : "ltr";
	} catch {
		// A detached node in some environments. Not a reason to fail a keypress.
		return "ltr";
	}
}

/** Shorthand for the check that reads better at a call site than `=== "rtl"`. */
export function isRightToLeft(element: Element | null | undefined): boolean {
	return directionOf(element) === "rtl";
}

/**
 * Which way a horizontal arrow key actually moves.
 *
 * `+1` for the next item, `-1` for the previous. ArrowRight is `+1` in a
 * left-to-right widget and `-1` in a right-to-left one — that mirroring is the
 * entire reason this exists, and getting it wrong makes every menu, tab list
 * and toolbar navigate backwards for half the world's readers.
 */
export function forward(
	key: "ArrowLeft" | "ArrowRight",
	element: Element | null | undefined,
): -1 | 1 {
	const rightIsForward = !isRightToLeft(element);
	if (key === "ArrowRight") return rightIsForward ? 1 : -1;
	return rightIsForward ? -1 : 1;
}
