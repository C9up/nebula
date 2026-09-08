/**
 * A declared animation is not a promise that one will run.
 *
 * `animationName` reads back whatever the stylesheet declared — the keyframes
 * behind it may not exist anywhere. `onExitFinished` then waited for an
 * `animationend` the browser would never fire, `done()` never ran, and the node
 * stayed in the document. Every closed overlay piled up as an invisible layer
 * swallowing the clicks underneath, which reads as "the floating layer does not
 * work" rather than "a stylesheet is missing".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onExitFinished, presence } from "../../src/primitives/presence.js";

let element: HTMLElement;

beforeEach(() => {
	vi.useFakeTimers();
	element = document.createElement("div");
	document.body.appendChild(element);
});
afterEach(() => {
	vi.useRealTimers();
	element.remove();
});

/** Declare an animation whose keyframes do not exist. */
function declareMissingAnimation(): void {
	vi.spyOn(window, "getComputedStyle").mockReturnValue({
		animationName: "exit",
		animationDuration: "120ms",
		animationDelay: "0s",
		transitionDuration: "0s",
		transitionDelay: "0s",
	} as unknown as CSSStyleDeclaration);
}

describe("nebula > onExitFinished never strands a node", () => {
	it("finishes on the deadline when the animation never runs", () => {
		declareMissingAnimation();
		const done = vi.fn();

		onExitFinished(element, done);
		expect(done).not.toHaveBeenCalled();

		// Past the declared 120ms plus the margin.
		vi.advanceTimersByTime(500);

		expect(done).toHaveBeenCalledTimes(1);
	});

	it("lets a real animationend win, and does not fire twice", () => {
		declareMissingAnimation();
		const done = vi.fn();

		onExitFinished(element, done);
		// jsdom does not implement AnimationEvent; the listener only reads
		// `target`, so a plain Event carries everything it looks at.
		element.dispatchEvent(new Event("animationend"));
		expect(done).toHaveBeenCalledTimes(1);

		// The deadline must have been cancelled: a second call would remove a
		// node that has already been replaced by the next open.
		vi.advanceTimersByTime(1000);
		expect(done).toHaveBeenCalledTimes(1);
	});

	it("does not wait at all when nothing is declared", () => {
		vi.spyOn(window, "getComputedStyle").mockReturnValue({
			animationName: "none",
			animationDuration: "0s",
			animationDelay: "0s",
			transitionDuration: "0s",
			transitionDelay: "0s",
		} as unknown as CSSStyleDeclaration);
		const done = vi.fn();

		onExitFinished(element, done);

		expect(done).toHaveBeenCalledTimes(1);
	});

	it("stops the deadline when the caller cancels", () => {
		declareMissingAnimation();
		const done = vi.fn();

		onExitFinished(element, done)();
		vi.advanceTimersByTime(1000);

		expect(done).not.toHaveBeenCalled();
	});
});

/**
 * A declared animation whose keyframes exist nowhere.
 *
 * The deadline stops the node being stranded, but it does not explain anything:
 * the symptom becomes "overlays behave oddly", which points everywhere except
 * at the missing stylesheet. Looking for the rule itself is what turns it back
 * into "you have not imported the theme".
 */
describe("nebula > a missing stylesheet says so", () => {
	function declare(name: string) {
		vi.spyOn(window, "getComputedStyle").mockReturnValue({
			animationName: name,
			animationDuration: "120ms",
			animationDelay: "0s",
			transitionDuration: "0s",
			transitionDelay: "0s",
		} as unknown as CSSStyleDeclaration);
	}

	/**
	 * A readable stylesheet, any stylesheet.
	 *
	 * With none at all the check cannot tell what is defined, and it answers
	 * "assume it exists" on purpose — refusing to animate because the document
	 * was unreadable would be the worse trade. jsdom starts with no sheets, so
	 * a test about a MISSING keyframe has to give it something to read.
	 */
	function withSomeStylesheet(): HTMLStyleElement {
		const style = document.createElement("style");
		style.textContent = ".unrelated { color: red }";
		document.head.appendChild(style);
		return style;
	}

	/** Put a real @keyframes into the document. */
	function defineKeyframes(name: string): HTMLStyleElement {
		const style = document.createElement("style");
		style.textContent = `@keyframes ${name} { from { opacity: 1 } to { opacity: 0 } }`;
		document.head.appendChild(style);
		return style;
	}

	it("does not wait for an animation nothing defines", () => {
		const sheet = withSomeStylesheet();
		declare("nebula-absent-a");
		const done = vi.fn();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		try {
			onExitFinished(element, done);

			// Immediately, with no deadline to sit through: the answer was
			// knowable.
			expect(done).toHaveBeenCalledTimes(1);
			// And it names where the utilities come from — the same package
			// shadcn tells you to install.
			expect(warn.mock.calls.map((c) => String(c[0])).join("")).toContain(
				"tw-animate-css",
			);
		} finally {
			warn.mockRestore();
			sheet.remove();
		}
	});

	it("waits normally when the keyframes are actually there", () => {
		const sheet = defineKeyframes("nebula-present-b");
		declare("nebula-present-b");
		const done = vi.fn();

		try {
			onExitFinished(element, done);
			// A real animation is running; the listener must decide, not us.
			expect(done).not.toHaveBeenCalled();
		} finally {
			sheet.remove();
		}
	});

	it("says it once, not on every close", () => {
		const sheet = withSomeStylesheet();
		declare("nebula-absent-c");
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			onExitFinished(element, () => {});
			onExitFinished(element, () => {});
			onExitFinished(element, () => {});

			// A line per closing overlay is noise the reader learns to skip.
			expect(warn).toHaveBeenCalledTimes(1);
		} finally {
			warn.mockRestore();
			sheet.remove();
		}
	});
});

/**
 * The public `presence()` had no deadline at all.
 *
 * `onExitFinished` was bounded; `presence().close()` set a flag and waited for
 * an `animationend` nothing promises, so a declared animation the browser never
 * runs left the surface mounted for good.
 */
describe("nebula > presence() is bounded too", () => {
	function declareMissing() {
		vi.spyOn(window, "getComputedStyle").mockReturnValue({
			animationName: "nebula-never-defined",
			animationDuration: "120ms",
			animationDelay: "0s",
			transitionDuration: "0s",
			transitionDelay: "0s",
		} as unknown as CSSStyleDeclaration);
	}

	it("unmounts on the deadline when the animation never runs", () => {
		const sheet = document.createElement("style");
		sheet.textContent = ".unrelated { color: red }";
		document.head.appendChild(sheet);
		declareMissing();
		const p = presence(true);
		p.attach(element);

		p.close();
		// Detected as undefined, so there is nothing to wait for at all.
		expect(p.mounted()).toBe(false);

		p.dispose();
		sheet.remove();
	});

	it("waits for a real animation, then the event ends it", () => {
		const sheet = document.createElement("style");
		sheet.textContent =
			"@keyframes nebula-real-exit { from { opacity: 1 } to { opacity: 0 } }";
		document.head.appendChild(sheet);
		vi.spyOn(window, "getComputedStyle").mockReturnValue({
			animationName: "nebula-real-exit",
			animationDuration: "120ms",
			animationDelay: "0s",
			transitionDuration: "0s",
			transitionDelay: "0s",
		} as unknown as CSSStyleDeclaration);
		const p = presence(true);
		p.attach(element);

		p.close();
		expect(p.mounted()).toBe(true);

		element.dispatchEvent(new Event("animationend"));
		expect(p.mounted()).toBe(false);

		p.dispose();
		sheet.remove();
	});

	it("unmounts on the deadline if that event never comes", () => {
		const sheet = document.createElement("style");
		sheet.textContent =
			"@keyframes nebula-real-exit { from { opacity: 1 } to { opacity: 0 } }";
		document.head.appendChild(sheet);
		vi.spyOn(window, "getComputedStyle").mockReturnValue({
			animationName: "nebula-real-exit",
			animationDuration: "120ms",
			animationDelay: "0s",
			transitionDuration: "0s",
			transitionDelay: "0s",
		} as unknown as CSSStyleDeclaration);
		const p = presence(true);
		p.attach(element);
		p.close();
		expect(p.mounted()).toBe(true);

		// The keyframes exist, so it waited — but a browser that never fires the
		// event must not strand the node either.
		vi.advanceTimersByTime(500);

		expect(p.mounted()).toBe(false);
		p.dispose();
		sheet.remove();
	});
});

describe("nebula > detecting keyframes precisely", () => {
	it("finds keyframes nested in a group rule", () => {
		// `@keyframes` inside `@media` or `@supports` is a nested rule; a flat
		// scan reported it missing and warned about a stylesheet that was there.
		const sheet = document.createElement("style");
		sheet.textContent =
			"@media screen { @keyframes nebula-nested { from { opacity: 1 } } }";
		document.head.appendChild(sheet);
		vi.spyOn(window, "getComputedStyle").mockReturnValue({
			animationName: "nebula-nested",
			animationDuration: "120ms",
			animationDelay: "0s",
			transitionDuration: "0s",
			transitionDelay: "0s",
		} as unknown as CSSStyleDeclaration);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		try {
			onExitFinished(element, () => {});
			expect(warn).not.toHaveBeenCalled();
		} finally {
			warn.mockRestore();
			sheet.remove();
		}
	});

	it("treats a comma-separated list as several names", () => {
		// `animation-name` is a list. Looked up whole it matched nothing, so a
		// page with two perfectly good animations was told both were missing.
		const sheet = document.createElement("style");
		sheet.textContent =
			"@keyframes nebula-a { from { opacity: 1 } } @keyframes nebula-b { from { opacity: 1 } }";
		document.head.appendChild(sheet);
		vi.spyOn(window, "getComputedStyle").mockReturnValue({
			animationName: "nebula-a, nebula-b",
			animationDuration: "120ms",
			animationDelay: "0s",
			transitionDuration: "0s",
			transitionDelay: "0s",
		} as unknown as CSSStyleDeclaration);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		try {
			onExitFinished(element, () => {});
			expect(warn).not.toHaveBeenCalled();
		} finally {
			warn.mockRestore();
			sheet.remove();
		}
	});
});
