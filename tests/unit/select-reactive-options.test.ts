/**
 * A Select's options can follow a signal.
 *
 * They registered once, while the Select was set up, so an option list that
 * changed — a role created in the next tab — never reached the picker until
 * the whole Select was rebuilt. Built in an accessor, the options now reach
 * the Select (Aurora calls the accessor with the providers it was written
 * under), and the Select reads which options exist, and in what order, from
 * the list it has mounted — open, or closed and kept outside the document, as
 * Radix keeps a closed select's content in a DocumentFragment.
 */

import { html, renderToString, signal } from "@c9up/aurora";
import { afterEach, describe, expect, it } from "vitest";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../../src/organisms/Select.js";
import { type Mounted, mount, press } from "./helpers.js";

interface Role {
	id: string;
	name: string;
}

let view: Mounted | undefined;

afterEach(() => {
	view?.dispose();
	view = undefined;
});

function roleSelect(roles: () => readonly Role[], defaultValue?: string) {
	return Select({
		defaultValue,
		children: () =>
			html`${SelectTrigger({ children: SelectValue({ placeholder: "Pick" }) })}${SelectContent(
				{
					children: () =>
						html`${SelectItem({ value: "owner", children: "Owner" })}${() =>
							roles().map((role) =>
								SelectItem({ value: role.id, children: role.name }),
							)}`,
				},
			)}`,
	});
}

function trigger(): HTMLElement {
	const element = document.querySelector<HTMLElement>(
		"[data-slot=select-trigger]",
	);
	if (element === null) throw new Error("no trigger");
	return element;
}

function shownOptions(): string[] {
	return [...document.querySelectorAll("[role=listbox] [role=option]")].map(
		(option) => option.textContent?.trim() ?? "",
	);
}

function activeOption(): string | undefined {
	const id = trigger().getAttribute("aria-activedescendant");
	return id === null
		? undefined
		: document.getElementById(id)?.textContent?.trim();
}

describe("nebula > Select options that follow a signal", () => {
	it("shows an option added after setup, in the list's order", () => {
		const roles = signal<readonly Role[]>([{ id: "reader", name: "Reader" }]);
		view = mount(roleSelect(roles));

		roles([...roles(), { id: "editor", name: "Editor" }]);
		trigger().click();
		expect(shownOptions()).toEqual(["Owner", "Reader", "Editor"]);
	});

	it("drops an option the signal removed, from the list and from the keyboard", () => {
		const roles = signal<readonly Role[]>([
			{ id: "reader", name: "Reader" },
			{ id: "editor", name: "Editor" },
		]);
		view = mount(roleSelect(roles));
		trigger().click();
		trigger().click();
		roles([{ id: "editor", name: "Editor" }]);

		trigger().focus();
		trigger().dispatchEvent(press("ArrowDown"));
		trigger().dispatchEvent(press("ArrowDown"));
		expect(shownOptions()).toEqual(["Owner", "Editor"]);
		// One step past "Owner" is "Editor". Registered once and never dropped,
		// "Reader" was still next: the arrow landed on an id no element carried,
		// and the highlight vanished.
		expect(activeOption()).toBe("Editor");
	});

	it("shows the chosen option's label while closed, and follows a rename", () => {
		const roles = signal<readonly Role[]>([{ id: "reader", name: "Reader" }]);
		view = mount(roleSelect(roles, "reader"));
		const value = (): string | undefined =>
			document.querySelector("[data-slot=select-value]")?.textContent?.trim();
		expect(value()).toBe("Reader");

		roles([{ id: "reader", name: "Viewer" }]);
		expect(value()).toBe("Viewer");
	});

	it("stops showing the chosen option's label once the signal removes it", () => {
		const roles = signal<readonly Role[]>([{ id: "reader", name: "Reader" }]);
		view = mount(roleSelect(roles, "reader"));
		const value = (): string | undefined =>
			document.querySelector("[data-slot=select-value]")?.textContent?.trim();
		expect(value()).toBe("Reader");

		roles([]);
		// The value is kept — it is the app's to change — but no option names it.
		expect(value()).toBe("Pick");

		roles([{ id: "reader", name: "Reader" }]);
		expect(value()).toBe("Reader");

		// Opening and closing mounts the list again; the label holds throughout.
		trigger().click();
		expect(value()).toBe("Reader");
		trigger().click();
		expect(value()).toBe("Reader");
	});

	it("finds a new option by typing on the trigger", () => {
		const roles = signal<readonly Role[]>([]);
		view = mount(roleSelect(roles));
		roles([{ id: "editor", name: "Editor" }]);

		trigger().click();
		trigger().dispatchEvent(press("e"));
		expect(activeOption()).toBe("Editor");
	});

	it("chooses an option that arrived while the list was open", () => {
		const roles = signal<readonly Role[]>([]);
		view = mount(roleSelect(roles));
		trigger().click();
		roles([{ id: "editor", name: "Editor" }]);

		const option = [
			...document.querySelectorAll<HTMLElement>("[role=listbox] [role=option]"),
		].find((entry) => entry.textContent?.trim() === "Editor");
		option?.click();
		expect(
			document.querySelector<HTMLInputElement>("input[type=hidden]")?.value,
		).toBe("editor");
	});

	it("renders on the server, with the static options' label", () => {
		const markup = renderToString(roleSelect(() => [], "owner"));
		expect(markup).toContain("Owner");
	});
});
