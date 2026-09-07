/**
 * A pre-filled `<select>` must show the value it was given.
 *
 * The property binding `.value` sits on the opening tag, so the renderer
 * assigned it BEFORE the options existed. `select.value = 'x'` against a
 * childless `<select>` is a no-op the DOM does not report, and nothing re-ran
 * it: the control displayed its first option while holding the value it was
 * handed. Nothing threw, nothing logged.
 *
 * That is a wrong record written on save, not a cosmetic bug: the value shown
 * is the value the user believes they are confirming.
 */

import { render, signal } from "@c9up/aurora";
import { describe, expect, it } from "vitest";
import { NativeSelect } from "../../src/atoms/NativeSelect.js";

const OPTIONS = [
	{ value: "fr.cto", label: "Compte-titres" },
	{ value: "fr.pea", label: "PEA" },
	{ value: "fr.av", label: "Assurance-vie" },
];

function mount(build: () => unknown) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	render(build() as never, host);
	const select = host.querySelector("select");
	if (select === null) throw new Error("no <select> rendered");
	return { host, select };
}

describe("nebula > NativeSelect keeps the value it is given", () => {
	it("shows the third option when the third is selected", () => {
		const { host, select } = mount(() =>
			NativeSelect({ options: OPTIONS, value: "fr.av" }),
		);

		expect(select.value).toBe("fr.av");
		host.remove();
	});

	it("marks the option itself, so server-rendered HTML is right too", () => {
		// Before any script runs, only `selected` on the option can carry the
		// choice — a property assignment does not exist in the markup.
		const { host, select } = mount(() =>
			NativeSelect({ options: OPTIONS, value: "fr.pea" }),
		);

		const marked = [...select.querySelectorAll("option")].filter((o) =>
			o.hasAttribute("selected"),
		);
		expect(marked.map((o) => o.getAttribute("value"))).toEqual(["fr.pea"]);
		host.remove();
	});

	it("follows a reactive value", () => {
		const envelope = signal("fr.cto");
		const { host, select } = mount(() =>
			NativeSelect({ options: OPTIONS, value: envelope }),
		);
		expect(select.value).toBe("fr.cto");

		envelope("fr.av");
		expect(select.value).toBe("fr.av");
		host.remove();
	});

	it("shows the placeholder while nothing is chosen", () => {
		const { host, select } = mount(() =>
			NativeSelect({ options: OPTIONS, placeholder: "Pick one" }),
		);

		expect(select.value).toBe("");
		host.remove();
	});

	it("does not show the placeholder once a value is set", () => {
		// The placeholder used to carry a hardcoded `selected`, which would win
		// over an option marked reactively.
		const { host, select } = mount(() =>
			NativeSelect({
				options: OPTIONS,
				placeholder: "Pick one",
				value: "fr.pea",
			}),
		);

		expect(select.value).toBe("fr.pea");
		host.remove();
	});
});
