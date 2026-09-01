import { afterEach, describe, expect, it } from "vitest";
import {
	focusableWithin,
	isFocusable,
} from "../../src/primitives/focusable.js";
import { focusTrap } from "../../src/primitives/focusTrap.js";

function panel(markup: string): HTMLElement {
	const element = document.createElement("div");
	element.innerHTML = markup;
	document.body.appendChild(element);
	return element;
}

function tab(shift = false): void {
	document.dispatchEvent(
		new KeyboardEvent("keydown", {
			key: "Tab",
			shiftKey: shift,
			bubbles: true,
		}),
	);
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("focusable", () => {
	it("lists candidates in document order", () => {
		const surface = panel(
			'<button id="a"></button><a href="#" id="b"></a><input id="c" />',
		);
		expect(focusableWithin(surface).map((node) => node.id)).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	it("rejects disabled and negatively-tabbable elements", () => {
		const surface = panel(
			'<button disabled id="a"></button><div tabindex="-1" id="b"></div>',
		);
		expect(focusableWithin(surface)).toHaveLength(0);
	});

	it("rejects anything inside an inert subtree", () => {
		const surface = panel('<div inert><button id="a"></button></div>');
		expect(focusableWithin(surface)).toHaveLength(0);
	});

	it("rejects an element hidden from assistive technology", () => {
		const surface = panel('<button aria-hidden="true" id="a"></button>');
		const button = surface.querySelector("#a");
		expect(button !== null && isFocusable(button)).toBe(false);
	});
});

describe("focusTrap", () => {
	it("focuses the first focusable element on activation", () => {
		const surface = panel('<button id="a"></button><button id="b"></button>');
		const trap = focusTrap(surface);
		expect(document.activeElement?.id).toBe("a");
		trap.release();
	});

	it("wraps from the last element to the first", () => {
		const surface = panel('<button id="a"></button><button id="b"></button>');
		const trap = focusTrap(surface);

		surface.querySelector<HTMLElement>("#b")?.focus();
		tab();
		expect(document.activeElement?.id).toBe("a");
		trap.release();
	});

	it("wraps backwards from the first element to the last", () => {
		const surface = panel('<button id="a"></button><button id="b"></button>');
		const trap = focusTrap(surface);

		surface.querySelector<HTMLElement>("#a")?.focus();
		tab(true);
		expect(document.activeElement?.id).toBe("b");
		trap.release();
	});

	it("holds focus on the container when there is nothing to focus", () => {
		const surface = panel("<p>Nothing interactive here.</p>");
		const trap = focusTrap(surface);
		// Without this the next Tab walks straight out into the page behind.
		tab();
		expect(document.activeElement).toBe(surface);
		trap.release();
	});

	it("pulls focus back when it lands outside by some other route", () => {
		const outside = document.createElement("button");
		document.body.appendChild(outside);
		const surface = panel('<button id="a"></button>');
		const trap = focusTrap(surface);

		outside.focus();
		outside.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
		expect(document.activeElement?.id).toBe("a");
		trap.release();
	});

	it("returns focus to whatever was focused before", () => {
		const trigger = document.createElement("button");
		trigger.id = "trigger";
		document.body.appendChild(trigger);
		trigger.focus();

		const surface = panel('<button id="a"></button>');
		const trap = focusTrap(surface);
		expect(document.activeElement?.id).toBe("a");

		trap.release();
		expect(document.activeElement?.id).toBe("trigger");
	});

	it("leaves focus alone when something else already claimed it", () => {
		const trigger = document.createElement("button");
		trigger.id = "trigger";
		const elsewhere = document.createElement("button");
		elsewhere.id = "elsewhere";
		document.body.append(trigger, elsewhere);
		trigger.focus();

		const surface = panel('<button id="a"></button>');
		const trap = focusTrap(surface);
		trap.release();
		// A toast action or a second dialog took focus; stealing it back would
		// yank the user out of wherever they now are.
		elsewhere.focus();
		trap.release();
		expect(document.activeElement?.id).toBe("elsewhere");
	});
});

describe("focusTrap > two portalled siblings", () => {
	it("leaves the focus to the innermost trap instead of fighting over it", () => {
		// Every modal surface here is portalled to document.body, so a dialog
		// opened over a dialog is a SIBLING, not a descendant. The `contains`
		// guard read that as "focus is outside me" on BOTH traps, and each
		// pulled it back from the other.
		const outer = panel('<button id="outer-a">a</button>');
		const inner = panel('<button id="inner-a">b</button>');

		const outerTrap = focusTrap(outer);
		const innerTrap = focusTrap(inner);

		// Focus starts in the inner one, which is the one the user is in.
		expect(document.activeElement?.id).toBe("inner-a");

		// A stray focusin from the page behind: only the innermost trap reacts,
		// and it reclaims focus for itself.
		document.body.focus();
		document.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
		expect(inner.contains(document.activeElement)).toBe(true);

		// Closing the inner one hands the trap back to the outer.
		innerTrap.release();
		document.body.focus();
		document.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
		expect(outer.contains(document.activeElement)).toBe(true);

		outerTrap.release();
	});

	it("survives surfaces closing out of order", () => {
		const outer = panel('<button id="o">a</button>');
		const inner = panel('<button id="i">b</button>');
		const outerTrap = focusTrap(outer);
		const innerTrap = focusTrap(inner);

		// The outer closes first — a route change tearing down a page while a
		// popover is still open.
		outerTrap.release();
		document.body.focus();
		document.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
		expect(inner.contains(document.activeElement)).toBe(true);

		innerTrap.release();
	});
});
