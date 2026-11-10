// @vitest-environment node
/**
 * The sidebar's cookie, on the server.
 *
 * One process renders every user's pages, each with its own cookies. The
 * open state read from the cookie belongs to the request being rendered: a
 * state kept for the process would hand the first visitor's sidebar to
 * everyone after them, and the browser, reading its own cookie, would then
 * disagree with the markup it adopts.
 */

import { html, renderToString, resetIds, setCookieStore } from "@c9up/aurora";
import { afterEach, describe, expect, it } from "vitest";
import {
	Sidebar,
	SidebarContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
} from "../../src/organisms/Sidebar.js";

afterEach(() => {
	setCookieStore({});
});

function page(defaultOpen?: boolean) {
	return html`${SidebarProvider({
		defaultOpen,
		children: () =>
			html`${Sidebar({
				children: () =>
					SidebarContent({
						children: () =>
							SidebarMenu({
								children: () =>
									SidebarMenuItem({
										children: () =>
											SidebarMenuButton({
												href: "/",
												tooltip: "Home",
												children: "Home",
											}),
									}),
							}),
					}),
			})}`,
	})}`;
}

function render(cookies: Record<string, string>, defaultOpen?: boolean) {
	setCookieStore(cookies);
	resetIds();
	return renderToString(page(defaultOpen));
}

function stateOf(markup: string): string | undefined {
	return /data-slot="sidebar"[^>]*data-state="(expanded|collapsed)"/
		.exec(markup)
		?.at(1);
}

describe("Sidebar > on the server", () => {
	it("reads each request's own cookie", () => {
		const a = render({ "nebula:sidebar": "0" });
		const b = render({ "nebula:sidebar": "1" });
		const c = render({});
		expect([stateOf(a), stateOf(b), stateOf(c)]).toEqual([
			"collapsed",
			"expanded",
			"expanded",
		]);
	});

	it("falls back to each request's own defaultOpen", () => {
		const closed = render({}, false);
		const open = render({}, true);
		expect(stateOf(closed)).toBe("collapsed");
		expect(stateOf(open)).toBe("expanded");
	});

	it("gives the menu buttons the provider's state, not a default of their own", () => {
		// Collapsed by `defaultOpen` alone: the buttons show their tooltip only
		// when the provider is collapsed, so they must read the provider.
		const markup = render({}, false);
		expect(stateOf(markup)).toBe("collapsed");
		expect(markup).toContain('data-slot="tooltip-trigger"');
		const expanded = render({}, true);
		expect(expanded).not.toContain('data-slot="tooltip-trigger"');
	});
});
