import { afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "../../src/organisms/Command.js";
import { ContextMenu } from "../../src/organisms/ContextMenu.js";
import { DataTable } from "../../src/organisms/DataTable.js";
import { Menubar } from "../../src/organisms/Menubar.js";
import { NavigationMenu } from "../../src/organisms/NavigationMenu.js";
import { Questionnaire } from "../../src/organisms/Questionnaire.js";
import { Select } from "../../src/organisms/Select.js";
import { Toaster, toast } from "../../src/organisms/Toaster.js";
import { mount, press } from "./helpers.js";

afterEach(() => {
	toast.clear();
	document.body.innerHTML = "";
	document.body.style.cssText = "";
});

const all = (selector: string): HTMLElement[] => [
	...document.querySelectorAll<HTMLElement>(selector),
];
const one = (selector: string): HTMLElement | null =>
	document.querySelector<HTMLElement>(selector);

const FRUIT = [
	{ value: "apple", label: "Apple" },
	{ value: "banana", label: "Banana" },
	{ value: "cherry", label: "Cherry" },
];

describe("Select", () => {
	it("presents the trigger as a combobox, collapsed", () => {
		const view = mount(Select({ options: FRUIT, placeholder: "Pick one" }));
		const trigger = one("[data-slot='select-trigger']");
		expect(trigger?.getAttribute("role")).toBe("combobox");
		expect(trigger?.getAttribute("aria-expanded")).toBe("false");
		expect(trigger?.textContent).toContain("Pick one");
		view.dispose();
	});

	it("opens a listbox with one option per entry", () => {
		const view = mount(Select({ options: FRUIT }));
		one("[data-slot='select-trigger']")?.click();
		expect(one("[role='listbox']")).not.toBeNull();
		expect(all("[role='option']")).toHaveLength(3);
		view.dispose();
	});

	it("keeps focus on the trigger and names the active option instead", () => {
		// The listbox pattern: focus stays put and `aria-activedescendant` moves,
		// so the reader hears each option without the focus ring jumping.
		const view = mount(Select({ options: FRUIT }));
		const trigger = one("[data-slot='select-trigger']");
		trigger?.click();
		trigger?.focus();
		trigger?.dispatchEvent(press("ArrowDown"));

		const active = trigger?.getAttribute("aria-activedescendant");
		expect(active).not.toBeNull();
		expect(document.activeElement).toBe(trigger);
		expect(one("[role='option'][data-active]")?.id).toBe(active);
		view.dispose();
	});

	it("chooses with Enter and posts the value in a hidden field", () => {
		const onValueChange = vi.fn<(value: string) => void>();
		const view = mount(
			Select({ options: FRUIT, name: "fruit", onValueChange }),
		);
		const trigger = one("[data-slot='select-trigger']");
		trigger?.click();
		trigger?.dispatchEvent(press("ArrowDown"));
		trigger?.dispatchEvent(press("Enter"));

		expect(onValueChange).toHaveBeenCalledTimes(1);
		expect(one("input[type='hidden'][name='fruit']")).not.toBeNull();
		expect(
			document.querySelector<HTMLInputElement>("input[name='fruit']")?.value,
		).not.toBe("");
		view.dispose();
	});

	it("chooses on click and closes", () => {
		const view = mount(Select({ options: FRUIT }));
		one("[data-slot='select-trigger']")?.click();
		all("[role='option']")[1]?.click();

		expect(one("[role='listbox']")).toBeNull();
		expect(one("[data-slot='select-trigger']")?.textContent).toContain(
			"Banana",
		);
		view.dispose();
	});

	it("seeks by typing, without moving focus", () => {
		const view = mount(Select({ options: FRUIT }));
		const trigger = one("[data-slot='select-trigger']");
		trigger?.click();
		trigger?.dispatchEvent(press("c"));

		const active = trigger?.getAttribute("aria-activedescendant");
		expect(document.getElementById(active ?? "")?.textContent).toContain(
			"Cherry",
		);
		view.dispose();
	});

	it("marks the chosen option selected for assistive technology", () => {
		const view = mount(Select({ options: FRUIT, defaultValue: "banana" }));
		one("[data-slot='select-trigger']")?.click();
		const selected = all("[role='option']").filter(
			(option) => option.getAttribute("aria-selected") === "true",
		);
		expect(selected).toHaveLength(1);
		expect(selected[0]?.getAttribute("data-value")).toBe("banana");
		view.dispose();
	});
});

describe("Command", () => {
	const items = [
		{ value: "new", label: "New file" },
		{ value: "open", label: "Open folder", keywords: ["directory"] },
		{ value: "quit", label: "Quit" },
	];

	function search(text: string): void {
		const input = document.querySelector<HTMLInputElement>(
			"[data-slot='command-input']",
		);
		if (input === null) return;
		input.value = text;
		input.dispatchEvent(new Event("input", { bubbles: true }));
	}

	it("lists everything before a query", () => {
		const view = mount(Command({ items }));
		expect(all("[role='option']")).toHaveLength(3);
		view.dispose();
	});

	it("filters on a substring of the label", () => {
		const view = mount(Command({ items }));
		search("op");
		expect(all("[role='option']")).toHaveLength(1);
		expect(one("[role='option']")?.textContent).toContain("Open folder");
		view.dispose();
	});

	it("matches a keyword the label does not contain", () => {
		// Predictable beats clever: "s" reaching "Settings" is a keyword, not a
		// fuzzy score nobody can anticipate.
		const view = mount(Command({ items }));
		search("directory");
		expect(all("[role='option']")).toHaveLength(1);
		expect(one("[role='option']")?.textContent).toContain("Open folder");
		view.dispose();
	});

	it("shows the empty state when nothing matches", () => {
		const view = mount(Command({ items, emptyMessage: "Nothing found." }));
		search("zzzz");
		expect(all("[role='option']")).toHaveLength(0);
		expect(one("[data-slot='command-empty']")?.textContent).toContain(
			"Nothing found.",
		);
		view.dispose();
	});

	it("re-points the highlight at the first result after filtering", () => {
		// Leaving it on an item the query removed means Enter runs something
		// invisible.
		const view = mount(Command({ items }));
		search("qu");
		const input = document.querySelector<HTMLInputElement>(
			"[data-slot='command-input']",
		);
		const active = input?.getAttribute("aria-activedescendant");
		expect(document.getElementById(active ?? "")?.textContent).toContain(
			"Quit",
		);
		view.dispose();
	});

	it("runs the highlighted item on Enter", () => {
		const onSelect = vi.fn();
		const view = mount(Command({ items, onSelect }));
		const input = document.querySelector<HTMLInputElement>(
			"[data-slot='command-input']",
		);
		input?.dispatchEvent(press("ArrowDown"));
		input?.dispatchEvent(press("Enter"));
		expect(onSelect).toHaveBeenCalledTimes(1);
		view.dispose();
	});

	it("keeps focus in the search field while arrowing", () => {
		const view = mount(Command({ items }));
		const input = document.querySelector<HTMLInputElement>(
			"[data-slot='command-input']",
		);
		input?.focus();
		input?.dispatchEvent(press("ArrowDown"));
		expect(document.activeElement).toBe(input);
		view.dispose();
	});
});

describe("DataTable", () => {
	interface Row {
		name: string;
		score: number;
	}
	const rows: Row[] = [
		{ name: "Charlie", score: 30 },
		{ name: "Alice", score: 10 },
		{ name: "Bob", score: 20 },
	];
	const columns = [
		{ key: "name", header: "Name" },
		{ key: "score", header: "Score" },
	];

	const cellsOf = (index: number): string[] =>
		all("tbody tr").map(
			(row) => row.children[index]?.textContent?.trim() ?? "",
		);

	it("renders the rows in the order given", () => {
		const view = mount(
			DataTable({ columns, rows, rowKey: (row: Row) => row.name }),
		);
		expect(cellsOf(0)).toEqual(["Charlie", "Alice", "Bob"]);
		view.dispose();
	});

	it("sorts a column and reports it with aria-sort", () => {
		// The chevron says which column is sorted to anyone who can see it;
		// aria-sort is what says it to everyone else.
		const view = mount(
			DataTable({ columns, rows, rowKey: (row: Row) => row.name }),
		);
		const heads = all("th");
		expect(heads[0]?.getAttribute("aria-sort")).toBe("none");

		heads[0]?.click();
		expect(heads[0]?.getAttribute("aria-sort")).toBe("ascending");
		expect(cellsOf(0)).toEqual(["Alice", "Bob", "Charlie"]);

		heads[0]?.click();
		expect(heads[0]?.getAttribute("aria-sort")).toBe("descending");
		expect(cellsOf(0)).toEqual(["Charlie", "Bob", "Alice"]);
		view.dispose();
	});

	it("sorts numbers numerically, not as strings", () => {
		const many: Row[] = [
			{ name: "a", score: 100 },
			{ name: "b", score: 9 },
		];
		const view = mount(
			DataTable({ columns, rows: many, rowKey: (row: Row) => row.name }),
		);
		all("th")[1]?.click();
		expect(cellsOf(1)).toEqual(["9", "100"]);
		view.dispose();
	});

	it("does not reorder the caller's own array", () => {
		const original = [...rows];
		const view = mount(
			DataTable({ columns, rows, rowKey: (row: Row) => row.name }),
		);
		all("th")[0]?.click();
		expect(rows).toEqual(original);
		view.dispose();
	});

	it("filters, and pages the result", () => {
		const view = mount(
			DataTable({
				columns,
				rows,
				rowKey: (row: Row) => row.name,
				pageSize: 2,
				filterMatch: (row: Row, query: string) =>
					row.name.toLowerCase().includes(query),
			}),
		);
		expect(all("tbody tr")).toHaveLength(2);

		const filter = document.querySelector<HTMLInputElement>(
			"input[type='search']",
		);
		if (filter !== null) {
			filter.value = "li";
			filter.dispatchEvent(new Event("input", { bubbles: true }));
		}
		// Charlie and Alice both contain "li".
		expect(cellsOf(0).sort()).toEqual(["Alice", "Charlie"]);
		view.dispose();
	});

	it("shows an empty message rather than an empty table", () => {
		const view = mount(
			DataTable({
				columns,
				rows: [],
				rowKey: (row: Row) => row.name,
				emptyMessage: "No results.",
			}),
		);
		expect(one("tbody")?.textContent).toContain("No results.");
		view.dispose();
	});

	it("selects only the rows on the current page", () => {
		// Selecting rows the user cannot see — and may have filtered away — is
		// the story behind every "I deleted more than I meant to".
		const onSelectionChange = vi.fn<(keys: readonly string[]) => void>();
		const view = mount(
			DataTable({
				columns,
				rows,
				rowKey: (row: Row) => row.name,
				pageSize: 2,
				selectable: true,
				onSelectionChange,
			}),
		);
		const headerBox = document.querySelector<HTMLInputElement>(
			"thead input[type='checkbox']",
		);
		headerBox?.click();
		expect(onSelectionChange).toHaveBeenLastCalledWith(["Charlie", "Alice"]);
		view.dispose();
	});
});

describe("Questionnaire", () => {
	const questions = [
		{ id: "name", type: "text" as const, prompt: "Your name?", required: true },
		{
			id: "colour",
			type: "single" as const,
			prompt: "Favourite colour?",
			options: [
				{ value: "red", label: "Red" },
				{ value: "blue", label: "Blue" },
			],
		},
	];

	const next = (): void => {
		const buttons = all("button").filter((button) =>
			["Next", "Submit"].includes(button.textContent?.trim() ?? ""),
		);
		buttons[0]?.click();
	};

	it("shows one question at a time, with a counter", () => {
		const view = mount(Questionnaire({ questions, onComplete: () => {} }));
		expect(all("h2")).toHaveLength(1);
		expect(one("[aria-live='polite']")?.textContent).toContain(
			"Question 1 of 2",
		);
		view.dispose();
	});

	it("blocks a required question and explains why", () => {
		// A silently disabled button leaves the reader clicking a dead control.
		const view = mount(Questionnaire({ questions, onComplete: () => {} }));
		next();
		expect(one("[role='alert']")?.textContent).toContain("needs an answer");
		expect(one("h2")?.textContent).toContain("Your name?");
		view.dispose();
	});

	it("says nothing about a required question before an attempt", () => {
		const view = mount(Questionnaire({ questions, onComplete: () => {} }));
		expect(one("[role='alert']")?.textContent?.trim()).toBe("");
		view.dispose();
	});

	it("advances once answered, and keeps the answer on the way back", () => {
		const view = mount(Questionnaire({ questions, onComplete: () => {} }));
		const input =
			document.querySelector<HTMLInputElement>("input[name='name']");
		if (input !== null) {
			input.value = "Ada";
			input.dispatchEvent(new Event("input", { bubbles: true }));
		}
		next();
		expect(one("h2")?.textContent).toContain("Favourite colour?");

		all("button")
			.find((b) => b.textContent?.trim() === "Back")
			?.click();
		expect(
			document.querySelector<HTMLInputElement>("input[name='name']")?.value,
		).toBe("Ada");
		view.dispose();
	});

	it("hands back every answer on completion", () => {
		const onComplete =
			vi.fn<(answers: Readonly<Record<string, unknown>>) => void>();
		const view = mount(Questionnaire({ questions, onComplete }));
		const input =
			document.querySelector<HTMLInputElement>("input[name='name']");
		if (input !== null) {
			input.value = "Ada";
			input.dispatchEvent(new Event("input", { bubbles: true }));
		}
		next();
		document.querySelector<HTMLInputElement>("input[value='blue']")?.click();
		next();
		expect(onComplete).toHaveBeenCalledWith({ name: "Ada", colour: "blue" });
		view.dispose();
	});

	it("offers Skip only where the question allows it", () => {
		const view = mount(Questionnaire({ questions, onComplete: () => {} }));
		const skipOnRequired = all("button").some(
			(b) => b.textContent?.trim() === "Skip",
		);
		expect(skipOnRequired).toBe(false);
		view.dispose();
	});
});

describe("Toaster", () => {
	it("mounts its live regions empty, before anything arrives", () => {
		// A live region inserted with content already in it is not announced by
		// most screen readers.
		const view = mount(Toaster({}));
		expect(one("[role='status'][aria-live='polite']")).not.toBeNull();
		expect(one("[role='alert'][aria-live='assertive']")).not.toBeNull();
		expect(all("[data-slot='toast']")).toHaveLength(0);
		view.dispose();
	});

	it("shows a toast raised from anywhere, with no handle", () => {
		const view = mount(Toaster({}));
		toast.success("Saved");
		expect(all("[data-slot='toast']")).toHaveLength(1);
		expect(one("[data-slot='toast']")?.textContent).toContain("Saved");
		view.dispose();
	});

	it("routes an error to the assertive region and everything else to polite", () => {
		const view = mount(Toaster({}));
		toast.success("Saved");
		toast.error("Failed");

		const polite = one("[role='status']");
		const assertive = one("[role='alert']");
		expect(polite?.textContent).toContain("Saved");
		expect(polite?.textContent).not.toContain("Failed");
		expect(assertive?.textContent).toContain("Failed");
		view.dispose();
	});

	it("dismisses by id", () => {
		const view = mount(Toaster({}));
		const id = toast.show({ title: "Hello", duration: 0 });
		expect(all("[data-slot='toast']")).toHaveLength(1);
		toast.dismiss(id);
		expect(all("[data-slot='toast']")).toHaveLength(0);
		view.dispose();
	});

	it("dismisses from its own close button", () => {
		const view = mount(Toaster({}));
		toast.show({ title: "Hello", duration: 0 });
		one(
			"[data-slot='toast'] button[aria-label='Dismiss notification']",
		)?.click();
		expect(all("[data-slot='toast']")).toHaveLength(0);
		view.dispose();
	});

	it("runs an action and dismisses the toast that offered it", () => {
		const onClick = vi.fn();
		const view = mount(Toaster({}));
		toast.show({
			title: "Deleted",
			duration: 0,
			action: { label: "Undo", onClick },
		});
		all("[data-slot='toast'] button")
			.find((b) => b.textContent?.trim() === "Undo")
			?.click();
		expect(onClick).toHaveBeenCalledTimes(1);
		expect(all("[data-slot='toast']")).toHaveLength(0);
		view.dispose();
	});

	it("is exempt from a modal's aria-hidden sweep", () => {
		// A toast raised while a dialog is open still has to be announced.
		const view = mount(Toaster({}));
		expect(one("[data-slot='toaster']")?.hasAttribute("data-nebula-live")).toBe(
			true,
		);
		view.dispose();
	});
});

describe("Menubar", () => {
	const menus = [
		{ label: "File", entries: [{ label: "New" }] },
		{ label: "Edit", entries: [{ label: "Undo" }] },
	];

	it("presents the bar and its buttons with menubar roles", () => {
		const view = mount(Menubar({ menus }));
		expect(one("[data-slot='menubar']")?.getAttribute("role")).toBe("menubar");
		expect(all("[data-slot='menubar-trigger']")).toHaveLength(2);
		expect(all("[data-slot='menubar-trigger']")[0]?.getAttribute("role")).toBe(
			"menuitem",
		);
		view.dispose();
	});

	it("opens a menu on click and closes it on a second", () => {
		const view = mount(Menubar({ menus }));
		const trigger = all("[data-slot='menubar-trigger']")[0];
		trigger?.click();
		expect(trigger?.getAttribute("aria-expanded")).toBe("true");
		expect(one("[role='menu']")).not.toBeNull();

		trigger?.click();
		expect(trigger?.getAttribute("aria-expanded")).toBe("false");
		view.dispose();
	});

	it("hands over on hover once a menu is already open", () => {
		// What makes it a menubar rather than a row of independent dropdowns.
		const view = mount(Menubar({ menus }));
		const triggers = all("[data-slot='menubar-trigger']");
		triggers[0]?.click();
		triggers[1]?.dispatchEvent(
			new MouseEvent("pointerenter", { bubbles: true }),
		);

		expect(triggers[0]?.getAttribute("aria-expanded")).toBe("false");
		expect(triggers[1]?.getAttribute("aria-expanded")).toBe("true");
		view.dispose();
	});

	it("stays shut when the pointer merely passes over it", () => {
		const view = mount(Menubar({ menus }));
		const triggers = all("[data-slot='menubar-trigger']");
		triggers[0]?.dispatchEvent(
			new MouseEvent("pointerenter", { bubbles: true }),
		);
		expect(triggers[0]?.getAttribute("aria-expanded")).toBe("false");
		view.dispose();
	});

	it("opens with ArrowDown and lands on the first entry", () => {
		// The role, not the text: the panel contains the item, so asserting the
		// focused element's text passes even when focus is stuck on the panel.
		const view = mount(Menubar({ menus }));
		const trigger = all("[data-slot='menubar-trigger']")[0];
		trigger?.dispatchEvent(press("ArrowDown"));

		expect(trigger?.getAttribute("aria-expanded")).toBe("true");
		expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
		expect(document.activeElement?.textContent?.trim()).toBe("New");
		view.dispose();
	});

	it("holds focus on the panel when opened by pointer", () => {
		// Nothing is pre-highlighted for a mouse user, but the panel still needs
		// focus so Escape and the arrows reach it rather than the page behind.
		const view = mount(Menubar({ menus }));
		all("[data-slot='menubar-trigger']")[0]?.click();
		expect(document.activeElement?.getAttribute("role")).toBe("menu");
		view.dispose();
	});

	it("walks the bar with the arrows while closed", () => {
		const view = mount(Menubar({ menus }));
		const triggers = all("[data-slot='menubar-trigger']");
		triggers[0]?.focus();
		triggers[0]?.dispatchEvent(press("ArrowRight"));
		expect(document.activeElement).toBe(triggers[1]);
		view.dispose();
	});

	it("skips a disabled menu", () => {
		const view = mount(
			Menubar({
				menus: [{ label: "File", entries: [{ label: "New" }], disabled: true }],
			}),
		);
		const trigger = all("[data-slot='menubar-trigger']")[0];
		trigger?.click();
		expect(trigger?.getAttribute("aria-expanded")).toBe("false");
		view.dispose();
	});
});

describe("ContextMenu", () => {
	const entries = [{ label: "Cut" }, { label: "Copy" }];

	it("opens on right-click, at the pointer", () => {
		const view = mount(ContextMenu({ entries, children: "Region" }));
		const region = one("[data-slot='context-menu']");
		const event = new MouseEvent("contextmenu", {
			bubbles: true,
			clientX: 120,
			clientY: 80,
		});
		region?.dispatchEvent(event);

		expect(one("[role='menu']")).not.toBeNull();
		// A zero-size anchor is parked at the coordinates, so the menu flips and
		// shifts off a viewport edge exactly as a button-anchored one would.
		const anchor = region?.querySelector<HTMLElement>(
			"span[aria-hidden='true']",
		);
		expect(anchor?.style.left).toBe("120px");
		expect(anchor?.style.top).toBe("80px");
		view.dispose();
	});

	it("suppresses the browser's own menu", () => {
		const view = mount(ContextMenu({ entries, children: "Region" }));
		const event = new MouseEvent("contextmenu", {
			bubbles: true,
			cancelable: true,
		});
		one("[data-slot='context-menu']")?.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		view.dispose();
	});

	it("reports opening and closing", () => {
		const onOpenChange = vi.fn<(open: boolean) => void>();
		const view = mount(
			ContextMenu({ entries, children: "Region", onOpenChange }),
		);
		one("[data-slot='context-menu']")?.dispatchEvent(
			new MouseEvent("contextmenu", { bubbles: true }),
		);
		expect(onOpenChange).toHaveBeenLastCalledWith(true);

		document.dispatchEvent(press("Escape"));
		expect(onOpenChange).toHaveBeenLastCalledWith(false);
		view.dispose();
	});

	it("runs an entry and closes", () => {
		const onSelect = vi.fn();
		const view = mount(
			ContextMenu({ entries: [{ label: "Cut", onSelect }], children: "R" }),
		);
		one("[data-slot='context-menu']")?.dispatchEvent(
			new MouseEvent("contextmenu", { bubbles: true }),
		);
		one("[role='menuitem']")?.click();
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(one("[role='menu']")).toBeNull();
		view.dispose();
	});
});

describe("NavigationMenu", () => {
	const items = [
		{ label: "Docs", href: "/docs" },
		{
			label: "Products",
			links: [{ label: "Aurora", href: "/aurora", description: "UI runtime" }],
		},
	];

	it("is a nav of links, never a menu", () => {
		// A menu is a list of commands; this is a list of links, and announcing
		// it as an application menu offers the wrong shortcuts.
		const view = mount(NavigationMenu({ items }));
		expect(one("[data-slot='navigation-menu']")?.tagName).toBe("NAV");
		expect(one("[role='menu']")).toBeNull();
		expect(
			one("[data-slot='navigation-menu-link']")?.getAttribute("href"),
		).toBe("/docs");
		view.dispose();
	});

	it("opens a panel from its trigger and lists the links", () => {
		const view = mount(NavigationMenu({ items }));
		const trigger = one("[data-slot='navigation-menu-trigger']");
		trigger?.click();
		expect(trigger?.getAttribute("aria-expanded")).toBe("true");
		expect(one("[data-slot='navigation-menu-content']")?.textContent).toContain(
			"Aurora",
		);
		view.dispose();
	});

	it("opens on ArrowDown from the keyboard", () => {
		const view = mount(NavigationMenu({ items }));
		const trigger = one("[data-slot='navigation-menu-trigger']");
		trigger?.dispatchEvent(press("ArrowDown"));
		expect(trigger?.getAttribute("aria-expanded")).toBe("true");
		view.dispose();
	});

	it("closes on Escape and gives focus back to the trigger", () => {
		// Focus has to actually be inside the panel for there to be anything to
		// return: `dismissable` handles Escape from a captured document listener,
		// so the restoration lives in `floatingSurface`, guarded on containment
		// precisely so it does not steal focus that was never in the surface.
		const view = mount(NavigationMenu({ items }));
		const trigger = one("[data-slot='navigation-menu-trigger']");
		trigger?.click();

		const link = one("[data-slot='navigation-menu-content'] a");
		link?.focus();
		expect(document.activeElement).toBe(link);

		link?.dispatchEvent(press("Escape"));
		expect(trigger?.getAttribute("aria-expanded")).toBe("false");
		expect(document.activeElement).toBe(trigger);
		view.dispose();
	});

	it("leaves focus alone when the pointer dismissed it", () => {
		const outside = document.createElement("button");
		document.body.appendChild(outside);
		const view = mount(NavigationMenu({ items }));
		one("[data-slot='navigation-menu-trigger']")?.click();

		outside.focus();
		outside.dispatchEvent(
			new MouseEvent("pointerdown", { bubbles: true, composed: true }),
		);
		expect(document.activeElement).toBe(outside);
		view.dispose();
	});

	it("renders arbitrary panel content when given some", () => {
		const view = mount(
			NavigationMenu({
				items: [{ label: "More", content: "Anything at all" }],
			}),
		);
		one("[data-slot='navigation-menu-trigger']")?.click();
		expect(one("[data-slot='navigation-menu-content']")?.textContent).toContain(
			"Anything at all",
		);
		view.dispose();
	});
});
