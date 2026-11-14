/**
 * A width given to a NativeSelect sizes the whole control.
 *
 * The chevron is positioned against the wrapper (`absolute end-3`), and the
 * wrapper was `w-full` unconditionally. Narrowing the `<select>` through
 * `class`, the obvious way to size a filter, left the arrow at the far end of
 * a full-width box with empty space between the control and its own
 * indicator. `wrapperClass` sizes the wrapper, so the chevron travels with the
 * control; `class` still styles the `<select>` inside it.
 */

import { render, signal, type TemplateResult } from "@c9up/aurora";
import { describe, expect, it } from "vitest";
import { NativeSelect } from "../../src/atoms/NativeSelect.js";

const OPTIONS = [
	{ value: "all", label: "All" },
	{ value: "open", label: "Open" },
];

function mount(build: () => TemplateResult) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	render(build(), host);
	const wrapper = host.querySelector<HTMLElement>(
		"[data-slot='native-select']",
	);
	if (wrapper === null) throw new Error("no wrapper rendered");
	return { host, wrapper };
}

describe("nebula > NativeSelect sized as one control", () => {
	it("is full width when nothing sizes it", () => {
		const { host, wrapper } = mount(() => NativeSelect({ options: OPTIONS }));

		expect(wrapper.classList.contains("w-full")).toBe(true);
		host.remove();
	});

	it("takes the width from wrapperClass, replacing the full width", () => {
		const { host, wrapper } = mount(() =>
			NativeSelect({ options: OPTIONS, wrapperClass: "w-40" }),
		);

		expect(wrapper.classList.contains("w-40")).toBe(true);
		// Merged, not appended: two widths on one element is whichever the
		// stylesheet happens to define last.
		expect(wrapper.classList.contains("w-full")).toBe(false);
		// And the chevron is still inside it, against its end.
		expect(wrapper.querySelector("svg")?.getAttribute("class")).toContain(
			"end-3",
		);
		host.remove();
	});

	it("follows a reactive wrapperClass", () => {
		const width = signal("w-40");
		const { host, wrapper } = mount(() =>
			NativeSelect({ options: OPTIONS, wrapperClass: width }),
		);

		width("w-64");

		expect(wrapper.classList.contains("w-64")).toBe(true);
		expect(wrapper.classList.contains("w-40")).toBe(false);
		host.remove();
	});
});
