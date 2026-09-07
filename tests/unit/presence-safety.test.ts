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
import { onExitFinished } from "../../src/primitives/presence.js";

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
		animationName: "nebula-zoom-out",
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
