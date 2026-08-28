/**
 * The smoke test mounts every overlay closed, so none of their content is ever
 * built. These open them.
 *
 * What is checked is the contract shared by all of them rather than each one's
 * markup: the panel exists, it is announced with the right role and name, the
 * close routes work, and nothing is left in the body afterwards.
 */

import { signal } from "@c9up/aurora";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlertDialog } from "../../src/organisms/AlertDialog.js";
import { Combobox } from "../../src/organisms/Combobox.js";
import { CommandDialog } from "../../src/organisms/CommandDialog.js";
import { DatePicker } from "../../src/organisms/DatePicker.js";
import { DateRangePicker } from "../../src/organisms/DateRangePicker.js";
import { Dialog } from "../../src/organisms/Dialog.js";
import { Drawer } from "../../src/organisms/Drawer.js";
import { DropdownMenu } from "../../src/organisms/DropdownMenu.js";
import { HoverCard } from "../../src/organisms/HoverCard.js";
import { Popover } from "../../src/organisms/Popover.js";
import { Sheet } from "../../src/organisms/Sheet.js";
import { Tooltip } from "../../src/organisms/Tooltip.js";
import { mount, portals, press } from "./helpers.js";

afterEach(() => {
	vi.useRealTimers();
	document.body.innerHTML = "";
	document.body.style.cssText = "";
});

const one = (selector: string): HTMLElement | null =>
	document.querySelector<HTMLElement>(selector);
const all = (selector: string): HTMLElement[] => [
	...document.querySelectorAll<HTMLElement>(selector),
];
const clickTrigger = (slot: string): void =>
	one(`[data-slot='${slot}']`)?.click();
const pressEscape = (): void => {
	document.dispatchEvent(press("Escape"));
};
const hover = (element: HTMLElement | null, type: string): void => {
	element?.dispatchEvent(new MouseEvent(type, { bubbles: true }));
};

describe("Dialog", () => {
	it("opens from its trigger and names itself with its title", () => {
		const view = mount(
			Dialog({
				trigger: "Edit",
				title: "Edit profile",
				description: "Change it.",
			}),
		);
		clickTrigger("dialog-trigger");

		const panel = one("[data-slot='dialog-content']");
		expect(panel?.getAttribute("role")).toBe("dialog");
		expect(panel?.getAttribute("aria-modal")).toBe("true");
		const titleId = panel?.getAttribute("aria-labelledby");
		expect(document.getElementById(titleId ?? "")?.textContent).toContain(
			"Edit profile",
		);
		view.dispose();
	});

	it("closes from its corner button", () => {
		const view = mount(Dialog({ trigger: "Edit", title: "Edit" }));
		clickTrigger("dialog-trigger");
		one("[data-slot='dialog-close']")?.click();
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("can hide the close button and still answer Escape", () => {
		const view = mount(
			Dialog({ trigger: "Edit", title: "Edit", hideCloseButton: true }),
		);
		clickTrigger("dialog-trigger");
		expect(one("[data-slot='dialog-close']")).toBeNull();
		pressEscape();
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("keeps a hidden title available to screen readers", () => {
		const view = mount(
			Dialog({ trigger: "Edit", title: "Edit", srOnlyTitle: true }),
		);
		clickTrigger("dialog-trigger");
		const title = one("[data-slot='dialog-title']");
		expect(title?.className).toContain("sr-only");
		expect(title?.textContent).toContain("Edit");
		view.dispose();
	});

	it("opens from a signal when it has no trigger of its own", () => {
		const open = signal(false);
		const view = mount(Dialog({ title: "Remote", open, onOpenChange: open }));
		expect(portals()).toHaveLength(0);
		open(true);
		expect(one("[data-slot='dialog-content']")).not.toBeNull();
		view.dispose();
	});

	it("renders a footer when given one", () => {
		const view = mount(
			Dialog({ trigger: "Edit", title: "Edit", footer: "Save" }),
		);
		clickTrigger("dialog-trigger");
		expect(one("[data-slot='dialog-footer']")?.textContent).toContain("Save");
		view.dispose();
	});
});

describe("AlertDialog", () => {
	function open(props: Parameters<typeof AlertDialog>[0]) {
		const view = mount(AlertDialog(props));
		clickTrigger("alert-dialog-trigger");
		return view;
	}

	it("announces itself as an alertdialog", () => {
		const view = open({
			trigger: "Delete",
			title: "Sure?",
			description: "Cannot be undone.",
		});
		expect(
			one("[data-slot='alert-dialog-content']")?.getAttribute("role"),
		).toBe("alertdialog");
		view.dispose();
	});

	it("starts focus on Cancel, not on the action", () => {
		// The destructive button is the one the user must reach for on purpose.
		const view = open({ trigger: "Delete", title: "Sure?", description: "x" });
		expect(document.activeElement?.getAttribute("data-slot")).toBe(
			"alert-dialog-cancel",
		);
		view.dispose();
	});

	it("refuses to be dismissed by a click outside", () => {
		const onCancel = vi.fn();
		const view = open({
			trigger: "Delete",
			title: "Sure?",
			description: "x",
			onCancel,
		});
		one(
			"[data-slot='alert-dialog-content']",
		)?.parentElement?.firstElementChild?.dispatchEvent(
			new MouseEvent("pointerdown", { bubbles: true, composed: true }),
		);
		expect(portals()).toHaveLength(1);
		view.dispose();
	});

	it("still closes on Escape, reported as a cancel", () => {
		const onCancel = vi.fn();
		const view = open({
			trigger: "Delete",
			title: "Sure?",
			description: "x",
			onCancel,
		});
		pressEscape();
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("confirms and closes from the action", () => {
		const onConfirm = vi.fn();
		const view = open({
			trigger: "Delete",
			title: "Sure?",
			description: "x",
			onConfirm,
		});
		one("[data-slot='alert-dialog-action']")?.click();
		expect(onConfirm).toHaveBeenCalledTimes(1);
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("labels its buttons as asked", () => {
		const view = open({
			trigger: "Delete",
			title: "Sure?",
			description: "x",
			actionLabel: "Delete it",
			cancelLabel: "Keep",
		});
		expect(one("[data-slot='alert-dialog-action']")?.textContent).toContain(
			"Delete it",
		);
		expect(one("[data-slot='alert-dialog-cancel']")?.textContent).toContain(
			"Keep",
		);
		view.dispose();
	});
});

describe("Sheet and Drawer", () => {
	it("opens a sheet from the side it was told", () => {
		const view = mount(
			Sheet({ trigger: "Filters", title: "Filters", side: "left" }),
		);
		clickTrigger("sheet-trigger");
		const panel = one("[data-slot='sheet-content']");
		expect(panel?.getAttribute("data-side")).toBe("left");
		expect(panel?.getAttribute("aria-modal")).toBe("true");
		view.dispose();
	});

	it("closes a sheet from its own button", () => {
		const view = mount(Sheet({ trigger: "Filters", title: "Filters" }));
		clickTrigger("sheet-trigger");
		one("[data-slot='sheet-close']")?.click();
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("gives the drawer a grab handle that is decorative only", () => {
		// Everything the drag does, Escape and the backdrop already do — a
		// gesture must never be the only way out of a modal surface.
		const view = mount(Drawer({ trigger: "More", title: "More" }));
		clickTrigger("drawer-trigger");
		expect(
			one("[data-slot='drawer-handle']")?.getAttribute("aria-hidden"),
		).toBe("true");
		pressEscape();
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("renders drawer content and footer", () => {
		const view = mount(
			Drawer({
				trigger: "More",
				title: "More",
				children: "Body",
				footer: "Done",
			}),
		);
		clickTrigger("drawer-trigger");
		expect(one("[data-slot='drawer-content']")?.textContent).toContain("Body");
		expect(one("[data-slot='drawer-content']")?.textContent).toContain("Done");
		view.dispose();
	});
});

describe("Popover and DropdownMenu", () => {
	it("opens a popover and marks the trigger expanded", () => {
		const view = mount(Popover({ trigger: "Open", children: "Panel" }));
		clickTrigger("popover-trigger");
		expect(
			one("[data-slot='popover-trigger']")?.getAttribute("aria-expanded"),
		).toBe("true");
		expect(one("[data-slot='popover-content']")?.textContent).toContain(
			"Panel",
		);
		view.dispose();
	});

	it("toggles the popover shut from the same trigger", () => {
		const view = mount(Popover({ trigger: "Open", children: "Panel" }));
		clickTrigger("popover-trigger");
		clickTrigger("popover-trigger");
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("traps focus in a modal popover only", () => {
		const view = mount(
			Popover({ trigger: "Open", modal: true, children: "Panel" }),
		);
		clickTrigger("popover-trigger");
		expect(
			one("[data-slot='popover-content']")?.contains(document.activeElement),
		).toBe(true);
		view.dispose();
	});

	it("opens a dropdown menu with its entries", () => {
		const view = mount(
			DropdownMenu({
				trigger: "Menu",
				entries: [{ label: "Cut" }, { label: "Copy" }],
			}),
		);
		clickTrigger("dropdown-menu-trigger");
		expect(all("[role='menuitem']")).toHaveLength(2);
		view.dispose();
	});

	it("enters the menu when opened from the keyboard, not from a click", () => {
		// A keyboard user has no other way in; pre-highlighting for a mouse user
		// suggests an item is about to be chosen.
		const clicked = mount(
			DropdownMenu({ trigger: "Menu", entries: [{ label: "Cut" }] }),
		);
		clickTrigger("dropdown-menu-trigger");
		expect(document.activeElement?.getAttribute("role")).not.toBe("menuitem");
		clicked.dispose();

		const typed = mount(
			DropdownMenu({ trigger: "Menu", entries: [{ label: "Cut" }] }),
		);
		one("[data-slot='dropdown-menu-trigger']")?.dispatchEvent(
			press("ArrowDown"),
		);
		expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
		typed.dispose();
	});

	it("runs an entry and closes the menu", () => {
		const onSelect = vi.fn();
		const view = mount(
			DropdownMenu({ trigger: "Menu", entries: [{ label: "Cut", onSelect }] }),
		);
		clickTrigger("dropdown-menu-trigger");
		one("[role='menuitem']")?.click();
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(portals()).toHaveLength(0);
		view.dispose();
	});
});

describe("Tooltip and HoverCard", () => {
	it("describes its trigger rather than naming it", () => {
		// A tooltip supplements a control's name; a button labelled only by its
		// tooltip is unlabelled to anything that does not hover.
		vi.useFakeTimers();
		const view = mount(Tooltip({ trigger: "?", content: "Delete this" }));
		hover(one("[data-slot='tooltip-trigger']"), "focusin");
		vi.runOnlyPendingTimers();

		const tip = one("[data-slot='tooltip-content']");
		expect(tip?.getAttribute("role")).toBe("tooltip");
		expect(
			one("[data-slot='tooltip-trigger']")?.getAttribute("aria-describedby"),
		).toBe(tip?.id);
		view.dispose();
	});

	it("opens instantly on focus, since a keyboard user already committed", () => {
		vi.useFakeTimers();
		const view = mount(Tooltip({ trigger: "?", content: "Help" }));
		hover(one("[data-slot='tooltip-trigger']"), "focusin");
		vi.advanceTimersByTime(0);
		expect(one("[data-slot='tooltip-content']")).not.toBeNull();
		view.dispose();
	});

	it("waits before opening on hover", () => {
		vi.useFakeTimers();
		const view = mount(
			Tooltip({ trigger: "?", content: "Help", openDelay: 500 }),
		);
		hover(one("[data-slot='tooltip-trigger']"), "pointerenter");
		vi.advanceTimersByTime(100);
		expect(one("[data-slot='tooltip-content']")).toBeNull();
		vi.advanceTimersByTime(500);
		expect(one("[data-slot='tooltip-content']")).not.toBeNull();
		view.dispose();
	});

	it("holds a hover card open while the pointer travels into it", () => {
		// The gap between trigger and card is what a naive mouseleave closes.
		vi.useFakeTimers();
		const view = mount(
			HoverCard({ trigger: "@ada", children: "Ada Lovelace", openDelay: 0 }),
		);
		hover(one("[data-slot='hover-card-trigger']"), "pointerenter");
		vi.runOnlyPendingTimers();

		const card = one("[data-slot='hover-card-content']");
		expect(card?.getAttribute("role")).toBe("dialog");
		hover(one("[data-slot='hover-card-trigger']"), "pointerleave");
		hover(card, "pointerenter");
		vi.advanceTimersByTime(1000);
		expect(one("[data-slot='hover-card-content']")).not.toBeNull();
		view.dispose();
	});
});

describe("Combobox, CommandDialog and the date pickers", () => {
	it("opens a combobox onto its search field", () => {
		const view = mount(
			Combobox({
				options: [{ value: "a", label: "Apple" }],
				searchPlaceholder: "Find",
			}),
		);
		clickTrigger("combobox-trigger");
		expect(one("[data-slot='command-input']")).toBe(document.activeElement);
		view.dispose();
	});

	it("picks from the combobox and shows it on the trigger", () => {
		const onValueChange = vi.fn<(value: string) => void>();
		const view = mount(
			Combobox({
				options: [{ value: "a", label: "Apple" }],
				name: "fruit",
				onValueChange,
			}),
		);
		clickTrigger("combobox-trigger");
		one("[role='option']")?.click();

		expect(onValueChange).toHaveBeenCalledWith("a");
		expect(one("[data-slot='combobox-trigger']")?.textContent).toContain(
			"Apple",
		);
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("opens the command palette on its shortcut and toggles it shut", () => {
		const view = mount(
			CommandDialog({
				items: [{ value: "a", label: "New file" }],
				shortcut: "k",
			}),
		);
		document.dispatchEvent(
			new KeyboardEvent("keydown", { key: "k", metaKey: true }),
		);
		expect(one("[data-slot='command-dialog']")).not.toBeNull();

		document.dispatchEvent(
			new KeyboardEvent("keydown", { key: "k", metaKey: true }),
		);
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("ignores the shortcut key without its modifier", () => {
		const view = mount(CommandDialog({ items: [], shortcut: "k" }));
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("opens a date picker onto the focused day", () => {
		// Landing on the previous-month arrow would make the first arrow key page
		// the calendar instead of moving a day.
		const view = mount(DatePicker({ defaultValue: new Date(2026, 5, 10) }));
		clickTrigger("date-picker-trigger");
		expect(document.activeElement?.hasAttribute("data-cursor")).toBe(true);
		view.dispose();
	});

	it("closes the date picker on choosing a day", () => {
		const onValueChange = vi.fn<(date: Date) => void>();
		const view = mount(
			DatePicker({ defaultValue: new Date(2026, 5, 10), onValueChange }),
		);
		clickTrigger("date-picker-trigger");
		one("[data-slot='calendar-day'][data-cursor]")?.click();
		expect(onValueChange).toHaveBeenCalledTimes(1);
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("keeps the range picker open between the two clicks", () => {
		// Closing on the first and reopening for the second makes the control
		// feel broken.
		const view = mount(
			DateRangePicker({ defaultValue: { from: new Date(2026, 5, 10) } }),
		);
		clickTrigger("date-range-picker-trigger");
		const inMonth = (): HTMLElement[] =>
			all("[data-slot='calendar-day']").filter(
				(day) => day.getAttribute("data-outside") === null,
			);
		inMonth()[4]?.click();
		expect(portals()).toHaveLength(1);
		// Re-queried: choosing a day must not rebuild the grid, but the assertion
		// should not depend on that either.
		inMonth()[9]?.click();
		expect(portals()).toHaveLength(0);
		view.dispose();
	});
});
