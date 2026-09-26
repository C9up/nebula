import { html } from "@c9up/aurora";
import { afterEach, describe, expect, it } from "vitest";
import { AccessibleIcon } from "../../src/atoms/AccessibleIcon.js";
import { Button } from "../../src/atoms/Button.js";
import { VisuallyHidden } from "../../src/atoms/VisuallyHidden.js";
import {
	Toolbar,
	ToolbarButton,
	ToolbarSeparator,
} from "../../src/molecules/Toolbar.js";
import { mount, press } from "./helpers.js";

/**
 * The three Radix primitives shadcn styles no equivalent for.
 *
 * Easy to miss precisely because nothing looks wrong without them: an icon
 * button renders fine and is announced as "button"; a row of controls renders
 * fine and costs eleven presses of Tab to walk past.
 */

const disposers: Array<() => void> = [];
afterEach(() => {
	while (disposers.length > 0) disposers.pop()?.();
	document.body.innerHTML = "";
});

function show(template: ReturnType<typeof html>): HTMLElement {
	const mounted = mount(template);
	disposers.push(mounted.dispose);
	return mounted.host;
}

describe("VisuallyHidden", () => {
	it("stays in the accessibility tree while leaving the layout", () => {
		// `display: none` would hide it from a screen reader too, which is the
		// opposite of the point.
		const host = show(html`${VisuallyHidden({ children: "Delete" })}`);
		const node = host.querySelector("[data-slot='visually-hidden']");

		expect(node?.textContent).toBe("Delete");
		expect(node?.className).toContain("sr-only");
		expect(node?.getAttribute("aria-hidden")).toBeNull();
	});

	it("comes back for a skip link once it has focus", () => {
		const host = show(
			html`${VisuallyHidden({ focusable: true, children: "Skip to content" })}`,
		);
		expect(
			host.querySelector("[data-slot='visually-hidden']")?.className,
		).toContain("focus:not-sr-only");
	});

	it("escapes content that arrived from somewhere else", () => {
		// Hidden from sight is not hidden from the parser: a label built from a
		// record's name is still markup if nothing escapes it.
		const host = show(
			html`${VisuallyHidden({ children: "<img src=x onerror=alert(1)>" })}`,
		);
		expect(host.querySelector("img")).toBeNull();
		expect(host.textContent).toContain("<img");
	});
});

describe("AccessibleIcon", () => {
	it("hides the picture and announces the word", () => {
		const host = show(
			html`${AccessibleIcon({
				label: "Delete",
				children: html`<svg data-testid="glyph"></svg>`,
			})}`,
		);

		// The svg must not be announced on top of the label — a `<title>` inside
		// it would otherwise be read as well.
		expect(
			host.querySelector("svg")?.closest("[aria-hidden='true']"),
		).not.toBeNull();
		expect(host.textContent).toContain("Delete");
	});
});

describe("Toolbar", () => {
	function bar(): HTMLElement {
		return show(
			html`${Toolbar({
				label: "Formatting",
				children: html`${ToolbarButton({ id: "bold", children: "B" })}${ToolbarSeparator(
					{},
				)}${ToolbarButton({ id: "italic", children: "I" })}${Button({
					id: "plain",
					children: "P",
				})}`,
			})}`,
		);
	}

	it("is one tab stop, not one per control", () => {
		// Eleven buttons in a formatting bar are eleven presses of Tab to get
		// past, and the keyboard user below pays for every one.
		const host = bar();
		const buttons = [...host.querySelectorAll("button")];

		expect(buttons.length).toBe(3);
		expect(buttons.filter((b) => b.tabIndex === 0).length).toBe(1);
	});

	it("moves between controls with the arrows", () => {
		const host = bar();
		const bold = host.querySelector<HTMLElement>("#bold");
		bold?.focus();

		bold?.dispatchEvent(press("ArrowRight"));

		expect(document.activeElement?.id).toBe("italic");
	});

	it("reaches a plain control too, with no marker attribute", () => {
		// Items are found by focusability, so anything a keyboard could reach on
		// its own is reached here.
		const host = bar();
		host.querySelector<HTMLElement>("#italic")?.focus();

		document.activeElement?.dispatchEvent(press("ArrowRight"));

		expect(document.activeElement?.id).toBe("plain");
	});

	it("announces itself as a toolbar, with the name it was given", () => {
		const host = bar();
		const node = host.querySelector("[data-slot='toolbar']");

		expect(node?.getAttribute("role")).toBe("toolbar");
		expect(node?.getAttribute("aria-label")).toBe("Formatting");
	});

	it("marks its separator as a real boundary", () => {
		const host = bar();
		expect(
			host.querySelector("[data-slot='separator']")?.getAttribute("role"),
		).toBe("separator");
	});
});
