/**
 * `aria-hidden` across stacked modals, whatever order they close in.
 *
 * As the `aria-hidden` package Radix modals use: a node is hidden once per
 * modal that hid it, and shown again only when the last of them lets go. A
 * node the application hid itself is never touched. A confirm dialog that
 * closes its parent sheet before itself must not leave the page hidden.
 */

import { html, signal } from "@c9up/aurora";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "../../src/organisms/Dialog.js";
import { mount } from "./helpers.js";

afterEach(() => {
	document.body.innerHTML = "";
	document.body.style.cssText = "";
});

function setup() {
	const app = document.createElement("main");
	app.id = "app";
	document.body.appendChild(app);
	const outer = signal(false);
	const inner = signal(false);
	const dialog = (open: typeof outer, title: string) =>
		Dialog({
			open,
			onOpenChange: open,
			children: () =>
				DialogContent({ children: () => DialogTitle({ children: title }) }),
		});
	const view = mount(html`${dialog(outer, "Outer")}${dialog(inner, "Inner")}`);
	return { app, outer, inner, view };
}

describe("modal stack > aria-hidden", () => {
	it("shows the page again when the outer modal closes first", () => {
		const { app, outer, inner, view } = setup();
		outer(true);
		inner(true);
		expect(app.getAttribute("aria-hidden")).toBe("true");
		outer(false);
		// The inner modal is still open: the page stays hidden.
		expect(app.getAttribute("aria-hidden")).toBe("true");
		inner(false);
		expect(app.hasAttribute("aria-hidden")).toBe(false);
		view.dispose();
	});

	it("shows the page again when the inner modal closes first", () => {
		const { app, outer, inner, view } = setup();
		outer(true);
		inner(true);
		inner(false);
		expect(app.getAttribute("aria-hidden")).toBe("true");
		outer(false);
		expect(app.hasAttribute("aria-hidden")).toBe(false);
		view.dispose();
	});

	it("hides the outer modal while the inner one is on top, and shows it after", () => {
		const { outer, inner, view } = setup();
		outer(true);
		const outerHost = document
			.querySelector("[data-slot='dialog-content']")
			?.closest("[data-nebula-portal]");
		inner(true);
		expect(outerHost?.getAttribute("aria-hidden")).toBe("true");
		inner(false);
		expect(outerHost?.hasAttribute("aria-hidden")).toBe(false);
		outer(false);
		view.dispose();
	});

	it("leaves alone a node the application hid itself, in either order", () => {
		const { app, outer, inner, view } = setup();
		const banner = document.createElement("div");
		banner.setAttribute("aria-hidden", "true");
		document.body.appendChild(banner);
		outer(true);
		inner(true);
		outer(false);
		inner(false);
		expect(banner.getAttribute("aria-hidden")).toBe("true");
		expect(app.hasAttribute("aria-hidden")).toBe(false);
		view.dispose();
	});

	it("hides the page again when reopened while its exit is still playing", () => {
		// A declared transition keeps the closed modal in the document until
		// it ends; reopening in that window reuses it.
		const style = document.createElement("div").style;
		style.setProperty("transition-property", "opacity");
		style.setProperty("transition-duration", "150ms");
		vi.spyOn(window, "getComputedStyle").mockImplementation(() => style);
		const { app, outer, view } = setup();
		outer(true);
		outer(false);
		expect(app.hasAttribute("aria-hidden")).toBe(false);
		outer(true);
		expect(app.getAttribute("aria-hidden")).toBe("true");
		// Still a modal: Escape reaches it.
		document.activeElement?.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);
		expect(outer()).toBe(false);
		view.dispose();
		vi.restoreAllMocks();
	});

	it("releases what it hid once, even when torn down after closing", () => {
		const { app, outer, inner, view } = setup();
		outer(true);
		inner(true);
		// Unmounting while both are open runs every release path at once.
		view.dispose();
		expect(app.hasAttribute("aria-hidden")).toBe(false);
	});
});
