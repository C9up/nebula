/**
 * The trigger, the rail and the menu buttons follow the provider they sit in.
 *
 * As upstream's `useSidebar()`: a controlled provider hears about a toggle
 * through `onOpenChange`, and its menu buttons know it is collapsed even when
 * the page-wide cookie state says otherwise.
 */

import { html, signal } from "@c9up/aurora";
import { describe, expect, it, vi } from "vitest";
import {
	Sidebar,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarRail,
	SidebarTrigger,
	sidebarState,
} from "../../src/organisms/Sidebar.js";
import { mount } from "./helpers.js";

describe("Sidebar > parts inside a provider", () => {
	it("toggles a controlled provider through onOpenChange, from the trigger and the rail", () => {
		const open = signal(true);
		const onOpenChange = vi.fn((next: boolean) => open(next));
		const view = mount(
			SidebarProvider({
				open,
				onOpenChange,
				children: () =>
					html`${SidebarTrigger({})}${Sidebar({
						children: () => SidebarRail({}),
					})}`,
			}),
		);
		view.host
			.querySelector<HTMLButtonElement>("button[aria-label='Toggle sidebar']")
			?.click();
		expect(onOpenChange).toHaveBeenLastCalledWith(false);
		view.host
			.querySelector<HTMLButtonElement>("[data-slot='sidebar-rail']")
			?.click();
		expect(onOpenChange).toHaveBeenLastCalledWith(true);
		view.dispose();
	});

	it("wraps a menu button in its tooltip when the controlled provider is collapsed", () => {
		// The page-wide state says open; the provider says closed.
		sidebarState()(true);
		const view = mount(
			SidebarProvider({
				open: false,
				children: () =>
					html`${Sidebar({
						children: () =>
							SidebarMenu({
								children: () =>
									SidebarMenuItem({
										children: () =>
											SidebarMenuButton({ tooltip: "Home", children: "Home" }),
									}),
							}),
					})}`,
			}),
		);
		expect(
			view.host.querySelector("[data-slot='tooltip-trigger']"),
		).not.toBeNull();
		view.dispose();
	});
});
