/**
 * `data-collapsible` names the collapse mode only while the bar is collapsed.
 *
 * Every `group-data-[collapsible=icon]:` class keys off it — the header's name
 * hides, group labels fade, menu buttons shrink to `size-8`. Written whatever
 * the state, it put a full-width bar in icon mode: a 256px column showing 32px
 * buttons with their labels cut to nothing. Upstream writes
 * `state === "collapsed" ? collapsible : ""`.
 */

import { html, signal } from "@c9up/aurora";
import { describe, expect, it } from "vitest";
import { Sidebar, SidebarProvider } from "../../src/organisms/Sidebar.js";
import { mount } from "./helpers.js";

function nav(host: HTMLElement): Element | null {
	return host.querySelector("nav[data-slot=sidebar]");
}

describe("nebula > Sidebar data-collapsible", () => {
	it("is empty while expanded and names the mode once collapsed", () => {
		const open = signal(true);
		const view = mount(
			SidebarProvider({
				open,
				onOpenChange: open,
				children: () => html`${Sidebar({ collapsible: "icon" })}`,
			}),
		);
		expect(nav(view.host)?.getAttribute("data-state")).toBe("expanded");
		expect(nav(view.host)?.getAttribute("data-collapsible")).toBe("");

		open(false);
		expect(nav(view.host)?.getAttribute("data-state")).toBe("collapsed");
		expect(nav(view.host)?.getAttribute("data-collapsible")).toBe("icon");

		open(true);
		expect(nav(view.host)?.getAttribute("data-collapsible")).toBe("");
		view.dispose();
	});

	it("names the offcanvas mode the same way", () => {
		const view = mount(
			SidebarProvider({
				// Controlled: the uncontrolled state is a page-wide singleton, which
				// the test before this one has already created.
				open: false,
				children: () => html`${Sidebar({ collapsible: "offcanvas" })}`,
			}),
		);
		expect(nav(view.host)?.getAttribute("data-collapsible")).toBe("offcanvas");
		view.dispose();
	});
});
