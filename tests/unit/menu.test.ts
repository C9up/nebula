import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type MenuEntry,
	menuPanel,
	wireMenu,
} from "../../src/primitives/menu.js";
import { mount, portals, press } from "./helpers.js";

afterEach(() => {
	document.body.innerHTML = "";
});

function openMenu(entries: readonly MenuEntry[], onCloseAll = vi.fn()) {
	const view = mount(menuPanel({ id: "menu", entries, onCloseAll }));
	const panel = document.getElementById("menu");
	if (panel === null) throw new Error("panel did not mount");
	const unwire = wireMenu(panel, { onCloseAll });
	return { panel, unwire, onCloseAll, view };
}

function keyFrom(target: Element, key: string): void {
	target.dispatchEvent(press(key));
}

describe("menuPanel", () => {
	it("gives the panel and its entries the menu roles", () => {
		const { panel, unwire, view } = openMenu([
			{ label: "Cut" },
			{ label: "Copy" },
		]);
		expect(panel.getAttribute("role")).toBe("menu");
		expect(panel.querySelectorAll("[role='menuitem']")).toHaveLength(2);
		unwire();
		view.dispose();
	});

	it("renders each entry kind with the role that describes it", () => {
		const { panel, unwire, view } = openMenu([
			{ type: "label", label: "Actions" },
			{ label: "Cut" },
			{ type: "separator" },
			{ type: "checkbox", label: "Wrap", checked: true },
			{
				type: "radio-group",
				value: "b",
				options: [
					{ value: "a", label: "A" },
					{ value: "b", label: "B" },
				],
			},
		]);
		expect(panel.querySelectorAll("[role='separator']")).toHaveLength(1);
		expect(
			panel
				.querySelector("[role='menuitemcheckbox']")
				?.getAttribute("aria-checked"),
		).toBe("true");

		const radios = panel.querySelectorAll("[role='menuitemradio']");
		expect(radios).toHaveLength(2);
		expect(radios[1]?.getAttribute("aria-checked")).toBe("true");
		unwire();
		view.dispose();
	});

	it("runs an item and closes the whole stack", () => {
		const onSelect = vi.fn();
		const onCloseAll = vi.fn();
		const { panel, unwire, view } = openMenu(
			[{ label: "Cut", onSelect }],
			onCloseAll,
		);
		panel.querySelector<HTMLElement>("[role='menuitem']")?.click();
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onCloseAll).toHaveBeenCalledTimes(1);
		unwire();
		view.dispose();
	});

	it("ignores a disabled item", () => {
		const onSelect = vi.fn();
		const onCloseAll = vi.fn();
		const { panel, unwire, view } = openMenu(
			[{ label: "Cut", disabled: true, onSelect }],
			onCloseAll,
		);
		panel.querySelector<HTMLElement>("[role='menuitem']")?.click();
		expect(onSelect).not.toHaveBeenCalled();
		expect(onCloseAll).not.toHaveBeenCalled();
		unwire();
		view.dispose();
	});

	it("toggles a checkbox to the opposite of what it was", () => {
		const onCheckedChange = vi.fn();
		const { panel, unwire, view } = openMenu([
			{ type: "checkbox", label: "Wrap", checked: true, onCheckedChange },
		]);
		panel.querySelector<HTMLElement>("[role='menuitemcheckbox']")?.click();
		expect(onCheckedChange).toHaveBeenCalledWith(false);
		unwire();
		view.dispose();
	});
});

describe("wireMenu", () => {
	it("moves through items with the arrows", () => {
		const { panel, unwire, view } = openMenu([
			{ label: "One" },
			{ label: "Two" },
		]);
		panel.focus();
		keyFrom(panel, "ArrowDown");
		expect(document.activeElement?.textContent?.trim()).toBe("One");

		if (document.activeElement !== null)
			keyFrom(document.activeElement, "ArrowDown");
		expect(document.activeElement?.textContent?.trim()).toBe("Two");
		unwire();
		view.dispose();
	});

	it("seeks by typing", () => {
		const { panel, unwire, view } = openMenu([
			{ label: "Cut" },
			{ label: "Copy" },
			{ label: "Paste" },
		]);
		panel.focus();
		keyFrom(panel, "p");
		expect(document.activeElement?.textContent?.trim()).toBe("Paste");
		unwire();
		view.dispose();
	});

	it("closes everything on Tab", () => {
		// Tab out of a menu means "I am done here", not "next item".
		const onCloseAll = vi.fn();
		const { panel, unwire, view } = openMenu([{ label: "One" }], onCloseAll);
		panel.focus();
		keyFrom(panel, "Tab");
		expect(onCloseAll).toHaveBeenCalledTimes(1);
		unwire();
		view.dispose();
	});

	it("opens a submenu on ArrowRight and focuses into it", () => {
		const { panel, unwire, view } = openMenu([
			{
				type: "submenu",
				label: "Share",
				entries: [{ label: "Email" }, { label: "Link" }],
			},
		]);
		panel.focus();
		keyFrom(panel, "ArrowDown");

		const trigger = document.activeElement;
		expect(trigger?.getAttribute("aria-haspopup")).toBe("menu");
		if (trigger !== null) keyFrom(trigger, "ArrowRight");

		expect(trigger?.getAttribute("aria-expanded")).toBe("true");
		expect(portals()).toHaveLength(1);
		expect(document.activeElement?.textContent?.trim()).toBe("Email");
		unwire();
		view.dispose();
	});

	it("closes one level on ArrowLeft, leaving the parent open", () => {
		const { panel, unwire, view } = openMenu([
			{ type: "submenu", label: "Share", entries: [{ label: "Email" }] },
		]);
		panel.focus();
		keyFrom(panel, "ArrowDown");
		const trigger = document.activeElement;
		if (trigger !== null) keyFrom(trigger, "ArrowRight");
		expect(portals()).toHaveLength(1);

		if (document.activeElement !== null)
			keyFrom(document.activeElement, "ArrowLeft");
		expect(portals()).toHaveLength(0);
		expect(trigger?.getAttribute("aria-expanded")).toBe("false");
		unwire();
		view.dispose();
	});

	it("unwinds every open submenu when the root is torn down", () => {
		const { panel, unwire, view } = openMenu([
			{ type: "submenu", label: "Share", entries: [{ label: "Email" }] },
		]);
		panel.focus();
		keyFrom(panel, "ArrowDown");
		if (document.activeElement !== null)
			keyFrom(document.activeElement, "ArrowRight");
		expect(portals()).toHaveLength(1);

		unwire();
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("opens a submenu on hover and focuses the row", () => {
		const { panel, unwire, view } = openMenu([
			{ label: "One" },
			{ type: "submenu", label: "Share", entries: [{ label: "Email" }] },
		]);
		const trigger = panel.querySelector<HTMLElement>("[data-submenu]");
		trigger?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
		expect(portals()).toHaveLength(1);
		unwire();
		view.dispose();
	});

	it("closes an open submenu when the pointer moves to a plain row", () => {
		// Otherwise the pointer travelling down a menu leaves a trail of panels.
		const { panel, unwire, view } = openMenu([
			{ label: "One" },
			{ type: "submenu", label: "Share", entries: [{ label: "Email" }] },
		]);
		const trigger = panel.querySelector<HTMLElement>("[data-submenu]");
		trigger?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
		expect(portals()).toHaveLength(1);

		const plain = panel.querySelector<HTMLElement>(
			"[data-nebula-item]:not([data-submenu])",
		);
		plain?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
		expect(portals()).toHaveLength(0);
		unwire();
		view.dispose();
	});
});
