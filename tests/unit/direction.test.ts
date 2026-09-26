import { afterEach, describe, expect, it } from "vitest";
import {
	directionOf,
	forward,
	isRightToLeft,
} from "../../src/primitives/direction.js";
import { rovingFocus } from "../../src/primitives/rovingFocus.js";
import { press } from "./helpers.js";

/**
 * Which way is forward.
 *
 * An arrow key is physical and "the next item" is logical, and in Arabic or
 * Hebrew those two point opposite ways. Every composite widget nebula ships —
 * menus, tab lists, toolbars — navigates through one function, so getting this
 * wrong sends half the world's readers backwards through all of them at once.
 */

afterEach(() => {
	document.body.innerHTML = "";
	document.documentElement.removeAttribute("dir");
});

function element(dir?: "rtl" | "ltr"): HTMLElement {
	const node = document.createElement("div");
	if (dir !== undefined) node.setAttribute("dir", dir);
	document.body.appendChild(node);
	return node;
}

describe("direction", () => {
	it("reads left to right when nothing says otherwise", () => {
		expect(directionOf(element())).toBe("ltr");
	});

	it("reads the direction off an element that declares it", () => {
		expect(directionOf(element("rtl"))).toBe("rtl");
		expect(isRightToLeft(element("rtl"))).toBe(true);
	});

	it("reads it off an ancestor, because that is where it usually lives", () => {
		// `<html dir="rtl">` is how a whole page is switched. A helper that only
		// looked at the element's own attribute would answer ltr for every node
		// on such a page.
		document.documentElement.setAttribute("dir", "rtl");
		expect(directionOf(element())).toBe("rtl");
	});

	it("answers ltr rather than throwing when there is nothing to ask", () => {
		// A server render, a detached node. Not a reason to fail a keypress.
		expect(directionOf(null)).toBe("ltr");
		expect(directionOf(undefined)).toBe("ltr");
		expect(directionOf(document.createElement("div"))).toBe("ltr");
	});

	it("mirrors the horizontal arrows, and only those", () => {
		const ltr = element("ltr");
		const rtl = element("rtl");

		expect(forward("ArrowRight", ltr)).toBe(1);
		expect(forward("ArrowLeft", ltr)).toBe(-1);
		expect(forward("ArrowRight", rtl)).toBe(-1);
		expect(forward("ArrowLeft", rtl)).toBe(1);
	});
});

describe("direction > inside roving focus", () => {
	function group(dir: "rtl" | "ltr"): HTMLElement {
		const container = document.createElement("div");
		container.setAttribute("dir", dir);
		container.tabIndex = -1;
		for (let i = 0; i < 3; i += 1) {
			const item = document.createElement("button");
			item.setAttribute("data-nebula-item", "");
			item.id = `item-${i}`;
			container.appendChild(item);
		}
		document.body.appendChild(container);
		return container;
	}

	function arrow(key: string): void {
		(document.activeElement ?? document).dispatchEvent(press(key));
	}

	it("moves ArrowRight forward in a left-to-right bar", () => {
		const container = group("ltr");
		const nav = rovingFocus({
			container: () => container,
			orientation: "horizontal",
		});
		nav.sync();
		nav.focusFirst();

		arrow("ArrowRight");

		expect(document.activeElement?.id).toBe("item-1");
		nav.destroy();
	});

	it("moves ArrowRight backward in a right-to-left bar", () => {
		// The bug this file exists for: the second item is to the LEFT of the
		// first, so the key that reaches it is ArrowLeft.
		const container = group("rtl");
		const nav = rovingFocus({
			container: () => container,
			orientation: "horizontal",
		});
		nav.sync();
		nav.focusFirst();

		arrow("ArrowLeft");

		expect(document.activeElement?.id).toBe("item-1");
		nav.destroy();
	});

	it("leaves the vertical arrows alone", () => {
		// `dir` does not turn a page upside down.
		const container = group("rtl");
		const nav = rovingFocus({
			container: () => container,
			orientation: "vertical",
		});
		nav.sync();
		nav.focusFirst();

		arrow("ArrowDown");

		expect(document.activeElement?.id).toBe("item-1");
		nav.destroy();
	});
});
