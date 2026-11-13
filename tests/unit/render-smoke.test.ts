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

import { afterEach, describe, expect, it } from "vitest";
import { mount, portals } from "./helpers.js";
import { cases, registryNames } from "./registry-cases.js";

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
		const items = await registryNames();
		const tested = new Set(cases.map((entry) => entry.name));
		const untested = items.filter((name) => !tested.has(name));
		expect(untested, "components with no mount test").toEqual([]);
	});
});
