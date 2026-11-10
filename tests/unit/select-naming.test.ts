/**
 * A Select can be named.
 *
 * Its trigger minted its own id and took no `aria-label`, so a `FieldLabel`
 * beside it pointed at nothing and the combobox's only name was the value it
 * showed — "Reader", with no hint of what is being chosen. Upstream's trigger
 * takes every button prop; `id`, `label` and `describedBy` are the ones that
 * name it, spelled as `Input` spells them.
 */

import { html } from "@c9up/aurora";
import { afterEach, describe, expect, it } from "vitest";
import {
	Field,
	FieldDescription,
	FieldLabel,
	fieldIds,
} from "../../src/molecules/Field.js";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	type SelectTriggerProps,
	SelectValue,
} from "../../src/organisms/Select.js";
import { type Mounted, mount, portalContent } from "./helpers.js";

let view: Mounted | undefined;

afterEach(() => {
	view?.dispose();
	view = undefined;
});

function roleSelect(trigger: Omit<SelectTriggerProps, "children">) {
	return Select({
		defaultValue: "reader",
		children: () =>
			html`${SelectTrigger({ ...trigger, children: SelectValue({}) })}${SelectContent(
				{
					children: () =>
						html`${SelectItem({ value: "reader", children: "Reader" })}${SelectItem(
							{ value: "owner", children: "Owner" },
						)}`,
				},
			)}`,
	});
}

function trigger(): HTMLElement | null {
	return document.querySelector<HTMLElement>("[data-slot=select-trigger]");
}

describe("nebula > naming a Select", () => {
	it("takes the field's id, so its label names the combobox", () => {
		const ids = fieldIds();
		view = mount(
			Field({
				ids,
				children: () =>
					html`${FieldLabel({ children: "Role" })}${roleSelect({
						id: ids.control,
						describedBy: ids.describedBy,
					})}${FieldDescription({ children: "What the member may do." })}`,
			}),
		);
		const label = document.querySelector("[data-slot=field-label]");
		expect(trigger()?.id).toBe(ids.control);
		expect(label?.getAttribute("for")).toBe(ids.control);
		expect(trigger()?.getAttribute("aria-describedby")).toBe(ids.describedBy);
	});

	it("keeps the list and the focus return on the id it was given", () => {
		view = mount(roleSelect({ id: "member-role" }));
		trigger()?.click();
		const list = document.querySelector("[role=listbox]");
		expect(list?.getAttribute("aria-labelledby")).toBe("member-role");

		portalContent()
			?.querySelector<HTMLElement>("[role=option]:last-of-type")
			?.click();
		expect(document.activeElement?.id).toBe("member-role");
	});

	it("takes an accessible name when no label is beside it", () => {
		view = mount(roleSelect({ label: "Role" }));
		expect(trigger()?.getAttribute("aria-label")).toBe("Role");
		// Left out, the trigger still gets a unique id of its own.
		expect(trigger()?.id).toMatch(/^select-trigger/);
	});

	it("points aria-labelledby at a heading that names it", () => {
		view = mount(
			html`<h3 id="member-heading">Member role</h3>${roleSelect({
				labelledBy: "member-heading",
			})}`,
		);
		expect(trigger()?.getAttribute("aria-labelledby")).toBe("member-heading");
	});

	it("leaves the naming attributes off when none is given", () => {
		view = mount(roleSelect({}));
		expect(trigger()?.hasAttribute("aria-label")).toBe(false);
		expect(trigger()?.hasAttribute("aria-labelledby")).toBe(false);
		expect(trigger()?.hasAttribute("aria-describedby")).toBe(false);
	});
});
