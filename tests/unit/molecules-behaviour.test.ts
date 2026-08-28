import { afterEach, describe, expect, it, vi } from "vitest";
import { Accordion } from "../../src/molecules/Accordion.js";
import { Collapsible } from "../../src/molecules/Collapsible.js";
import { InputOTP } from "../../src/molecules/InputOTP.js";
import { Resizable } from "../../src/molecules/Resizable.js";
import { Tabs } from "../../src/molecules/Tabs.js";
import { ToggleGroup } from "../../src/molecules/ToggleGroup.js";
import { mount, press } from "./helpers.js";

afterEach(() => {
	document.body.innerHTML = "";
});

const all = (selector: string): HTMLElement[] => [
	...document.querySelectorAll<HTMLElement>(selector),
];

describe("Collapsible", () => {
	it("starts closed, with the panel inert and flattened", () => {
		// Inert matters: the panel stays in the DOM so the grid transition can
		// run, and without it a keyboard user tabs into content off screen.
		const view = mount(Collapsible({ trigger: "More", children: "Detail" }));
		const trigger = document.querySelector("[data-slot='collapsible-trigger']");
		const panel = document.querySelector<HTMLElement>(
			"[data-slot='collapsible-content']",
		);

		expect(trigger?.getAttribute("aria-expanded")).toBe("false");
		expect(panel?.hasAttribute("inert")).toBe(true);
		expect(panel?.style.gridTemplateRows).toBe("0fr");
		view.dispose();
	});

	it("opens on click and drops inert", () => {
		const view = mount(Collapsible({ trigger: "More", children: "Detail" }));
		document
			.querySelector<HTMLElement>("[data-slot='collapsible-trigger']")
			?.click();

		const trigger = document.querySelector("[data-slot='collapsible-trigger']");
		const panel = document.querySelector<HTMLElement>(
			"[data-slot='collapsible-content']",
		);
		expect(trigger?.getAttribute("aria-expanded")).toBe("true");
		expect(panel?.hasAttribute("inert")).toBe(false);
		expect(panel?.style.gridTemplateRows).toBe("1fr");
		view.dispose();
	});

	it("points the trigger at the panel it controls", () => {
		const view = mount(Collapsible({ trigger: "More", children: "Detail" }));
		const trigger = document.querySelector("[data-slot='collapsible-trigger']");
		const panel = document.querySelector("[data-slot='collapsible-content']");
		expect(trigger?.getAttribute("aria-controls")).toBe(panel?.id);
		expect(panel?.getAttribute("aria-labelledby")).toBe(trigger?.id);
		view.dispose();
	});

	it("refuses to open while disabled", () => {
		const view = mount(
			Collapsible({ trigger: "More", children: "x", disabled: true }),
		);
		document
			.querySelector<HTMLElement>("[data-slot='collapsible-trigger']")
			?.click();
		expect(
			document
				.querySelector("[data-slot='collapsible-trigger']")
				?.getAttribute("aria-expanded"),
		).toBe("false");
		view.dispose();
	});
});

describe("Accordion", () => {
	const items = [
		{ value: "a", trigger: "A", content: "Body A" },
		{ value: "b", trigger: "B", content: "Body B" },
	];

	it("closes the open section when another opens, in single mode", () => {
		const view = mount(Accordion({ items }));
		const triggers = all("[data-slot='accordion-trigger']");

		triggers[0]?.click();
		expect(triggers[0]?.getAttribute("aria-expanded")).toBe("true");

		triggers[1]?.click();
		expect(triggers[0]?.getAttribute("aria-expanded")).toBe("false");
		expect(triggers[1]?.getAttribute("aria-expanded")).toBe("true");
		view.dispose();
	});

	it("keeps sections independent in multiple mode", () => {
		const view = mount(Accordion({ items, type: "multiple" }));
		const triggers = all("[data-slot='accordion-trigger']");
		triggers[0]?.click();
		triggers[1]?.click();
		expect(triggers[0]?.getAttribute("aria-expanded")).toBe("true");
		expect(triggers[1]?.getAttribute("aria-expanded")).toBe("true");
		view.dispose();
	});

	it("lets a single accordion close entirely by default", () => {
		const view = mount(Accordion({ items }));
		const trigger = all("[data-slot='accordion-trigger']")[0];
		trigger?.click();
		trigger?.click();
		expect(trigger?.getAttribute("aria-expanded")).toBe("false");
		view.dispose();
	});

	it("holds the last section open when collapsible is off", () => {
		const view = mount(
			Accordion({ items, collapsible: false, defaultValue: "a" }),
		);
		const trigger = all("[data-slot='accordion-trigger']")[0];
		trigger?.click();
		expect(trigger?.getAttribute("aria-expanded")).toBe("true");
		view.dispose();
	});

	it("reports the open set on change", () => {
		const onValueChange = vi.fn<(open: readonly string[]) => void>();
		const view = mount(Accordion({ items, type: "multiple", onValueChange }));
		all("[data-slot='accordion-trigger']")[0]?.click();
		all("[data-slot='accordion-trigger']")[1]?.click();
		expect(onValueChange).toHaveBeenLastCalledWith(["a", "b"]);
		view.dispose();
	});

	it("opens what defaultValue names", () => {
		const view = mount(Accordion({ items, defaultValue: "b" }));
		const triggers = all("[data-slot='accordion-trigger']");
		expect(triggers[1]?.getAttribute("aria-expanded")).toBe("true");
		view.dispose();
	});
});

describe("Tabs", () => {
	const items = [
		{ value: "a", label: "A", content: "Panel A" },
		{ value: "b", label: "B", content: "Panel B" },
	];

	it("selects the first tab and hides the other panel", () => {
		const view = mount(Tabs({ items }));
		const tabs = all("[role='tab']");
		const panels = all("[role='tabpanel']");
		expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
		expect(panels[0]?.hasAttribute("hidden")).toBe(false);
		expect(panels[1]?.hasAttribute("hidden")).toBe(true);
		view.dispose();
	});

	it("switches on click", () => {
		const onValueChange = vi.fn<(value: string) => void>();
		const view = mount(Tabs({ items, onValueChange }));
		all("[role='tab']")[1]?.click();

		expect(all("[role='tab']")[1]?.getAttribute("aria-selected")).toBe("true");
		expect(all("[role='tabpanel']")[1]?.hasAttribute("hidden")).toBe(false);
		expect(onValueChange).toHaveBeenCalledWith("b");
		view.dispose();
	});

	it("keeps hidden panels mounted, so their state survives", () => {
		// Unmounting would lose a half-filled form or a scroll position on every
		// trip to another tab.
		const view = mount(Tabs({ items }));
		all("[role='tab']")[1]?.click();
		expect(all("[role='tabpanel']")).toHaveLength(2);
		view.dispose();
	});

	it("pairs each tab with its panel both ways", () => {
		const view = mount(Tabs({ items }));
		const tabs = all("[role='tab']");
		const panels = all("[role='tabpanel']");
		expect(tabs[0]?.getAttribute("aria-controls")).toBe(panels[0]?.id);
		expect(panels[0]?.getAttribute("aria-labelledby")).toBe(tabs[0]?.id);
		view.dispose();
	});

	it("skips a disabled tab when choosing the default", () => {
		const view = mount(
			Tabs({
				items: [
					{ value: "a", label: "A", content: "x", disabled: true },
					items[1],
				],
			}),
		);
		expect(all("[role='tab']")[1]?.getAttribute("aria-selected")).toBe("true");
		view.dispose();
	});
});

describe("ToggleGroup", () => {
	const items = [
		{ value: "left", label: "L" },
		{ value: "center", label: "C" },
	];

	it("announces a single-select group as radios", () => {
		// The pairing that matters: a single-select group announcing "pressed"
		// tells a screen-reader user they can turn several on at once.
		const view = mount(ToggleGroup({ items, type: "single" }));
		const group = document.querySelector("[data-slot='toggle-group']");
		expect(group?.getAttribute("role")).toBe("radiogroup");
		const buttons = all("[data-slot='toggle-group-item']");
		expect(buttons[0]?.getAttribute("role")).toBe("radio");
		expect(buttons[0]?.hasAttribute("aria-pressed")).toBe(false);
		view.dispose();
	});

	it("announces a multi-select group as pressed toggles", () => {
		const view = mount(ToggleGroup({ items, type: "multiple" }));
		const buttons = all("[data-slot='toggle-group-item']");
		expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");
		expect(buttons[0]?.hasAttribute("role")).toBe(false);
		view.dispose();
	});

	it("replaces the selection in single mode", () => {
		const onValueChange = vi.fn<(value: readonly string[]) => void>();
		const view = mount(ToggleGroup({ items, type: "single", onValueChange }));
		const buttons = all("[data-slot='toggle-group-item']");
		buttons[0]?.click();
		buttons[1]?.click();
		expect(onValueChange).toHaveBeenLastCalledWith(["center"]);
		view.dispose();
	});

	it("accumulates in multiple mode and toggles back off", () => {
		const onValueChange = vi.fn<(value: readonly string[]) => void>();
		const view = mount(ToggleGroup({ items, type: "multiple", onValueChange }));
		const buttons = all("[data-slot='toggle-group-item']");
		buttons[0]?.click();
		buttons[1]?.click();
		expect(onValueChange).toHaveBeenLastCalledWith(["left", "center"]);
		buttons[0]?.click();
		expect(onValueChange).toHaveBeenLastCalledWith(["center"]);
		view.dispose();
	});
});

describe("InputOTP", () => {
	function boxes(): HTMLInputElement[] {
		return [
			...document.querySelectorAll<HTMLInputElement>("input[data-otp-index]"),
		];
	}

	function type(box: HTMLInputElement, value: string): void {
		box.value = value;
		box.dispatchEvent(new Event("input", { bubbles: true }));
	}

	it("renders one box per character and one hidden field", () => {
		const view = mount(InputOTP({ length: 4, name: "code" }));
		expect(boxes()).toHaveLength(4);
		// One field, not four — the control posts as a single value.
		expect(
			document.querySelectorAll("input[type='hidden'][name='code']"),
		).toHaveLength(1);
		view.dispose();
	});

	it("advances as you type and mirrors into the hidden field", () => {
		const view = mount(InputOTP({ length: 3, name: "code" }));
		const inputs = boxes();
		type(inputs[0] as HTMLInputElement, "1");
		expect(document.activeElement).toBe(inputs[1]);
		type(inputs[1] as HTMLInputElement, "2");

		const hidden = document.querySelector<HTMLInputElement>(
			"input[type='hidden']",
		);
		expect(hidden?.value).toBe("12");
		view.dispose();
	});

	it("keeps only the last character when a box already holds one", () => {
		const view = mount(InputOTP({ length: 3 }));
		const inputs = boxes();
		type(inputs[0] as HTMLInputElement, "19");
		expect(inputs[0]?.value).toBe("9");
		view.dispose();
	});

	it("steps back and clears on backspace in an empty box", () => {
		// What makes holding backspace erase the whole code.
		const view = mount(InputOTP({ length: 3 }));
		const inputs = boxes();
		type(inputs[0] as HTMLInputElement, "1");
		inputs[1]?.dispatchEvent(press("Backspace"));
		expect(document.activeElement).toBe(inputs[0]);
		view.dispose();
	});

	it("fills every box from a paste, wherever it started", () => {
		const view = mount(InputOTP({ length: 6, name: "code" }));
		const inputs = boxes();
		const paste = new Event("paste", { bubbles: true });
		Object.defineProperty(paste, "clipboardData", {
			value: { getData: () => "482913" },
		});
		inputs[0]?.dispatchEvent(paste);

		expect(inputs.map((input) => input.value).join("")).toBe("482913");
		expect(
			document.querySelector<HTMLInputElement>("input[type='hidden']")?.value,
		).toBe("482913");
		view.dispose();
	});

	it("reports completion once every box is filled", () => {
		const onComplete = vi.fn<(value: string) => void>();
		const view = mount(InputOTP({ length: 2, onComplete }));
		const inputs = boxes();
		type(inputs[0] as HTMLInputElement, "7");
		expect(onComplete).not.toHaveBeenCalled();
		type(inputs[1] as HTMLInputElement, "9");
		expect(onComplete).toHaveBeenCalledWith("79");
		view.dispose();
	});

	it("offers the code to the OS autofill on the first box only", () => {
		const view = mount(InputOTP({ length: 3 }));
		const inputs = boxes();
		expect(inputs[0]?.getAttribute("autocomplete")).toBe("one-time-code");
		expect(inputs[1]?.getAttribute("autocomplete")).toBe("off");
		view.dispose();
	});
});

describe("Resizable", () => {
	it("exposes the divider as a separator with a live value", () => {
		// A resizable layout reachable only by dragging is unusable by keyboard,
		// and a divider with no value says nothing about where it sits.
		const view = mount(Resizable({ first: "L", second: "R", defaultSize: 40 }));
		const handle = document.querySelector("[data-slot='resizable-handle']");
		expect(handle?.getAttribute("role")).toBe("separator");
		expect(handle?.getAttribute("aria-valuenow")).toBe("40");
		expect(handle?.getAttribute("aria-orientation")).toBe("vertical");
		view.dispose();
	});

	it("moves with the arrows", () => {
		const onResize = vi.fn<(percent: number) => void>();
		const view = mount(
			Resizable({ first: "L", second: "R", defaultSize: 50, onResize }),
		);
		const handle = document.querySelector<HTMLElement>(
			"[data-slot='resizable-handle']",
		);

		handle?.dispatchEvent(press("ArrowRight"));
		expect(onResize).toHaveBeenLastCalledWith(55);
		handle?.dispatchEvent(press("ArrowLeft"));
		expect(onResize).toHaveBeenLastCalledWith(50);
		view.dispose();
	});

	it("jumps to the bounds with Home and End, and clamps to them", () => {
		const view = mount(
			Resizable({
				first: "L",
				second: "R",
				defaultSize: 50,
				minSize: 20,
				maxSize: 80,
			}),
		);
		const handle = document.querySelector<HTMLElement>(
			"[data-slot='resizable-handle']",
		);

		handle?.dispatchEvent(press("End"));
		expect(handle?.getAttribute("aria-valuenow")).toBe("80");
		handle?.dispatchEvent(press("ArrowRight"));
		expect(handle?.getAttribute("aria-valuenow")).toBe("80");

		handle?.dispatchEvent(press("Home"));
		expect(handle?.getAttribute("aria-valuenow")).toBe("20");
		view.dispose();
	});

	it("swaps to the vertical axis and its arrows", () => {
		const view = mount(
			Resizable({ first: "T", second: "B", direction: "vertical" }),
		);
		const handle = document.querySelector<HTMLElement>(
			"[data-slot='resizable-handle']",
		);
		expect(handle?.getAttribute("aria-orientation")).toBe("horizontal");

		handle?.dispatchEvent(press("ArrowDown"));
		expect(handle?.getAttribute("aria-valuenow")).toBe("55");
		view.dispose();
	});
});
