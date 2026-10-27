/**
 * The usage `Dialog.ts` documents, run as written.
 *
 * The example once handed `DialogHeader` a thunk. `DialogHeader` takes a
 * `Slot`, which the renderer calls after setup, so the `DialogTitle` inside it
 * was built after the dialog had looked for one: the setup-time check warned
 * about a title that was right there, and the panel had no name.
 */

import { html } from "@c9up/aurora";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "../../src/atoms/Button.js";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../../src/organisms/Dialog.js";
import { mount, portals } from "./helpers.js";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("nebula > Dialog, as documented", () => {
	it("names and describes its panel, with no warning", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const view = mount(
			Dialog({
				children: () => html`
					${DialogTrigger({ children: "Edit" })}
					${DialogContent({
						children: () => html`
							${DialogHeader({
								children: html`
									${DialogTitle({ children: "Edit profile" })}
									${DialogDescription({ children: "Change it." })}
								`,
							})}
							${DialogFooter({ children: Button({ children: "Save" }) })}
						`,
					})}
				`,
			}),
		);
		expect(warn).not.toHaveBeenCalled();

		view.host
			.querySelector<HTMLElement>("[data-slot='dialog-trigger']")
			?.click();
		const panel = document.querySelector("[data-slot='dialog-content']");
		const named = document.getElementById(
			panel?.getAttribute("aria-labelledby") ?? "",
		);
		const described = document.getElementById(
			panel?.getAttribute("aria-describedby") ?? "",
		);
		expect(named?.textContent).toBe("Edit profile");
		expect(described?.textContent).toBe("Change it.");
		expect(warn).not.toHaveBeenCalled();

		view.dispose();
		expect(portals()).toHaveLength(0);
	});
});
