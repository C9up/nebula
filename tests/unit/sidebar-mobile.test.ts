/**
 * On a phone the sidebar is a drawer, and the drawer has a state of its own.
 *
 * The provider kept one open state for both: the column's, persisted in the
 * cookie and open by default, so below the breakpoint the drawer opened over
 * the page on every load. As upstream: `openMobile` starts closed and is never
 * persisted, the trigger toggles it on a phone, and the column's state is left
 * as it was.
 */

import { html } from "@c9up/aurora";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	Sidebar,
	SidebarProvider,
	SidebarTrigger,
	sidebarState,
	useSidebar,
} from "../../src/organisms/Sidebar.js";
import { mount } from "./helpers.js";

/** A window narrower than the breakpoint, or wider. */
function screen(phone: boolean): void {
	vi.stubGlobal("matchMedia", (query: string) => ({
		matches: phone,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {},
	}));
}

const drawer = (): Element | null =>
	document.querySelector("[data-slot='sheet-portal']");

const trigger = (host: HTMLElement): HTMLButtonElement | null =>
	host.querySelector<HTMLButtonElement>("button[aria-label='Toggle sidebar']");

beforeEach(() => {
	sidebarState()(true);
});

afterEach(() => {
	vi.unstubAllGlobals();
	document.body.innerHTML = "";
});

describe("Sidebar > on a phone", () => {
	it("starts with the drawer closed, though the column's state is open", () => {
		screen(true);
		const view = mount(
			SidebarProvider({
				children: () => html`${SidebarTrigger({})}${Sidebar({})}`,
			}),
		);
		expect(drawer()).toBeNull();
		view.dispose();
	});

	it("opens and closes the drawer from the trigger, and leaves the column's state alone", () => {
		screen(true);
		const onOpenChange = vi.fn();
		let api: ReturnType<typeof useSidebar> | undefined;
		const view = mount(
			SidebarProvider({
				onOpenChange,
				children: () => {
					api = useSidebar();
					return html`${SidebarTrigger({})}${Sidebar({})}`;
				},
			}),
		);
		trigger(view.host)?.click();
		expect(drawer()).not.toBeNull();
		expect(api?.openMobile()).toBe(true);
		api?.setOpenMobile(false);
		expect(api?.openMobile()).toBe(false);
		trigger(view.host)?.click();
		expect(api?.openMobile()).toBe(true);
		expect(sidebarState()()).toBe(true);
		expect(onOpenChange).not.toHaveBeenCalled();
		view.dispose();
	});

	it("still toggles the column on a wide screen", () => {
		screen(false);
		const view = mount(
			SidebarProvider({
				children: () => html`${SidebarTrigger({})}${Sidebar({})}`,
			}),
		);
		trigger(view.host)?.click();
		expect(sidebarState()()).toBe(false);
		expect(drawer()).toBeNull();
		view.dispose();
	});
});
