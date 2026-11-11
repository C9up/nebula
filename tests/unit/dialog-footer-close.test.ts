/**
 * `DialogFooter({ showCloseButton: true })` is one control, so it is one
 * button. It used to wrap a `Button` in a `<button>`: inserted through DOM
 * APIs that held, but the HTML parser closes an open button when it meets
 * another, so any serialised form (server markup, an innerHTML round-trip)
 * split it in two and left the click handler on an empty outer button.
 */

import { html, renderToString, resetIds } from "@c9up/aurora";
import { afterEach, describe, expect, it } from "vitest";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogTitle,
	DialogTrigger,
} from "../../src/organisms/Dialog.js";
import { mount, portals } from "./helpers.js";

afterEach(() => {
	document.body.innerHTML = "";
});

describe("nebula > DialogFooter close button", () => {
	it("serialises to a single button that survives the HTML parser", () => {
		resetIds();
		const markup = renderToString(
			Dialog({
				children: () =>
					DialogFooter({ showCloseButton: true, closeLabel: "Dismiss" }),
			}),
		);
		const parsed = document.createElement("div");
		parsed.innerHTML = markup;

		expect(parsed.querySelector("button button")).toBeNull();
		const buttons = [...parsed.querySelectorAll("button")];
		expect(buttons).toHaveLength(1);
		const [close] = buttons;
		expect(close?.getAttribute("data-slot")).toBe("dialog-close");
		expect(close?.getAttribute("type")).toBe("button");
		expect(close?.textContent?.trim()).toBe("Dismiss");
		// Styled as the outline button it used to wrap.
		expect(close?.className).toContain("border");
		expect(close?.className).toContain("bg-background");
	});

	it("closes the dialog from the one button", () => {
		const view = mount(
			Dialog({
				children: () =>
					html`${DialogTrigger({ children: "Open" })}${DialogContent({
						children: () =>
							html`${DialogTitle({ children: "Title" })}${DialogFooter({
								showCloseButton: true,
							})}`,
					})}`,
			}),
		);
		view.host.querySelector<HTMLElement>("[data-slot=dialog-trigger]")?.click();
		const footer = document.querySelector("[data-slot=dialog-footer]");
		expect(footer?.querySelectorAll("button")).toHaveLength(1);
		footer?.querySelector<HTMLElement>("[data-slot=dialog-close]")?.click();
		expect(
			view.host
				.querySelector("[data-slot=dialog-trigger]")
				?.getAttribute("aria-expanded"),
		).toBe("false");
		view.dispose();
		expect(portals()).toHaveLength(0);
	});
});
