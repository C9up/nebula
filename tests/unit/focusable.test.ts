import { afterEach, describe, expect, it } from "vitest";
import { focusableWithin, isVisible } from "../../src/primitives/focusable.js";

function mount(markup: string): HTMLElement {
	const element = document.createElement("div");
	element.innerHTML = markup;
	document.body.appendChild(element);
	return element;
}

function at(root: HTMLElement, id: string): HTMLElement {
	const found = root.querySelector(`#${id}`);
	if (!(found instanceof HTMLElement)) {
		throw new Error(`the fixture has no element #${id}`);
	}
	return found;
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("isVisible", () => {
	it("accepts an element that nothing hides", () => {
		const root = mount(`<button id="b">ok</button>`);

		expect(isVisible(at(root, "b"))).toBe(true);
	});

	it("rejects an element hidden by its own display", () => {
		const root = mount(`<button id="b" style="display: none">no</button>`);

		expect(isVisible(at(root, "b"))).toBe(false);
	});

	it("rejects an element inside a display:none ancestor", () => {
		const root = mount(
			`<div style="display: none"><span><button id="b">no</button></span></div>`,
		);

		expect(isVisible(at(root, "b"))).toBe(false);
	});

	it("rejects an element whose visibility is hidden", () => {
		const root = mount(`<button id="b" style="visibility: hidden">no</button>`);

		expect(isVisible(at(root, "b"))).toBe(false);
	});

	it("accepts a fixed element, which reports no offset parent even in a browser", () => {
		const root = mount(`<button id="b" style="position: fixed">ok</button>`);

		expect(isVisible(at(root, "b"))).toBe(true);
	});

	it("rejects an inert element and anything under it", () => {
		const root = mount(
			`<div inert><button id="b">no</button></div><button id="c" inert>no</button>`,
		);

		expect(isVisible(at(root, "b"))).toBe(false);
		expect(isVisible(at(root, "c"))).toBe(false);
	});
});

describe("focusableWithin", () => {
	it("leaves out the candidates that are hidden", () => {
		const root = mount(`
			<button id="visible">yes</button>
			<button id="none" style="display: none">no</button>
			<div style="display: none"><button id="buried">no</button></div>
			<button id="invisible" style="visibility: hidden">no</button>
			<div inert><button id="inert">no</button></div>
		`);

		expect(focusableWithin(root).map((el) => el.id)).toEqual(["visible"]);
	});
});
