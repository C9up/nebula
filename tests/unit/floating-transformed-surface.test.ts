import { afterEach, describe, expect, it } from "vitest";
import { autoPosition } from "../../src/primitives/floating.js";

interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * jsdom has no layout, so both boxes are given by hand: the layout box the
 * stylesheet asks for, and the bounding box that `scale(0.95)` — the first
 * frame of `zoom-in-95`, which every surface opens with — shrinks it to.
 */
function element(
	layout: { width: number; height: number },
	bounds: Box,
): HTMLElement {
	const el = document.createElement("div");
	el.style.width = `${layout.width}px`;
	el.style.height = `${layout.height}px`;
	Object.defineProperty(el, "offsetWidth", { value: layout.width });
	Object.defineProperty(el, "offsetHeight", { value: layout.height });
	el.getBoundingClientRect = () => DOMRect.fromRect(bounds);
	document.body.append(el);
	return el;
}

afterEach(() => {
	document.body.replaceChildren();
});

describe("autoPosition > a surface measured mid-animation", () => {
	it("leaves exactly the offset above the trigger on the top side", () => {
		const anchor = element(
			{ width: 120, height: 30 },
			{ x: 100, y: 500, width: 120, height: 30 },
		);
		const surface = element(
			{ width: 200, height: 224 },
			{ x: 105, y: 5.6, width: 190, height: 212.8 },
		);

		autoPosition(anchor, surface, { placement: "top-start", offset: 4 }).stop();

		// 500 - 4 - 224, from the layout height. The scaled 212.8 put it at 283,
		// over the trigger once the animation let the surface grow back.
		expect(surface.style.top).toBe("272px");
		expect(surface.style.getPropertyValue("--nebula-transform-origin")).toBe(
			"60px 224px",
		);
	});
});
