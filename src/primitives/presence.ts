/// <reference lib="dom" />
/**
 * Presence — keep a node mounted until its exit animation has finished.
 *
 * Closing an overlay by removing it from the DOM cancels any exit animation:
 * the node is gone before the first frame plays. Radix solves this with a
 * `Presence` wrapper, and shadcn's markup depends on it — the `data-[state=
 * closed]:animate-out` utilities on every overlay assume something is holding
 * the node on screen while that animation runs.
 *
 * `presence()` owns a `state` signal that leads the DOM: it flips to `closed`
 * immediately so the exit animation can start, and only reports `mounted`
 * false once the animation ends. A surface with no animation unmounts on the
 * next tick, so the abstraction costs nothing when unused.
 */

import { type ReadSignal, signal } from "@c9up/aurora";

export type PresenceState = "open" | "closed";

export interface Presence {
	/** Should the node be in the DOM right now? */
	readonly mounted: ReadSignal<boolean>;
	/** The value for `data-state` — drives the enter/exit utility classes. */
	readonly state: ReadSignal<PresenceState>;
	/** Show the node. Cancels a pending unmount. */
	open(): void;
	/** Start the exit animation. Unmount follows when it finishes. */
	close(): void;
	/**
	 * Hand over the element once it is live. Presence watches it for the end of
	 * the exit animation; until it is given one, close() unmounts immediately.
	 */
	attach(element: HTMLElement | null): void;
	/** Drop listeners and timers. */
	dispose(): void;
}

export function presence(initiallyOpen = false): Presence {
	const mounted = signal(initiallyOpen);
	const state = signal<PresenceState>(initiallyOpen ? "open" : "closed");

	let element: HTMLElement | null = null;
	let pendingUnmount = false;

	function finishClose(): void {
		if (!pendingUnmount) return;
		pendingUnmount = false;
		mounted(false);
	}

	/**
	 * The animation is only ours if it played on the surface itself.
	 *
	 * Events bubble, so a child's animation would otherwise unmount the parent
	 * mid-flight — a spinner inside a closing dialog is enough to trigger it.
	 */
	function onAnimationEnd(event: AnimationEvent | TransitionEvent): void {
		if (event.target !== element) return;
		finishClose();
	}

	function detach(): void {
		if (element === null) return;
		element.removeEventListener("animationend", onAnimationEnd);
		element.removeEventListener("animationcancel", onAnimationEnd);
		element.removeEventListener("transitionend", onAnimationEnd);
		element.removeEventListener("transitioncancel", onAnimationEnd);
		element = null;
	}

	return {
		mounted,
		state,

		open(): void {
			pendingUnmount = false;
			mounted(true);
			state("open");
		},

		close(): void {
			if (!mounted()) return;
			state("closed");

			// No element yet means nothing can be animating — unmount now rather
			// than waiting for an event that will never arrive.
			if (element === null) {
				mounted(false);
				return;
			}

			pendingUnmount = true;
			if (!isAnimating(element)) finishClose();
		},

		attach(next: HTMLElement | null): void {
			detach();
			element = next;
			if (element === null) return;
			element.addEventListener("animationend", onAnimationEnd);
			element.addEventListener("animationcancel", onAnimationEnd);
			element.addEventListener("transitionend", onAnimationEnd);
			element.addEventListener("transitioncancel", onAnimationEnd);
		},

		dispose(): void {
			pendingUnmount = false;
			detach();
		},
	};
}

/**
 * Run `done` once the element's exit animation finishes, or immediately when
 * there is none. Returns a cancel function.
 *
 * The portalled surfaces do not use `presence()` — they own their own mounting
 * through `portal()`, so a second `mounted` signal would just be a shadow of
 * the portal's own lifetime. What they do need is this: the answer to "may I
 * remove the node yet". Call it *after* flipping `data-state` to `closed`, so
 * the computed style already reflects the closing rules.
 */
export function onExitFinished(
	element: HTMLElement,
	done: () => void,
): () => void {
	if (!isAnimating(element)) {
		done();
		return () => {};
	}

	function finish(event: AnimationEvent | TransitionEvent): void {
		// Bubbled events from children would cut the parent's exit short.
		if (event.target !== element) return;
		cancel();
		done();
	}

	function cancel(): void {
		if (safety !== undefined) clearTimeout(safety);
		element.removeEventListener("animationend", finish);
		element.removeEventListener("animationcancel", finish);
		element.removeEventListener("transitionend", finish);
		element.removeEventListener("transitioncancel", finish);
	}

	// A deadline, because `animationName` is a DECLARATION, not a promise.
	//
	// The computed style reads back the declared name whether or not those
	// keyframes exist anywhere — an application that has not imported the
	// stylesheet, or that scopes it away, declares an animation the browser
	// will never run. `animationend` then never fires, `done()` never runs, and
	// the node stays in the document: every closed Dialog, Select, Popover and
	// Tooltip piles up as an invisible layer swallowing the clicks underneath.
	//
	// That turns a missing stylesheet — cosmetic — into a page that stops
	// responding, which reads as "the floating layer does not work".
	const safety = setTimeout(() => {
		cancel();
		done();
	}, declaredDuration(element) + SAFETY_MARGIN_MS);

	element.addEventListener("animationend", finish);
	element.addEventListener("animationcancel", finish);
	element.addEventListener("transitionend", finish);
	element.addEventListener("transitioncancel", finish);
	return cancel;
}

/**
 * Is an exit animation actually running?
 *
 * Read after `data-state` has flipped, so the computed style already reflects
 * the closing rules. `animationName: none` and a zero transition duration both
 * mean there is nothing to wait for, and waiting anyway would strand the node
 * in the DOM forever — the failure mode this check exists to prevent.
 */
/**
 * Slack added to the declared duration before the deadline fires.
 *
 * Long enough that a real animation always wins the race — the listener is what
 * should end the wait — and short enough that a stuck overlay clears within a
 * frame or two of when it should have.
 */
const SAFETY_MARGIN_MS = 100;

/**
 * How long the element SAYS its exit lasts: the longest declared animation or
 * transition, plus its delay. Capped, because a stylesheet is free to declare
 * minutes and the deadline exists to bound the wait, not to honour it.
 */
function declaredDuration(element: HTMLElement): number {
	if (typeof getComputedStyle !== "function") return 0;
	const style = getComputedStyle(element);
	const animation =
		parseDuration(style.animationDuration) +
		parseDuration(style.animationDelay);
	const transition =
		parseDuration(style.transitionDuration) +
		parseDuration(style.transitionDelay);
	return Math.min(Math.max(animation, transition), 5000);
}

/**
 * Is a `@keyframes` of this name defined anywhere in the document?
 *
 * `animationName` is a DECLARATION. It reads back whatever the stylesheet said,
 * whether or not the keyframes behind it exist — so an application that has not
 * imported nebula's stylesheet declares animations the browser will never run,
 * and the only honest answer comes from looking for the rule itself.
 *
 * Answers `true` when it cannot tell. A cross-origin stylesheet throws on
 * `cssRules`, and refusing to animate because a font sheet was unreadable would
 * be a worse trade than waiting: the deadline in `onExitFinished` already bounds
 * the cost of being wrong here.
 */
function keyframesExist(name: string): boolean {
	const cached = KEYFRAME_CACHE.get(name);
	if (cached !== undefined) return cached;

	let found = false;
	let readable = false;
	for (const sheet of Array.from(document.styleSheets)) {
		let rules: CSSRuleList;
		try {
			const own = sheet.cssRules;
			if (own === null) continue;
			rules = own;
		} catch {
			// Cross-origin: not ours to read, and not evidence of anything.
			continue;
		}
		readable = true;
		for (const rule of Array.from(rules)) {
			if (isKeyframesNamed(rule, name)) {
				found = true;
				break;
			}
		}
		if (found) break;
	}
	const answer = found || !readable;
	KEYFRAME_CACHE.set(name, answer);
	return answer;
}

/** Per-document memo: this walks every rule, and it is asked on every close. */
const KEYFRAME_CACHE = new Map<string, boolean>();

function isKeyframesNamed(rule: CSSRule, name: string): boolean {
	// `instanceof CSSKeyframesRule` is unreliable across documents (an iframe
	// has its own constructors), so the shape is checked instead.
	const named = Reflect.get(rule, "name");
	return typeof named === "string" && named === name;
}

/**
 * Say once that the stylesheet is missing, and what to do about it.
 *
 * The symptom without this is not "my overlays do not animate" — which would
 * point straight at a missing sheet — but "the floating layer behaves oddly",
 * which points everywhere else. Warned rather than thrown: a missing stylesheet
 * is a cosmetic dependency, and taking an application down over one is a worse
 * trade than a line in the console.
 */
function warnMissingKeyframes(name: string): void {
	if (WARNED.has(name)) return;
	WARNED.add(name);
	console.warn(
		`[nebula] the animation '${name}' is declared but its @keyframes are defined nowhere, so this element closes without animating. Overlay animations come from tw-animate-css (UnoCSS: unocss-preset-animations) — check your stylesheet imports it, or generate one with \`nebula init\`.`,
	);
}

const WARNED = new Set<string>();

function isAnimating(element: HTMLElement): boolean {
	if (typeof getComputedStyle !== "function") return false;

	const style = getComputedStyle(element);
	const declared = style.animationName;
	const hasAnimation = declared !== "" && declared !== "none";
	if (hasAnimation) {
		// Declared is not the same as defined. Waiting on an animation whose
		// keyframes exist nowhere is what left every closed overlay in the
		// document; the deadline now bounds that, but there is no reason to
		// wait at all when the answer is knowable — and every reason to say so.
		if (keyframesExist(declared)) return true;
		warnMissingKeyframes(declared);
		return parseDuration(style.transitionDuration) > 0;
	}

	return parseDuration(style.transitionDuration) > 0;
}

/** Longest duration in a comma-separated CSS time list, in milliseconds. */
function parseDuration(value: string): number {
	let longest = 0;
	for (const part of value.split(",")) {
		const trimmed = part.trim();
		if (trimmed === "") continue;
		const numeric = Number.parseFloat(trimmed);
		if (Number.isNaN(numeric)) continue;
		const ms = trimmed.endsWith("ms") ? numeric : numeric * 1000;
		if (ms > longest) longest = ms;
	}
	return longest;
}
