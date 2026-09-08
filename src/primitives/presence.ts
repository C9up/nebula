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
	let deadline: ReturnType<typeof setTimeout> | undefined;

	function finishClose(): void {
		if (deadline !== undefined) {
			clearTimeout(deadline);
			deadline = undefined;
		}
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
		// The FIRST event used to end the close, so a surface running a fade and
		// a slide together was unmounted when the shorter one finished — the
		// other visibly cut off. Each declared name reports for itself, and the
		// close waits until none is outstanding.
		const name = reportedName(event);
		if (typeof name === "string" && outstanding.size > 0) {
			reportName(outstanding, name);
			if (outstanding.size > 0) return;
		}
		finishClose();
	}

	/** Declared animations and transitions still waiting to report. */
	let outstanding: Outstanding = new Map();

	/**
	 * Arm the wait for `el`'s exit, replacing whatever the last one armed.
	 *
	 * Overwriting `deadline` without clearing it left the older timer running:
	 * it fired mid-way through a LATER close and unmounted a surface that was
	 * still animating, cutting the exit off at the previous close's schedule.
	 */
	function armDeadline(el: HTMLElement): void {
		if (deadline !== undefined) clearTimeout(deadline);
		outstanding = declaredNames(el);
		deadline = setTimeout(finishClose, declaredDuration(el) + SAFETY_MARGIN_MS);
	}

	function detach(): void {
		if (deadline !== undefined) {
			clearTimeout(deadline);
			deadline = undefined;
		}
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
			// The close in progress is CANCELLED, not just un-pended. Clearing
			// `pendingUnmount` alone left its deadline armed and its names
			// outstanding, so the timer from a close the user had already undone
			// went on to unmount the NEXT one part-way through.
			pendingUnmount = false;
			if (deadline !== undefined) {
				clearTimeout(deadline);
				deadline = undefined;
			}
			outstanding.clear();
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
			if (!isAnimating(element)) {
				finishClose();
				return;
			}
			// The same deadline `onExitFinished` has, and for the same reason:
			// `animationend` is not promised by anything. Without it a declared
			// animation the browser never runs left this mounted for good —
			// `onExitFinished` was bounded and the public presence API was not.
			armDeadline(element);
		},

		attach(next: HTMLElement | null): void {
			const wasClosing = pendingUnmount;
			detach();
			element = next;
			if (element === null) {
				// Nothing left to wait for, and nothing to wait WITH: a close
				// still pending would otherwise never complete.
				if (wasClosing) finishClose();
				return;
			}
			if (wasClosing) {
				// `detach()` cleared the deadline. Handing over a new element
				// mid-close without arming another left the surface mounted for
				// good — the exact failure the deadline exists to prevent,
				// reintroduced by the handover.
				pendingUnmount = true;
				armDeadline(element);
			}
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

	// Which declared animations and transitions have yet to report. The FIRST
	// event used to end the wait, so a surface running a fade and a slide
	// together had its node removed when the shorter one finished and the other
	// was visibly cut off. `presence()` already waited for all of them; the
	// portalled surfaces — Dialog, Popover, Select, Tooltip — go through here
	// instead, and did not.
	const outstanding = declaredNames(element);

	function finish(event: AnimationEvent | TransitionEvent): void {
		// Bubbled events from children would cut the parent's exit short.
		if (event.target !== element) return;
		const name = reportedName(event);
		if (typeof name === "string" && outstanding.size > 0) {
			reportName(outstanding, name);
			if (outstanding.size > 0) return;
		}
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
function keyframesExist(doc: Document, name: string): boolean {
	const cache = cacheFor(doc);
	const cached = cache.get(name);
	if (cached !== undefined) return cached;

	let found = false;
	let readable = false;
	for (const sheet of Array.from(doc.styleSheets)) {
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
		if (containsKeyframes(rules, name)) {
			found = true;
			break;
		}
	}
	const answer = found || !readable;
	// Cached only when it was FOUND. A negative is re-checked, because a
	// stylesheet arriving later is exactly what turns it positive.
	if (answer) cache.set(name, true);
	return answer;
}

/**
 * Walk a rule list, descending into group rules.
 *
 * `@keyframes` inside `@media`, `@supports` or `@layer` is a nested rule, not a
 * top-level one — a flat scan of the sheet reported it missing and the caller
 * concluded the stylesheet was absent.
 */
function containsKeyframes(rules: CSSRuleList, name: string): boolean {
	for (const rule of Array.from(rules)) {
		if (isKeyframesNamed(rule, name)) return true;
		// `cssRules` on a group rule (media, supports, layer); absent on others.
		const nested = Reflect.get(rule, "cssRules");
		if (
			nested !== null &&
			typeof nested === "object" &&
			typeof Reflect.get(nested, "length") === "number" &&
			containsKeyframes(nested as CSSRuleList, name)
		) {
			return true;
		}
	}
	return false;
}

/**
 * Are all the animations this element declares actually defined?
 *
 * `animation-name` is a LIST: `fade-out, slide-out` is two names, and looking
 * the whole string up as one found nothing and reported both missing. Every
 * name has to resolve, because waiting on any undefined one is what strands the
 * node.
 */
function splitNames(animationName: string): string[] {
	return animationName
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part !== "" && part !== "none");
}

/** Which of the declared animations have no `@keyframes` anywhere. */
function undefinedKeyframes(doc: Document, animationName: string): string[] {
	return splitNames(animationName).filter((name) => !keyframesExist(doc, name));
}

/**
 * Per-DOCUMENT memo, invalidated when the stylesheets change.
 *
 * A single global map was wrong three ways. An answer cached before the
 * stylesheet finished loading stayed wrong for the life of the page; an iframe
 * and its parent share neither styles nor documents but shared the cache; and
 * nothing ever expired, so a sheet added later never took effect.
 *
 * Keyed on the document and on how many sheets it had when the answer was
 * computed: a new stylesheet changes the count and the answers are recomputed.
 * A `WeakMap` so a detached document does not keep its cache alive.
 */
const KEYFRAME_CACHE = new WeakMap<Document, Map<string, boolean>>();

/**
 * The memo for this document.
 *
 * Only POSITIVE answers are kept. A "found" is durable — keyframes do not
 * usually disappear — while a "missing" is exactly the answer a later
 * stylesheet can change, and keying on the sheet COUNT missed every way that
 * happens without one being added: `insertRule`, `replaceSync`, HMR, or editing
 * an existing `<style>`. Re-walking on a negative costs a scan only when
 * something is already wrong.
 */
function cacheFor(doc: Document): Map<string, boolean> {
	const existing = KEYFRAME_CACHE.get(doc);
	if (existing !== undefined) return existing;
	const answers = new Map<string, boolean>();
	KEYFRAME_CACHE.set(doc, answers);
	return answers;
}

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

/**
 * Every animation name and transition property the element declares.
 *
 * What the close waits on. `animationend` and `transitionend` each name what
 * finished, so a surface running two of them at once is only done when both
 * have reported — waiting for the first cut the longer one off mid-flight.
 */
/**
 * What is still expected to report, COUNTED.
 *
 * `animation-name: a, a` with two different durations is two animations, and a
 * plain set of names collapsed them into one: the first `animationend("a")`
 * emptied it and the node went away while the longer one was still running.
 */
type Outstanding = Map<string, number>;

/** Mark one report against `name`, if it is one we are waiting for. */
function reportName(outstanding: Outstanding, name: string): void {
	const left = outstanding.get(name);
	if (left === undefined) return;
	if (left <= 1) outstanding.delete(name);
	else outstanding.set(name, left - 1);
}

/**
 * Which animation or transition an end event is reporting for.
 *
 * `undefined` when the event carries neither — jsdom's plain `Event`, and any
 * synthetic one — in which case the caller falls back to treating it as the end
 * of the whole exit.
 */
function reportedName(
	event: AnimationEvent | TransitionEvent,
): string | undefined {
	if ("animationName" in event) return event.animationName;
	if ("propertyName" in event) return event.propertyName;
	return undefined;
}

function declaredNames(element: HTMLElement): Outstanding {
	const names: Outstanding = new Map();
	if (typeof getComputedStyle !== "function") return names;
	const style = getComputedStyle(element);
	const add = (list: string): void => {
		for (const part of list.split(",")) {
			const name = part.trim();
			if (name !== "" && name !== "none" && name !== "all") {
				names.set(name, (names.get(name) ?? 0) + 1);
			}
		}
	};
	add(style.animationName);
	if (parseDuration(style.transitionDuration) > 0) {
		add(style.transitionProperty);
	}
	return names;
}

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
		// ANY defined animation is a reason to wait: refusing because a second
		// one is missing truncated the first, which was running perfectly well.
		// The missing ones are still named, because they are still a mistake.
		const missing = undefinedKeyframes(element.ownerDocument, declared);
		if (missing.length < splitNames(declared).length) {
			for (const name of missing) warnMissingKeyframes(name);
			return true;
		}
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
