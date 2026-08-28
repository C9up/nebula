/**
 * Every component, mounted once.
 *
 * Not a substitute for behaviour tests — it asserts almost nothing about what
 * a component *does*. What it catches is the whole class of failures that only
 * appear at mount: a malformed template, a binding pointing at a prop that was
 * renamed, an `onMount` hook that throws on a DOM shape it did not expect, a
 * component that leaves a portal behind when it unmounts.
 *
 * Those are cheap to make and expensive to find later, and one table catches
 * them across the library. The registry test keeps this list honest: if a
 * component is added and not listed here, the count assertion at the bottom
 * fails.
 */

import { form, type TemplateResult } from "@c9up/aurora";
import { afterEach, describe, expect, it } from "vitest";
import * as atoms from "../../src/atoms/index.js";
import { fieldIds } from "../../src/molecules/Field.js";
import * as molecules from "../../src/molecules/index.js";
import * as organisms from "../../src/organisms/index.js";
import * as templates from "../../src/templates/index.js";
import { mount, portals } from "./helpers.js";

interface Case {
	/** Registry name, so a failure names the component the user would install. */
	name: string;
	/** The `data-slot` the root element must carry. */
	slot: string;
	build: () => TemplateResult;
	/**
	 * Skip the unmount half of the check.
	 *
	 * Set only for an environment defect, never to paper over a leak — the
	 * reason belongs beside the flag.
	 */
	skipUnmount?: true;
}

const OPTIONS = [
	{ value: "a", label: "A" },
	{ value: "b", label: "B" },
];

const cases: readonly Case[] = [
	// ─── atoms ─────────────────────────────────────────────────────────
	{
		name: "aspect-ratio",
		slot: "aspect-ratio",
		build: () => atoms.AspectRatio({ ratio: 16 / 9 }),
	},
	{
		name: "avatar",
		slot: "avatar",
		build: () => atoms.Avatar({ fallback: "AB" }),
	},
	{
		name: "badge",
		slot: "badge",
		build: () => atoms.Badge({ children: "New" }),
	},
	{
		name: "button",
		slot: "button",
		build: () => atoms.Button({ children: "Save" }),
	},
	{
		name: "checkbox",
		slot: "checkbox",
		build: () => atoms.Checkbox({ label: "Agree" }),
	},
	{ name: "input", slot: "input", build: () => atoms.Input({ name: "email" }) },
	{ name: "kbd", slot: "kbd", build: () => atoms.Kbd({ children: "⌘K" }) },
	{
		name: "label",
		slot: "label",
		build: () => atoms.Label({ for: "email", children: "Email" }),
	},
	{
		name: "marker",
		slot: "marker",
		build: () => atoms.Marker({ label: "Yesterday" }),
	},
	{
		name: "native-select",
		slot: "native-select",
		build: () => atoms.NativeSelect({ options: OPTIONS, placeholder: "Pick" }),
	},
	{
		name: "progress",
		slot: "progress",
		build: () => atoms.Progress({ value: 40 }),
	},
	{
		name: "scroll-area",
		slot: "scroll-area",
		build: () => atoms.ScrollArea({ children: "x" }),
	},
	{ name: "separator", slot: "separator", build: () => atoms.Separator({}) },
	{
		name: "skeleton",
		slot: "skeleton",
		build: () => atoms.Skeleton({ class: "h-4" }),
	},
	{
		name: "slider",
		slot: "slider",
		build: () => atoms.Slider({ value: 50, label: "Volume" }),
	},
	{ name: "spinner", slot: "spinner", build: () => atoms.Spinner({}) },
	{
		name: "switch",
		slot: "switch",
		build: () => atoms.Switch({ label: "Dark mode" }),
	},
	{
		name: "textarea",
		slot: "textarea",
		build: () => atoms.Textarea({ name: "bio" }),
	},
	{
		name: "toggle",
		slot: "toggle",
		build: () => atoms.Toggle({ children: "B", label: "Bold" }),
	},

	// ─── molecules ─────────────────────────────────────────────────────
	{
		name: "accordion",
		slot: "accordion",
		build: () =>
			molecules.Accordion({
				items: [{ value: "a", trigger: "Q", content: "A" }],
			}),
	},
	{
		name: "alert",
		slot: "alert",
		build: () => molecules.Alert({ children: "Heads up" }),
	},
	{
		name: "attachment",
		slot: "attachment",
		build: () => molecules.Attachment({ name: "report.pdf", size: 2048 }),
	},
	{
		name: "breadcrumb",
		slot: "breadcrumb",
		build: () =>
			molecules.Breadcrumb({
				items: [{ label: "Home", href: "/" }, { label: "Now" }],
			}),
	},
	{
		name: "bubble",
		slot: "bubble",
		build: () => molecules.Bubble({ children: "Hello" }),
	},
	{
		name: "button-group",
		slot: "button-group",
		build: () =>
			molecules.ButtonGroup({
				label: "Actions",
				children: atoms.Button({ children: "A" }),
			}),
	},
	{
		name: "card",
		slot: "card",
		build: () => molecules.Card({ children: "Body" }),
	},
	{
		name: "collapsible",
		slot: "collapsible",
		build: () => molecules.Collapsible({ trigger: "More", children: "Detail" }),
	},
	{
		name: "empty",
		slot: "empty",
		build: () => molecules.Empty({ children: "Nothing here" }),
	},
	{
		name: "field",
		slot: "field",
		build: () => {
			const ids = fieldIds();
			return molecules.Field({
				ids,
				label: "Email",
				children: atoms.Input({ id: ids.control }),
			});
		},
	},
	{
		name: "input-group",
		slot: "input-group",
		build: () =>
			molecules.InputGroup({ leading: "@", children: atoms.Input({}) }),
	},
	{
		name: "input-otp",
		slot: "input-otp",
		build: () => molecules.InputOTP({ length: 6 }),
	},
	{
		name: "item",
		slot: "item",
		build: () => molecules.Item({ children: "Row" }),
	},
	{
		name: "message",
		slot: "message",
		build: () => molecules.Message({ children: "Hi", author: "Ada" }),
	},
	{
		name: "pagination",
		slot: "pagination",
		build: () => molecules.Pagination({ page: 3, pageCount: 20 }),
	},
	{
		name: "radio-group",
		slot: "radio-group",
		build: () => molecules.RadioGroup({ name: "plan", options: OPTIONS }),
	},
	{
		name: "resizable",
		slot: "resizable-group",
		build: () =>
			molecules.Resizable({ first: "L", second: "R", withHandle: true }),
	},
	{
		name: "table",
		slot: "table-container",
		build: () => molecules.Table({ children: "" }),
	},
	{
		name: "tabs",
		slot: "tabs",
		build: () =>
			molecules.Tabs({ items: [{ value: "a", label: "A", content: "Panel" }] }),
	},
	{
		name: "toggle-group",
		slot: "toggle-group",
		build: () => molecules.ToggleGroup({ items: [{ value: "a", label: "A" }] }),
	},
	{
		name: "typography",
		slot: "lead",
		build: () => molecules.Lead({ children: "Intro" }),
	},

	// ─── organisms ─────────────────────────────────────────────────────
	{
		name: "alert-dialog",
		slot: "alert-dialog",
		build: () =>
			organisms.AlertDialog({
				title: "Sure?",
				description: "This deletes it.",
			}),
	},
	{ name: "calendar", slot: "calendar", build: () => organisms.Calendar({}) },
	{
		name: "carousel",
		slot: "carousel",
		build: () => organisms.Carousel({ slides: ["one", "two"] }),
	},
	{
		name: "chart",
		slot: "chart",
		build: () =>
			organisms.Chart({
				label: "Revenue",
				categoryKey: "month",
				data: [{ month: "Jan", value: 10 }],
				series: [{ key: "value", label: "Value" }],
			}),
	},
	{
		name: "combobox",
		slot: "combobox",
		build: () => organisms.Combobox({ options: OPTIONS }),
	},
	{
		name: "command",
		slot: "command",
		build: () => organisms.Command({ items: [{ value: "a", label: "Open" }] }),
	},
	{
		name: "command-dialog",
		slot: "command-dialog-root",
		build: () =>
			organisms.CommandDialog({ items: [{ value: "a", label: "Open" }] }),
	},
	{
		name: "context-menu",
		slot: "context-menu",
		build: () =>
			organisms.ContextMenu({
				entries: [{ label: "Cut" }],
				children: "Region",
			}),
	},
	{
		name: "data-table",
		slot: "data-table",
		build: () =>
			organisms.DataTable({
				columns: [{ key: "name", header: "Name" }],
				rows: [{ name: "Ada" }],
				rowKey: (row: { name: string }) => row.name,
			}),
	},
	{
		name: "date-picker",
		slot: "date-picker",
		build: () => organisms.DatePicker({}),
	},
	{
		name: "date-range-picker",
		slot: "date-range-picker",
		build: () => organisms.DateRangePicker({}),
	},
	{
		name: "dialog",
		slot: "dialog",
		build: () => organisms.Dialog({ title: "Edit" }),
	},
	{
		name: "drawer",
		slot: "drawer",
		build: () => organisms.Drawer({ title: "Filters" }),
	},
	{
		name: "dropdown-menu",
		slot: "dropdown-menu-trigger",
		build: () =>
			organisms.DropdownMenu({ trigger: "Menu", entries: [{ label: "Cut" }] }),
	},
	{
		name: "form",
		slot: "form",
		// happy-dom 15.11.7 throws from `HTMLFormElement.remove()` — "the node to
		// be removed is not a child of this node" — while `parentElement` is
		// correct and `parent.removeChild(form)` on the same node succeeds. A
		// `<div>` in the same position removes cleanly, so it is specific to
		// form elements in this DOM implementation, not to nebula or Aurora.
		skipUnmount: true,
		build: () =>
			organisms.Form({
				form: form({ initial: { email: "" }, submit: async () => undefined }),
				children: "fields",
			}),
	},
	{
		name: "hover-card",
		slot: "hover-card-trigger",
		build: () =>
			organisms.HoverCard({ trigger: "@ada", children: "Ada Lovelace" }),
	},
	{
		name: "menubar",
		slot: "menubar",
		build: () =>
			organisms.Menubar({
				menus: [{ label: "File", entries: [{ label: "New" }] }],
			}),
	},
	{
		name: "message-scroller",
		slot: "message-scroller",
		build: () => organisms.MessageScroller({ children: "log" }),
	},
	{
		name: "navigation-menu",
		slot: "navigation-menu",
		build: () =>
			organisms.NavigationMenu({ items: [{ label: "Docs", href: "/docs" }] }),
	},
	{
		name: "popover",
		slot: "popover-trigger",
		build: () => organisms.Popover({ trigger: "Open", children: "Panel" }),
	},
	{
		name: "questionnaire",
		slot: "questionnaire",
		build: () =>
			organisms.Questionnaire({
				questions: [{ id: "q1", type: "text", prompt: "Name?" }],
				onComplete: () => {},
			}),
	},
	{
		name: "select",
		slot: "select",
		build: () => organisms.Select({ options: OPTIONS }),
	},
	{
		name: "sheet",
		slot: "sheet",
		build: () => organisms.Sheet({ title: "Filters" }),
	},
	{
		name: "sidebar",
		slot: "sidebar-root",
		build: () =>
			organisms.Sidebar({ children: organisms.SidebarMenu({ children: "" }) }),
	},
	{ name: "toaster", slot: "toaster", build: () => organisms.Toaster({}) },
	{
		name: "tooltip",
		slot: "tooltip-trigger",
		build: () => organisms.Tooltip({ trigger: "?", content: "Help" }),
	},

	// ─── templates ─────────────────────────────────────────────────────
	{
		name: "app-shell",
		slot: "app-shell",
		build: () => templates.AppShell({ children: "Page" }),
	},
	{
		name: "auth-layout",
		slot: "auth-layout",
		build: () => templates.AuthLayout({ title: "Sign in", children: "form" }),
	},
	{
		name: "settings-layout",
		slot: "settings-layout",
		build: () =>
			templates.SettingsLayout({
				title: "Settings",
				sections: [{ label: "Profile", href: "/p", active: true }],
				children: "panel",
			}),
	},
];

afterEach(() => {
	document.body.innerHTML = "";
	document.body.style.cssText = "";
});

describe("every component mounts", () => {
	for (const testCase of cases) {
		it(testCase.name, () => {
			const view = mount(testCase.build());
			expect(
				view.host.querySelector(`[data-slot="${testCase.slot}"]`),
				`no [data-slot="${testCase.slot}"] in the rendered output`,
			).not.toBeNull();
			if (testCase.skipUnmount === true) {
				view.host.remove();
				return;
			}
			view.dispose();
			expect(view.host.innerHTML).toBe("");
		});
	}

	it("leaves no portal behind after any of them unmounts", () => {
		for (const testCase of cases) {
			if (testCase.skipUnmount === true) continue;
			const view = mount(testCase.build());
			view.dispose();
		}
		expect(portals(), "a component orphaned a portal in the body").toHaveLength(
			0,
		);
	});

	it("covers every component the registry ships", async () => {
		// The registry is derived from the source tree, so this is what stops a
		// new component being added without a mount test.
		const registry: unknown = (
			await import("../../registry.json", { with: { type: "json" } })
		).default;
		const items = extractNames(registry);
		const tested = new Set(cases.map((entry) => entry.name));
		const untested = items.filter((name) => !tested.has(name));
		expect(untested, "components with no mount test").toEqual([]);
	});
});

function extractNames(registry: unknown): string[] {
	if (typeof registry !== "object" || registry === null) return [];
	const items = Reflect.get(registry, "items");
	if (!Array.isArray(items)) return [];
	const names: string[] = [];
	for (const item of items) {
		if (typeof item !== "object" || item === null) continue;
		const name = Reflect.get(item, "name");
		if (typeof name === "string") names.push(name);
	}
	return names;
}
