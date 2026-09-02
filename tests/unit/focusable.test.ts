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

	// Chromium hands a closed <details> child a real box: `offsetParent` is
	// <body>, the rect is 62x21 and `display` is inline-block. Only
	// `checkVisibility()` and a refused `focus()` betray it, and neither is
	// available without a layout engine — so the markup has to be read.
	it("rejects an element inside a collapsed details, which layout calls visible", () => {
		const root = mount(
			`<details><summary id="s">open me</summary><button id="b">no</button></details>`,
		);

		expect(isVisible(at(root, "b"))).toBe(false);
		expect(isVisible(at(root, "s"))).toBe(true);
	});

	it("accepts an element inside an open details", () => {
		const root = mount(
			`<details open><summary>shown</summary><button id="b">ok</button></details>`,
		);

		expect(isVisible(at(root, "b"))).toBe(true);
	});

	it("rejects an element in an open details nested in a collapsed one", () => {
		const root = mount(
			`<details><summary>outer</summary>
				<details open><summary>inner</summary><button id="b">no</button></details>
			</details>`,
		);

		expect(isVisible(at(root, "b"))).toBe(false);
	});

	// `parentElement` is null above the top of a shadow tree, so the walk used
	// to stop before it could see the host at all.
	it("rejects an element whose shadow host is hidden", () => {
		const root = mount(`<div id="host" style="display: none"></div>`);
		const shadow = at(root, "host").attachShadow({ mode: "open" });
		shadow.innerHTML = `<button id="b">no</button>`;
		const inside = shadow.querySelector("#b");
		if (!(inside instanceof HTMLElement)) {
			throw new Error("the shadow fixture has no #b");
		}

		expect(isVisible(inside)).toBe(false);
	});

	// A detached node has no computed styles to walk — every property reads as
	// the empty string, so nothing along the way can ever be `display: none`.
	it("rejects an element that is not in the document", () => {
		expect(isVisible(document.createElement("button"))).toBe(false);
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
			<details><summary id="summary">yes</summary><button id="collapsed">no</button></details>
		`);

		// The summary stays: a collapsed <details> still renders its own summary,
		// and that is the control that opens it.
		expect(focusableWithin(root).map((el) => el.id)).toEqual([
			"visible",
			"summary",
		]);
	});
});
