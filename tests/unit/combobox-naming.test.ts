/**
 * A Combobox can be named.
 *
 * Its trigger minted its own id and took no `aria-label` or
 * `aria-labelledby`, so a `<Label for>` or a `FieldLabel` beside it pointed at
 * nothing and the combobox's only name was the value it showed. Upstream's
 * trigger is a Button that takes every button prop; `id`, `label`,
 * `labelledBy` and `describedBy` are the ones that name it.
 */

import { html } from "@c9up/aurora";
import { afterEach, describe, expect, it } from "vitest";
import { Label } from "../../src/atoms/Label.js";
import {
	Field,
	FieldDescription,
	FieldLabel,
	fieldIds,
} from "../../src/molecules/Field.js";
import { Combobox, type ComboboxProps } from "../../src/organisms/Combobox.js";
import { type Mounted, mount, portalContent } from "./helpers.js";

let view: Mounted | undefined;

afterEach(() => {
	view?.dispose();
	view = undefined;
});

function countryCombobox(naming: Omit<ComboboxProps, "options">) {
	return Combobox({
		...naming,
		defaultValue: "all",
		options: [
			{ value: "all", label: "Worldwide" },
			{ value: "ch", label: "Switzerland" },
		],
	});
}

function trigger(): HTMLElement | null {
	return document.querySelector<HTMLElement>("[data-slot=combobox-trigger]");
}

describe("nebula > naming a Combobox", () => {
	it("takes the id a Label points at", () => {
		view = mount(
			html`${Label({ for: "country", children: "Country" })}${countryCombobox({
				id: "country",
			})}`,
		);
		expect(trigger()?.id).toBe("country");
		expect(document.querySelector("label")?.getAttribute("for")).toBe(
			"country",
		);
	});

	it("takes the field's id and description", () => {
		const ids = fieldIds();
		view = mount(
			Field({
				ids,
				children: () =>
					html`${FieldLabel({ children: "Country" })}${countryCombobox({
						id: ids.control,
						describedBy: ids.describedBy,
					})}${FieldDescription({ children: "Where to look for keywords." })}`,
			}),
		);
		const label = document.querySelector("[data-slot=field-label]");
		expect(trigger()?.id).toBe(ids.control);
		expect(label?.getAttribute("for")).toBe(ids.control);
		expect(trigger()?.getAttribute("aria-describedby")).toBe(ids.describedBy);
	});

	it("returns the focus to the id it was given after a choice", () => {
		view = mount(countryCombobox({ id: "country" }));
		trigger()?.click();
		const options =
			portalContent()?.querySelectorAll<HTMLElement>("[role=option]");
		[...(options ?? [])]
			.find((option) => option.textContent?.includes("Switzerland"))
			?.click();
		expect(document.activeElement?.id).toBe("country");
		expect(trigger()?.textContent).toContain("Switzerland");
	});

	it("takes an accessible name when no label is beside it", () => {
		view = mount(countryCombobox({ label: "Country" }));
		expect(trigger()?.getAttribute("aria-label")).toBe("Country");
		// Left out, the trigger still gets a unique id of its own.
		expect(trigger()?.id).toMatch(/^combobox-trigger/);
	});

	it("points aria-labelledby at a heading that names it", () => {
		view = mount(
			html`<h3 id="seo-country">Ahrefs country</h3>${countryCombobox({
				labelledBy: "seo-country",
			})}`,
		);
		expect(trigger()?.getAttribute("aria-labelledby")).toBe("seo-country");
	});

	it("leaves the naming attributes off when none is given", () => {
		view = mount(countryCombobox({}));
		expect(trigger()?.hasAttribute("aria-label")).toBe(false);
		expect(trigger()?.hasAttribute("aria-labelledby")).toBe(false);
		expect(trigger()?.hasAttribute("aria-describedby")).toBe(false);
	});
});
