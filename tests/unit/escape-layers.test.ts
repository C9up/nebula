/**
 * Escape reaches the topmost layer, and only that one.
 *
 * As Radix's dismissable layer: only the highest layer listens, and one that
 * refuses Escape dismisses nothing. A dialog opened with `dismissOnEscape:
 * false` over a sheet must not let Escape close the sheet behind it. A
 * submenu, as Radix's, hands Escape on: it closes the whole menu.
 */

import { html, signal } from "@c9up/aurora";
import { afterEach, describe, expect, it } from "vitest";
import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "../../src/organisms/Dialog.js";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "../../src/organisms/DropdownMenu.js";
import { Sheet, SheetContent, SheetTitle } from "../../src/organisms/Sheet.js";
import { mount, portals } from "./helpers.js";

afterEach(() => {
	document.body.innerHTML = "";
	document.body.style.cssText = "";
});

function escapeOnFocus(): void {
	(document.activeElement ?? document.body).dispatchEvent(
		new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
	);
}

describe("Escape > a modal that refuses it", () => {
	it("leaves the sheet beneath it open", () => {
		const sheet = signal(false);
		const dialog = signal(false);
		const view = mount(
			html`${Sheet({
				open: sheet,
				onOpenChange: sheet,
				children: () =>
					SheetContent({ children: () => SheetTitle({ children: "Edit" }) }),
			})}${Dialog({
				open: dialog,
				onOpenChange: dialog,
				children: () =>
					DialogContent({
						dismissOnEscape: false,
						children: () => DialogTitle({ children: "Discard changes?" }),
					}),
			})}`,
		);
		sheet(true);
		dialog(true);
		escapeOnFocus();
		expect(dialog()).toBe(true);
		expect(sheet()).toBe(true);
		// Once answered, Escape reaches the sheet again.
		dialog(false);
		escapeOnFocus();
		expect(sheet()).toBe(false);
		view.dispose();
	});
});

describe("Escape > a submenu", () => {
	it("closes the whole menu", () => {
		const open = signal(false);
		const view = mount(
			DropdownMenu({
				open,
				onOpenChange: open,
				children: () =>
					html`${DropdownMenuTrigger({ children: "Menu" })}${DropdownMenuContent(
						{
							children: () =>
								DropdownMenuSub({
									children: () =>
										html`${DropdownMenuSubTrigger({
											children: "More",
										})}${DropdownMenuSubContent({
											children: () => DropdownMenuItem({ children: "Deeper" }),
										})}`,
								}),
						},
					)}`,
			}),
		);
		open(true);
		document
			.querySelector("[data-slot='dropdown-menu-sub-trigger']")
			?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
		expect(
			document.querySelector("[data-slot='dropdown-menu-sub-content']"),
		).not.toBeNull();
		escapeOnFocus();
		expect(open()).toBe(false);
		expect(portals().length).toBeLessThanOrEqual(1);
		view.dispose();
	});
});
