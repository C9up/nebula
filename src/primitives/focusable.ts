/// <reference lib="dom" />
/**
 * Which elements can take focus.
 *
 * The focus trap, the roving-focus groups and every overlay that restores
 * focus on close all need the same answer, and getting it slightly different
 * in each place is how keyboard navigation rots. One implementation here.
 *
 * The selector is the standard tabbable set, but a selector alone is not the
 * answer: it matches nodes that are disabled, `inert`, hidden by CSS, or
 * inside a collapsed `<details>`. Those have to be filtered by asking the
 * layout engine, which is why `isVisible` reads `offsetParent` and computed
 * styles rather than trusting the markup.
 */

const FOCUSABLE_SELECTOR = [
	"a[href]",
	"area[href]",
	"button:not([disabled])",
	"input:not([disabled]):not([type='hidden'])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"iframe",
	"object",
	"embed",
	"audio[controls]",
	"video[controls]",
	"summary",
	"[contenteditable]:not([contenteditable='false'])",
	"[tabindex]",
].join(",");

/**
 * Is the element rendered and interactive right now?
 *
 * `offsetParent` is a layout answer, and only a real layout engine has one to
 * give. An element there is positive proof that this node is rendered, so it
 * stays the cheap fast path. Its *absence* proves nothing: a browser reports
 * null for `position: fixed` nodes and for `<body>`, and a headless DOM has no
 * layout at all — jsdom answers null for every element alike, happy-dom does
 * not implement the property. Reading that absence as "hidden" is what makes
 * the check fall through to the styles instead of answering from it.
 *
 * The fallback walks the ancestors because `display` does not inherit: a node
 * with `display: block` inside a `display: none` container is still not
 * rendered. `visibility` does inherit, so the element's own value settles it.
 */
export function isVisible(el: HTMLElement): boolean {
	if (el.hasAttribute("inert")) return false;
	if (el.closest("[inert]") !== null) return false;

	if (el.offsetParent instanceof Element) return true;

	const own = getComputedStyle(el);
	if (own.visibility === "hidden" || own.visibility === "collapse")
		return false;

	for (
		let node: HTMLElement | null = el;
		node !== null;
		node = node.parentElement
	) {
		if (getComputedStyle(node).display === "none") return false;
	}
	return true;
}

/**
 * Can this element receive focus via the keyboard?
 *
 * Focusability is decided from the selector match plus the `tabindex`
 * *attribute* — deliberately not the `tabIndex` property. The property is
 * derived: a browser reports `0` for a native `<button>` that never declared
 * one, and DOM implementations disagree about which elements get that
 * treatment. Reading the attribute asks what the markup actually says, and
 * "natively focusable unless it opted out" is then a rule this function states
 * rather than one it inherits from whichever DOM it is running in.
 */
export function isFocusable(el: Element): el is HTMLElement {
	if (!(el instanceof HTMLElement)) return false;
	if (!el.matches(FOCUSABLE_SELECTOR)) return false;
	if (el.hasAttribute("disabled")) return false;
	if (el.getAttribute("aria-hidden") === "true") return false;

	const declared = el.getAttribute("tabindex");
	if (declared !== null && Number.parseInt(declared, 10) < 0) return false;

	return isVisible(el);
}

/**
 * Every focusable descendant of `root`, in tab order.
 *
 * Document order is returned as-is. Honouring positive `tabindex` values would
 * mean a second sort, and nebula never emits one — a positive tabindex breaks
 * the tab order of the whole page, so the library treats its presence in host
 * markup as the host's problem rather than reordering around it.
 */
export function focusableWithin(root: ParentNode): HTMLElement[] {
	const found: HTMLElement[] = [];
	for (const candidate of root.querySelectorAll(FOCUSABLE_SELECTOR)) {
		if (isFocusable(candidate)) found.push(candidate);
	}
	return found;
}

/** First focusable descendant, or `null` when the subtree has none. */
export function firstFocusable(root: ParentNode): HTMLElement | null {
	for (const candidate of root.querySelectorAll(FOCUSABLE_SELECTOR)) {
		if (isFocusable(candidate)) return candidate;
	}
	return null;
}

/**
 * Focus an element without scrolling the page to it.
 *
 * Overlays position themselves; letting the browser scroll to the newly
 * focused node fights that positioning and visibly jumps the page.
 */
export function focusSilently(el: HTMLElement | null | undefined): void {
	el?.focus({ preventScroll: true });
}
