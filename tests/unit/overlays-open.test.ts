/**
 * The smoke test mounts every overlay closed, so none of their content is ever
 * built. These open them.
 *
 * What is checked is the contract shared by all of them rather than each one's
 * markup: the panel exists, it is announced with the right role and name, the
 * close routes work, and nothing is left in the body afterwards.
 */

import { html, signal } from "@c9up/aurora";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Reactive } from "../../src/lib/props.js";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "../../src/organisms/AlertDialog.js";
import { Combobox } from "../../src/organisms/Combobox.js";
import {
	CommandInput,
	CommandItem,
	CommandList,
} from "../../src/organisms/Command.js";
import { CommandDialog } from "../../src/organisms/CommandDialog.js";
import { DatePicker } from "../../src/organisms/DatePicker.js";
import { DateRangePicker } from "../../src/organisms/DateRangePicker.js";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../../src/organisms/Dialog.js";
import {
	Drawer,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "../../src/organisms/Drawer.js";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "../../src/organisms/DropdownMenu.js";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "../../src/organisms/HoverCard.js";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "../../src/organisms/Popover.js";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "../../src/organisms/Sheet.js";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../../src/organisms/Tooltip.js";
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
const hover = (element: HTMLElement | null | undefined, type: string): void => {
	element?.dispatchEvent(new MouseEvent(type, { bubbles: true }));
};

interface DialogParts {
	trigger?: string;
	title?: string;
	titleSrOnly?: boolean;
	description?: string;
	footer?: string;
	showCloseButton?: boolean;
	open?: Reactive<boolean>;
	onOpenChange?: (open: boolean) => void;
}

/** The parts, assembled. `() =>` so they are built inside `Dialog`'s setup. */
function dialog(parts: DialogParts) {
	return Dialog({
		open: parts.open,
		onOpenChange: parts.onOpenChange,
		children: () =>
			html`${
				parts.trigger === undefined
					? null
					: DialogTrigger({ children: parts.trigger })
			}${DialogContent({
				showCloseButton: parts.showCloseButton,
				children: () =>
					html`${DialogHeader({
						// A VALUE, not a thunk: `DialogHeader` takes a `Slot`, which the
						// renderer calls later, and a part that reads context has to be
						// built while the context is still on the stack.
						children: html`${
							parts.title === undefined
								? null
								: DialogTitle({
										children: parts.title,
										srOnly: parts.titleSrOnly,
									})
						}${
							parts.description === undefined
								? null
								: DialogDescription({ children: parts.description })
						}`,
					})}${
						parts.footer === undefined
							? null
							: DialogFooter({ children: parts.footer })
					}`,
			})}`,
	});
}

describe("Dialog", () => {
	it("opens from its trigger and names itself with its title", () => {
		const view = mount(
			dialog({
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
		const view = mount(dialog({ trigger: "Edit", title: "Edit" }));
		clickTrigger("dialog-trigger");
		one("[data-slot='dialog-close']")?.click();
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("can hide the close button and still answer Escape", () => {
		const view = mount(
			dialog({ trigger: "Edit", title: "Edit", showCloseButton: false }),
		);
		clickTrigger("dialog-trigger");
		expect(one("[data-slot='dialog-close']")).toBeNull();
		pressEscape();
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("keeps a hidden title available to screen readers", () => {
		const view = mount(
			dialog({ trigger: "Edit", title: "Edit", titleSrOnly: true }),
		);
		clickTrigger("dialog-trigger");
		const title = one("[data-slot='dialog-title']");
		expect(title?.className).toContain("sr-only");
		expect(title?.textContent).toContain("Edit");
		view.dispose();
	});

	it("opens from a signal when it has no trigger of its own", () => {
		const open = signal(false);
		const view = mount(dialog({ title: "Remote", open, onOpenChange: open }));
		expect(portals()).toHaveLength(0);
		open(true);
		expect(one("[data-slot='dialog-content']")).not.toBeNull();
		view.dispose();
	});

	it("renders a footer when given one", () => {
		const view = mount(
			dialog({ trigger: "Edit", title: "Edit", footer: "Save" }),
		);
		clickTrigger("dialog-trigger");
		expect(one("[data-slot='dialog-footer']")?.textContent).toContain("Save");
		view.dispose();
	});
});

describe("AlertDialog", () => {
	interface AlertParts {
		trigger: string;
		title: string;
		description?: string;
		actionLabel?: string;
		cancelLabel?: string;
		onConfirm?: () => void;
		onCancel?: () => void;
	}

	/** The parts, assembled. `() =>` so they see the dialog's context. */
	function open(parts: AlertParts) {
		const view = mount(
			AlertDialog({
				onConfirm: parts.onConfirm,
				onCancel: parts.onCancel,
				children: () =>
					html`${AlertDialogTrigger({
						children: parts.trigger,
					})}${AlertDialogContent({
						children: () =>
							html`${AlertDialogHeader({
								children: html`${AlertDialogTitle({
									children: parts.title,
								})}${
									parts.description === undefined
										? null
										: AlertDialogDescription({ children: parts.description })
								}`,
							})}${AlertDialogFooter({
								children: html`${AlertDialogCancel({
									children: parts.cancelLabel ?? "Cancel",
								})}${AlertDialogAction({
									children: parts.actionLabel ?? "Continue",
								})}`,
							})}`,
					})}`,
			}),
		);
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

/** The parts, assembled. `() =>` so they are built inside `Sheet`'s setup. */
function sheet(options: {
	trigger?: string;
	title?: string;
	description?: string;
	footer?: string;
	side?: "top" | "right" | "bottom" | "left";
	showCloseButton?: boolean;
}) {
	return Sheet({
		children: () =>
			html`${
				options.trigger === undefined
					? null
					: SheetTrigger({ children: options.trigger })
			}${SheetContent({
				side: options.side,
				showCloseButton: options.showCloseButton,
				children: () =>
					html`${SheetHeader({
						children: html`${
							options.title === undefined
								? null
								: SheetTitle({ children: options.title })
						}${
							options.description === undefined
								? null
								: SheetDescription({ children: options.description })
						}`,
					})}${
						options.footer === undefined
							? null
							: SheetFooter({ children: options.footer })
					}`,
			})}`,
	});
}

describe("Sheet and Drawer", () => {
	it("opens a sheet from the side it was told", () => {
		const view = mount(
			sheet({ trigger: "Filters", title: "Filters", side: "left" }),
		);
		clickTrigger("sheet-trigger");
		const panel = one("[data-slot='sheet-content']");
		expect(panel?.getAttribute("data-side")).toBe("left");
		expect(panel?.getAttribute("aria-modal")).toBe("true");
		view.dispose();
	});

	it("closes a sheet from its own button", () => {
		const view = mount(sheet({ trigger: "Filters", title: "Filters" }));
		clickTrigger("sheet-trigger");
		one("[data-slot='sheet-close']")?.click();
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("gives the drawer a grab handle that is decorative only", () => {
		// Everything the drag does, Escape and the backdrop already do — a
		// gesture must never be the only way out of a modal surface.
		const view = mount(drawer({}));
		clickTrigger("drawer-trigger");
		expect(
			one("[data-slot='drawer-handle']")?.getAttribute("aria-hidden"),
		).toBe("true");
		pressEscape();
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("renders drawer content and footer", () => {
		const view = mount(drawer({ body: "Body", footer: "Done" }));
		clickTrigger("drawer-trigger");
		expect(one("[data-slot='drawer-content']")?.textContent).toContain("Body");
		expect(one("[data-slot='drawer-content']")?.textContent).toContain("Done");
		view.dispose();
	});
});

/** The parts, assembled. `() =>` so they see `Drawer`'s context. */
function drawer(options: { body?: string; footer?: string }) {
	return Drawer({
		children: () =>
			html`${DrawerTrigger({ children: "More" })}${DrawerContent({
				children: () =>
					html`${DrawerHeader({
						children: DrawerTitle({ children: "More" }),
					})}${options.body ?? null}${
						options.footer === undefined
							? null
							: DrawerFooter({ children: options.footer })
					}`,
			})}`,
	});
}

/** The parts, assembled. `() =>` so they are built inside `Popover`'s setup. */
function popover(trigger: string, body: string, modal?: boolean) {
	return Popover({
		children: () =>
			html`${PopoverTrigger({ children: trigger })}${PopoverContent({
				children: body,
				modal,
			})}`,
	});
}

/** The parts, assembled. `() =>` so they are built inside the menu's setup. */
function dropdown(
	trigger: string,
	items: ReadonlyArray<{ label: string; onSelect?: () => void }>,
) {
	return DropdownMenu({
		children: () =>
			html`${DropdownMenuTrigger({ children: trigger })}${DropdownMenuContent({
				children: () =>
					items.map((item) =>
						DropdownMenuItem({
							children: item.label,
							onSelect: item.onSelect,
						}),
					),
			})}`,
	});
}

describe("Popover and DropdownMenu", () => {
	it("opens a popover and marks the trigger expanded", () => {
		const view = mount(popover("Open", "Panel"));
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
		const view = mount(popover("Open", "Panel"));
		clickTrigger("popover-trigger");
		clickTrigger("popover-trigger");
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("traps focus in a modal popover only", () => {
		const view = mount(popover("Open", "Panel", true));
		clickTrigger("popover-trigger");
		expect(
			one("[data-slot='popover-content']")?.contains(document.activeElement),
		).toBe(true);
		view.dispose();
	});

	it("opens a dropdown menu with its entries", () => {
		const view = mount(dropdown("Menu", [{ label: "Cut" }, { label: "Copy" }]));
		clickTrigger("dropdown-menu-trigger");
		expect(all("[role='menuitem']")).toHaveLength(2);
		view.dispose();
	});

	it("enters the menu when opened from the keyboard, not from a click", () => {
		// A keyboard user has no other way in; pre-highlighting for a mouse user
		// suggests an item is about to be chosen.
		const clicked = mount(dropdown("Menu", [{ label: "Cut" }]));
		clickTrigger("dropdown-menu-trigger");
		expect(document.activeElement?.getAttribute("role")).not.toBe("menuitem");
		clicked.dispose();

		const typed = mount(dropdown("Menu", [{ label: "Cut" }]));
		one("[data-slot='dropdown-menu-trigger']")?.dispatchEvent(
			press("ArrowDown"),
		);
		expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
		typed.dispose();
	});

	it("runs an entry and closes the menu", () => {
		const onSelect = vi.fn();
		const view = mount(dropdown("Menu", [{ label: "Cut", onSelect }]));
		clickTrigger("dropdown-menu-trigger");
		one("[role='menuitem']")?.click();
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(portals()).toHaveLength(0);
		view.dispose();
	});
});

/**
 * The four parts, assembled.
 *
 * `() =>` throughout: Aurora builds eagerly, so a part handed over already
 * built would have run before `Tooltip` provided its context.
 */
function tooltip(trigger: string, content: string, delayDuration?: number) {
	return Tooltip({
		delayDuration,
		children: () =>
			html`${TooltipTrigger({ children: trigger })}${TooltipContent({
				children: content,
			})}`,
	});
}

describe("Tooltip and HoverCard", () => {
	it("describes its trigger rather than naming it", () => {
		// A tooltip supplements a control's name; a button labelled only by its
		// tooltip is unlabelled to anything that does not hover.
		vi.useFakeTimers();
		const view = mount(tooltip("?", "Delete this"));
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
		const view = mount(tooltip("?", "Help"));
		hover(one("[data-slot='tooltip-trigger']"), "focusin");
		vi.advanceTimersByTime(0);
		expect(one("[data-slot='tooltip-content']")).not.toBeNull();
		view.dispose();
	});

	it("waits before opening on hover", () => {
		vi.useFakeTimers();
		const view = mount(tooltip("?", "Help", 500));
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
			HoverCard({
				openDelay: 0,
				children: () =>
					html`${HoverCardTrigger({ children: "@ada" })}${HoverCardContent({
						children: "Ada Lovelace",
					})}`,
			}),
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
				shortcut: "k",
				children: () =>
					html`${CommandInput({})}${CommandList({
						children: () => CommandItem({ value: "a", children: "New file" }),
					})}`,
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
		const view = mount(CommandDialog({ shortcut: "k" }));
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

describe("Tooltip parts", () => {
	it("carries a data-slot on every part, as upstream does", () => {
		// The slots are the styling and testing contract: an app targets
		// `[data-slot='tooltip-content']`, not a class that changes with a theme.
		vi.useFakeTimers();
		const view = mount(tooltip("?", "Help"));
		hover(one("[data-slot='tooltip-trigger']"), "focusin");
		vi.runOnlyPendingTimers();

		expect(one("[data-slot='tooltip-trigger']")).not.toBeNull();
		expect(one("[data-slot='tooltip-content']")).not.toBeNull();
		expect(one("[data-slot='tooltip-arrow']")).not.toBeNull();
		view.dispose();
	});

	it("marks the trigger open, so a style can follow the state", () => {
		vi.useFakeTimers();
		const view = mount(tooltip("?", "Help"));
		const trigger = one("[data-slot='tooltip-trigger']");
		expect(trigger?.getAttribute("data-state")).toBe("closed");
		hover(trigger, "focusin");
		vi.runOnlyPendingTimers();
		expect(trigger?.getAttribute("data-state")).toBe("open");
		view.dispose();
	});

	it("lets the caller own the open state", () => {
		vi.useFakeTimers();
		const open = signal(false);
		const view = mount(
			Tooltip({
				open,
				children: () =>
					html`${TooltipTrigger({ children: "?" })}${TooltipContent({
						children: "Help",
					})}`,
			}),
		);
		expect(one("[data-slot='tooltip-content']")).toBeNull();
		open(true);
		expect(one("[data-slot='tooltip-content']")).not.toBeNull();
		view.dispose();
	});

	it("opens a neighbour instantly inside the provider's skip window", () => {
		// Once one tooltip has shown, the user is browsing the toolbar; serving
		// the delay again makes the interface feel stuck.
		vi.useFakeTimers();
		const view = mount(
			TooltipProvider({
				delayDuration: 500,
				children: () => html`${tooltip("a", "First")}${tooltip("b", "Second")}`,
			}),
		);
		const [first, second] = all("[data-slot='tooltip-trigger']");

		hover(first, "pointerenter");
		vi.advanceTimersByTime(500);
		expect(one("[data-slot='tooltip-content']")).not.toBeNull();

		hover(first, "pointerleave");
		vi.runOnlyPendingTimers();
		hover(second, "pointerenter");
		// No delay advanced: the second one is already up.
		expect(one("[data-slot='tooltip-content']")).not.toBeNull();
		view.dispose();
	});

	it("serves the delay again once the skip window has passed", () => {
		vi.useFakeTimers();
		const view = mount(
			TooltipProvider({
				delayDuration: 500,
				skipDelayDuration: 300,
				children: () => html`${tooltip("a", "First")}${tooltip("b", "Second")}`,
			}),
		);
		const [first, second] = all("[data-slot='tooltip-trigger']");

		hover(first, "pointerenter");
		vi.advanceTimersByTime(500);
		hover(first, "pointerleave");
		vi.runOnlyPendingTimers();
		vi.advanceTimersByTime(400);

		hover(second, "pointerenter");
		expect(one("[data-slot='tooltip-content']")).toBeNull();
		vi.advanceTimersByTime(500);
		expect(one("[data-slot='tooltip-content']")).not.toBeNull();
		view.dispose();
	});

	it("refuses a part used outside its Tooltip", () => {
		// The failure a compound component must not have is silent: a trigger
		// rendered with no state behind it looks fine and never opens.
		expect(() => TooltipTrigger({ children: "?" })).toThrowError(
			/context "Tooltip"/,
		);
	});

	it("refuses children that were built before the Tooltip existed", () => {
		// The eager-evaluation trap, pinned: `children: Part()` runs the part
		// first, so it finds no context. The fix is the `() =>`.
		expect(() =>
			Tooltip({ children: () => TooltipTrigger({ children: "?" }) }),
		).not.toThrow();
		expect(() => TooltipContent({ children: "Help" })).toThrowError(
			/context "Tooltip"/,
		);
	});
});

describe("Popover parts", () => {
	it("renders the presentational parts with their slots", () => {
		const view = mount(
			Popover({
				children: () =>
					html`${PopoverTrigger({ children: "Open" })}${PopoverContent({
						children: () =>
							html`${PopoverHeader({
								children: () =>
									html`${PopoverTitle({
										children: "Dimensions",
									})}${PopoverDescription({ children: "Set the box size." })}`,
							})}`,
					})}`,
			}),
		);
		clickTrigger("popover-trigger");
		expect(one("[data-slot='popover-header']")).not.toBeNull();
		expect(one("[data-slot='popover-title']")?.textContent).toBe("Dimensions");
		expect(one("[data-slot='popover-description']")?.textContent).toBe(
			"Set the box size.",
		);
		view.dispose();
	});

	it("positions against an explicit anchor rather than the trigger", () => {
		// A cell menu whose button sits in the corner but whose panel lines up
		// with the whole cell.
		const view = mount(
			Popover({
				children: () =>
					html`${PopoverAnchor({ children: "cell" })}${PopoverTrigger({
						children: "Open",
					})}${PopoverContent({ children: "Panel" })}`,
			}),
		);
		const anchor = one("[data-slot='popover-anchor']");
		expect(anchor).not.toBeNull();

		const positioned: Element[] = [];
		const original = document.getElementById.bind(document);
		vi.spyOn(document, "getElementById").mockImplementation((id) => {
			const found = original(id);
			if (found !== null) positioned.push(found);
			return found;
		});
		clickTrigger("popover-trigger");
		expect(positioned).toContain(anchor);
		vi.restoreAllMocks();
		view.dispose();
	});

	it("refuses a part used outside its Popover", () => {
		expect(() => PopoverTrigger({ children: "Open" })).toThrowError(
			/context "Popover"/,
		);
	});
});

describe("Dialog parts", () => {
	it("renders every upstream slot", () => {
		const view = mount(
			dialog({
				trigger: "Edit",
				title: "Edit profile",
				description: "Change it.",
				footer: "Save",
			}),
		);
		clickTrigger("dialog-trigger");
		for (const name of [
			"dialog-portal",
			"dialog-overlay",
			"dialog-content",
			"dialog-header",
			"dialog-title",
			"dialog-description",
			"dialog-footer",
			"dialog-close",
		]) {
			expect(one(`[data-slot='${name}']`), name).not.toBeNull();
		}
		view.dispose();
	});

	it("describes itself with the description, when there is one", () => {
		const view = mount(
			dialog({ trigger: "Edit", title: "Edit", description: "Change it." }),
		);
		clickTrigger("dialog-trigger");
		const panel = one("[data-slot='dialog-content']");
		const describedBy = panel?.getAttribute("aria-describedby");
		expect(document.getElementById(describedBy ?? "")?.textContent).toBe(
			"Change it.",
		);
		view.dispose();
	});

	it("points aria-describedby at nothing when there is no description", () => {
		// An id pointing at an element that does not exist is worse than no
		// attribute: a screen reader announces neither, and nothing says why.
		const view = mount(dialog({ trigger: "Edit", title: "Edit" }));
		clickTrigger("dialog-trigger");
		expect(
			one("[data-slot='dialog-content']")?.hasAttribute("aria-describedby"),
		).toBe(false);
		view.dispose();
	});

	it("warns about a dialog with no title, as upstream does", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const view = mount(dialog({ trigger: "Edit" }));
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("DialogTitle"));
		warn.mockRestore();
		view.dispose();
	});

	it("closes from a DialogClose anywhere in the content", () => {
		const view = mount(
			Dialog({
				children: () =>
					html`${DialogTrigger({ children: "Edit" })}${DialogContent({
						showCloseButton: false,
						children: () =>
							html`${DialogTitle({ children: "Edit" })}${DialogClose({
								children: "Cancel",
							})}`,
					})}`,
			}),
		);
		clickTrigger("dialog-trigger");
		expect(portals()).toHaveLength(1);
		one("[data-slot='dialog-close']")?.click();
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("refuses a part used outside its Dialog", () => {
		expect(() => DialogTrigger({ children: "Edit" })).toThrowError(
			/context "Dialog"/,
		);
	});

	it("refuses a context part hidden inside a lazy Slot", () => {
		// The corollary of the `Parts` rule, and the one that bites. A `Slot` is
		// stored during setup and CALLED by the renderer afterwards; `deferred`
		// below is exactly what `DialogHeader({ children: () => … })` holds, so
		// invoking it here is what the renderer would do, minus an error
		// escaping a render effect where no assertion can see it.
		let deferred: (() => unknown) | undefined;
		const view = mount(
			Dialog({
				children: () => {
					deferred = () => DialogTitle({ children: "x" });
					return html`${DialogTrigger({ children: "Edit" })}${DialogContent({
						children: () => DialogTitle({ children: "x" }),
					})}`;
				},
			}),
		);
		expect(() => deferred?.()).toThrowError(/context "Dialog"/);
		view.dispose();
	});
});

describe("Sheet parts", () => {
	it("renders every upstream slot", () => {
		const view = mount(
			sheet({
				trigger: "Filters",
				title: "Filters",
				description: "Narrow the list.",
				footer: "Done",
			}),
		);
		clickTrigger("sheet-trigger");
		for (const name of [
			"sheet-portal",
			"sheet-overlay",
			"sheet-content",
			"sheet-header",
			"sheet-title",
			"sheet-description",
			"sheet-footer",
			"sheet-close",
		]) {
			expect(one(`[data-slot='${name}']`), name).not.toBeNull();
		}
		view.dispose();
	});

	it("closes from a SheetClose in the footer", () => {
		const view = mount(
			Sheet({
				children: () =>
					html`${SheetTrigger({ children: "Filters" })}${SheetContent({
						showCloseButton: false,
						children: () =>
							html`${SheetTitle({ children: "Filters" })}${SheetFooter({
								children: SheetClose({ children: "Done" }),
							})}`,
					})}`,
			}),
		);
		clickTrigger("sheet-trigger");
		expect(portals()).toHaveLength(1);
		one("[data-slot='sheet-close']")?.click();
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("hides the corner button and still answers Escape", () => {
		const view = mount(
			sheet({ trigger: "Filters", title: "Filters", showCloseButton: false }),
		);
		clickTrigger("sheet-trigger");
		expect(one("[data-slot='sheet-close']")).toBeNull();
		pressEscape();
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("refuses a part used outside its Sheet", () => {
		expect(() => SheetTrigger({ children: "Filters" })).toThrowError(
			/context "Sheet"/,
		);
	});
});

describe("DropdownMenu parts", () => {
	it("renders every upstream slot", () => {
		const view = mount(
			DropdownMenu({
				children: () =>
					html`${DropdownMenuTrigger({
						children: "Menu",
					})}${DropdownMenuContent({
						children: () =>
							html`${DropdownMenuLabel({
								children: "Account",
							})}${DropdownMenuItem({
								children: html`Profile${DropdownMenuShortcut({
									children: "⌘P",
								})}`,
							})}${DropdownMenuSeparator({})}${DropdownMenuCheckboxItem({
								children: "Show bar",
								checked: true,
							})}`,
					})}`,
			}),
		);
		clickTrigger("dropdown-menu-trigger");
		for (const name of [
			"dropdown-menu-content",
			"dropdown-menu-label",
			"dropdown-menu-item",
			"dropdown-menu-shortcut",
			"dropdown-menu-separator",
			"dropdown-menu-checkbox-item",
		]) {
			expect(one(`[data-slot='${name}']`), name).not.toBeNull();
		}
		view.dispose();
	});

	it("marks a checkbox row checked, so a reader announces its state", () => {
		const onCheckedChange = vi.fn();
		const view = mount(
			DropdownMenu({
				children: () =>
					html`${DropdownMenuTrigger({
						children: "Menu",
					})}${DropdownMenuContent({
						children: () =>
							DropdownMenuCheckboxItem({
								children: "Show bar",
								checked: true,
								onCheckedChange,
							}),
					})}`,
			}),
		);
		clickTrigger("dropdown-menu-trigger");
		const row = one("[role='menuitemcheckbox']");
		expect(row?.getAttribute("aria-checked")).toBe("true");
		row?.click();
		// Toggled AWAY from its current value, not blindly to true.
		expect(onCheckedChange).toHaveBeenCalledWith(false);
		view.dispose();
	});

	it("checks exactly the selected radio row", () => {
		const onValueChange = vi.fn();
		const view = mount(
			DropdownMenu({
				children: () =>
					html`${DropdownMenuTrigger({
						children: "Menu",
					})}${DropdownMenuContent({
						children: () =>
							DropdownMenuRadioGroup({
								value: "list",
								onValueChange,
								children: () =>
									html`${DropdownMenuRadioItem({
										value: "list",
										children: "List",
									})}${DropdownMenuRadioItem({
										value: "grid",
										children: "Grid",
									})}`,
							}),
					})}`,
			}),
		);
		clickTrigger("dropdown-menu-trigger");
		const rows = all("[role='menuitemradio']");
		expect(rows.map((row) => row.getAttribute("aria-checked"))).toEqual([
			"true",
			"false",
		]);
		rows[1]?.click();
		expect(onValueChange).toHaveBeenCalledWith("grid");
		view.dispose();
	});

	it("opens a composed submenu from its trigger row", () => {
		const view = mount(
			DropdownMenu({
				children: () =>
					html`${DropdownMenuTrigger({
						children: "Menu",
					})}${DropdownMenuContent({
						children: () =>
							DropdownMenuSub({
								children: () =>
									html`${DropdownMenuSubTrigger({
										children: "More",
									})}${DropdownMenuSubContent({
										children: () => DropdownMenuItem({ children: "Deeper" }),
									})}`,
							}),
					})}`,
			}),
		);
		clickTrigger("dropdown-menu-trigger");
		const row = one("[data-slot='dropdown-menu-sub-trigger']");
		expect(row?.getAttribute("aria-expanded")).toBe("false");
		// A submenu opens when the pointer rests on its row, not on a click —
		// clicking a row that only leads somewhere would be a dead gesture.
		hover(row, "pointerover");
		expect(one("[data-slot='dropdown-menu-sub-content']")).not.toBeNull();
		expect(row?.getAttribute("aria-expanded")).toBe("true");
		view.dispose();
	});

	it("leaves a disabled row unselectable", () => {
		const onSelect = vi.fn();
		const view = mount(
			DropdownMenu({
				children: () =>
					html`${DropdownMenuTrigger({
						children: "Menu",
					})}${DropdownMenuContent({
						children: () =>
							DropdownMenuItem({ children: "Cut", disabled: true, onSelect }),
					})}`,
			}),
		);
		clickTrigger("dropdown-menu-trigger");
		one("[role='menuitem']")?.click();
		expect(onSelect).not.toHaveBeenCalled();
		expect(portals()).toHaveLength(1);
		view.dispose();
	});

	it("refuses a part used outside its DropdownMenu", () => {
		expect(() => DropdownMenuItem({ children: "Cut" })).toThrowError(
			/context "DropdownMenu"/,
		);
	});
});
