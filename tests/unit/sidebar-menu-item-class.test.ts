/**
 * Every other component in this library merges `props.class`. This one did not.
 *
 * In a shadcn port a caller overrides any component through `className`, so a
 * component that refuses one is a gap, not a decision — something as ordinary
 * as dimming a disabled entry had to be worked around.
 */

import { render, signal } from "@c9up/aurora";
import { describe, expect, it } from "vitest";
import { SidebarMenuItem } from "../../src/organisms/Sidebar.js";

function mount(build: () => unknown) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	render(build() as never, host);
	return host;
}

describe("nebula > SidebarMenuItem accepts a class", () => {
	it("merges the caller's classes onto the defaults", () => {
		const host = mount(() =>
			SidebarMenuItem({ label: "Pockets", class: "opacity-50" }),
		);
		const entry = host.querySelector("[data-slot=sidebar-menu-item]");

		expect(entry?.className).toContain("opacity-50");
		// And keeps its own.
		expect(entry?.className).toContain("rounded-md");
		host.remove();
	});

	it("merges onto the link form too", () => {
		const host = mount(() =>
			SidebarMenuItem({
				label: "Pockets",
				href: "/p",
				class: "pointer-events-none",
			}),
		);
		const entry = host.querySelector("a[data-slot=sidebar-menu-item]");

		expect(entry?.className).toContain("pointer-events-none");
		host.remove();
	});

	it("follows a reactive class", () => {
		const dim = signal("");
		const host = mount(() => SidebarMenuItem({ label: "Pockets", class: dim }));
		const entry = host.querySelector("[data-slot=sidebar-menu-item]");
		expect(entry?.className).not.toContain("opacity-50");

		dim("opacity-50");

		expect(entry?.className).toContain("opacity-50");
		host.remove();
	});

	it("lets an override win over the default it collides with", () => {
		// `cn` is tailwind-merge: a caller passing `h-12` must not end up with
		// both `h-8` and `h-12` and a specificity coin-toss.
		const host = mount(() =>
			SidebarMenuItem({ label: "Pockets", class: "h-12" }),
		);
		const entry = host.querySelector("[data-slot=sidebar-menu-item]");

		expect(entry?.className).toContain("h-12");
		expect(entry?.className).not.toContain("h-8");
		host.remove();
	});
});
