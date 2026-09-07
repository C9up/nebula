/**
 * One Dialog driven between two contents.
 *
 * Reported from Qwalto: a single Dialog switched by a signal between "create"
 * and "edit" updated its title and its description — both reactive accessors —
 * and kept the first form. This is that shape, through the trigger the
 * component is normally driven by.
 */
import { signal } from "@c9up/aurora";
import { afterEach, describe, expect, it } from "vitest";
import { Dialog } from "../../src/organisms/Dialog.js";
import { mount, portals } from "./helpers.js";

afterEach(() => {
	document.body.innerHTML = "";
});

const text = (selector: string) =>
	document.querySelector(selector)?.textContent?.trim();

describe("nebula > a Dialog reused for two contents", () => {
	it("swaps its children when the mode switches", () => {
		const mode = signal<"create" | "edit">("create");

		mount(
			Dialog({
				trigger: "Open",
				title: () => (mode() === "create" ? "New" : "Edit"),
				children: () => `form-${mode()}`,
			}),
		);
		document
			.querySelector<HTMLElement>("[data-slot='dialog-trigger']")
			?.click();

		expect(text("[data-slot='dialog-title']")).toBe("New");
		expect(portals()[0]?.textContent).toContain("form-create");

		mode("edit");

		// The title tracked the signal and the children did not: the right
		// heading over the wrong form.
		expect(text("[data-slot='dialog-title']")).toBe("Edit");
		expect(portals()[0]?.textContent).toContain("form-edit");
	});

	it("keeps a STATIC children, exactly as it keeps a static title", () => {
		// The reported asymmetry — title follows, children do not — is what a
		// caller sees when `title` is passed as an accessor and `children` as a
		// value. A `Slot` may be either, and a value is captured once by
		// definition. Neither is reactive here, and that is the contract, not a
		// defect: the fix at the call site is a function.
		const mode = signal<"create" | "edit">("create");

		mount(
			Dialog({
				trigger: "Open",
				title: `title-${mode()}`,
				children: `form-${mode()}`,
			}),
		);
		document
			.querySelector<HTMLElement>("[data-slot='dialog-trigger']")
			?.click();
		expect(text("[data-slot='dialog-title']")).toBe("title-create");

		mode("edit");

		expect(text("[data-slot='dialog-title']")).toBe("title-create");
		expect(portals()[0]?.textContent).toContain("form-create");
	});
});
