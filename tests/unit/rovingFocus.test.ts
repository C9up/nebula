import { afterEach, describe, expect, it, vi } from "vitest";
import { rovingFocus } from "../../src/primitives/rovingFocus.js";
import { press } from "./helpers.js";

/**
 * Send a key the way a browser does: from the focused element, bubbling up.
 *
 * Dispatching on `document` instead would be ignored, and correctly so — the
 * handler refuses keys originating outside the group, which is what stops one
 * menu answering another's arrows.
 */
function arrow(key: string, init: KeyboardEventInit = {}): void {
	const target = document.activeElement ?? document;
	target.dispatchEvent(press(key, init));
}

function group(count: number, disabled: readonly number[] = []): HTMLElement {
	const container = document.createElement("div");
	// Focusable, because a menu panel takes focus itself when it opens and the
	// first arrow press arrives from the container rather than from an item.
	container.tabIndex = -1;
	for (let i = 0; i < count; i += 1) {
		const item = document.createElement("button");
		item.setAttribute("data-nebula-item", "");
		item.id = `item-${i}`;
		item.textContent = `Item ${i}`;
		if (disabled.includes(i)) item.setAttribute("data-disabled", "");
		container.appendChild(item);
	}
	document.body.appendChild(container);
	return container;
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("rovingFocus", () => {
	it("makes the group one tab stop", () => {
		// The whole point: 40 items must not cost 40 presses of Tab.
		const container = group(4);
		const nav = rovingFocus({ container: () => container });
		nav.sync();

		const indexes = nav.items().map((item) => item.tabIndex);
		expect(indexes).toEqual([0, -1, -1, -1]);
		nav.destroy();
	});

	it("moves focus with the arrows and carries the tab stop along", () => {
		const container = group(3);
		const nav = rovingFocus({ container: () => container });
		nav.sync();
		nav.focusFirst();

		arrow("ArrowDown");
		expect(document.activeElement?.id).toBe("item-1");
		expect(document.getElementById("item-1")?.tabIndex).toBe(0);
		expect(document.getElementById("item-0")?.tabIndex).toBe(-1);
		nav.destroy();
	});

	it("wraps at both ends by default", () => {
		const container = group(3);
		const nav = rovingFocus({ container: () => container });
		nav.focusLast();
		arrow("ArrowDown");
		expect(document.activeElement?.id).toBe("item-0");

		arrow("ArrowUp");
		expect(document.activeElement?.id).toBe("item-2");
		nav.destroy();
	});

	it("stops at the ends when looping is off", () => {
		const container = group(3);
		const nav = rovingFocus({ container: () => container, loop: false });
		nav.focusLast();
		arrow("ArrowDown");
		expect(document.activeElement?.id).toBe("item-2");
		nav.destroy();
	});

	it("enters at the bottom on a first ArrowUp", () => {
		// What every native menu does: ArrowUp on a freshly opened list lands on
		// its last entry rather than refusing to move.
		const container = group(3);
		const nav = rovingFocus({ container: () => container });
		nav.sync();
		container.focus();

		arrow("ArrowUp");
		expect(document.activeElement?.id).toBe("item-2");
		nav.destroy();
	});

	it("skips disabled items", () => {
		const container = group(4, [1, 2]);
		const nav = rovingFocus({ container: () => container });
		nav.focusFirst();
		arrow("ArrowDown");
		expect(document.activeElement?.id).toBe("item-3");
		nav.destroy();
	});

	it("jumps to the ends with Home and End", () => {
		const container = group(4);
		const nav = rovingFocus({ container: () => container });
		nav.focusFirst();

		arrow("End");
		expect(document.activeElement?.id).toBe("item-3");
		arrow("Home");
		expect(document.activeElement?.id).toBe("item-0");
		nav.destroy();
	});

	it("activates on Enter and Space", () => {
		const container = group(2);
		const onSelect = vi.fn();
		const nav = rovingFocus({ container: () => container, onSelect });
		nav.focusFirst();

		arrow("Enter");
		arrow(" ");
		expect(onSelect).toHaveBeenCalledTimes(2);
		nav.destroy();
	});

	it("leaves horizontal arrows alone in a vertical group", () => {
		const container = group(3);
		const nav = rovingFocus({
			container: () => container,
			orientation: "vertical",
		});
		nav.focusFirst();
		arrow("ArrowRight");
		expect(document.activeElement?.id).toBe("item-0");
		nav.destroy();
	});

	it("uses the horizontal arrows when told to", () => {
		const container = group(3);
		const nav = rovingFocus({
			container: () => container,
			orientation: "horizontal",
		});
		nav.focusFirst();
		arrow("ArrowRight");
		expect(document.activeElement?.id).toBe("item-1");
		nav.destroy();
	});

	it("ignores an arrow held with a browser modifier", () => {
		const container = group(3);
		const nav = rovingFocus({ container: () => container });
		nav.focusFirst();
		arrow("ArrowDown", { metaKey: true });
		expect(document.activeElement?.id).toBe("item-0");
		nav.destroy();
	});

	it("re-reads its items, so a filtered list navigates correctly", () => {
		// Registered up front, a Command palette's filtered-out entries would
		// still be in the rotation.
		const container = group(3);
		const nav = rovingFocus({ container: () => container });
		nav.focusFirst();
		document.getElementById("item-1")?.setAttribute("data-disabled", "");

		arrow("ArrowDown");
		expect(document.activeElement?.id).toBe("item-2");
		nav.destroy();
	});

	it("stops answering keys once destroyed", () => {
		const container = group(3);
		const nav = rovingFocus({ container: () => container });
		nav.focusFirst();
		nav.destroy();

		arrow("ArrowDown");
		expect(document.activeElement?.id).toBe("item-0");
	});
});
