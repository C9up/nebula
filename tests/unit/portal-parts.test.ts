/**
 * The five `*Portal` parts in the browser: they portal once mounted, on the
 * client-only path and on the SSR-then-hydrate path, and take their host and
 * its content away when they unmount. A menu portal that never closed left
 * one host per mount in `<body>`, with the content's effects still
 * subscribed, for the page lifetime.
 */

import { html, hydrate, renderToString, resetIds } from "@c9up/aurora";
import { afterEach, describe, expect, it } from "vitest";
import { AlertDialogPortal } from "../../src/organisms/AlertDialog.js";
import { ContextMenuPortal } from "../../src/organisms/ContextMenu.js";
import { DialogPortal } from "../../src/organisms/Dialog.js";
import { DropdownMenuPortal } from "../../src/organisms/DropdownMenu.js";
import { MenubarPortal } from "../../src/organisms/Menubar.js";
import { mount, portals } from "./helpers.js";

afterEach(() => {
	document.body.innerHTML = "";
});

const parts = [
	["DialogPortal", "dialog-portal", DialogPortal],
	["AlertDialogPortal", "alert-dialog-portal", AlertDialogPortal],
	["DropdownMenuPortal", "dropdown-menu-portal", DropdownMenuPortal],
	["ContextMenuPortal", "context-menu-portal", ContextMenuPortal],
	["MenubarPortal", "menubar-portal", MenubarPortal],
] as const;

describe("nebula > *Portal parts", () => {
	it.each(parts)(
		"%s mounts its children into body and removes them on unmount",
		(_name, slotName, Part) => {
			const view = mount(
				html`<section id="view">${Part({ children: html`<p id="inside">portalled</p>` })}</section>`,
			);
			expect(portals()).toHaveLength(1);
			const host = portals()[0];
			expect(host?.parentElement).toBe(document.body);
			expect(host?.getAttribute("data-slot")).toBe(slotName);
			expect(document.getElementById("inside")?.closest("#view")).toBeNull();

			view.dispose();
			expect(portals()).toHaveLength(0);
			expect(document.getElementById("inside")).toBeNull();
		},
	);

	it.each(parts)(
		"%s leaves no host behind across repeated mounts",
		(_name, _slot, Part) => {
			for (let round = 0; round < 3; round++) {
				mount(html`${Part({ children: "row" })}`).dispose();
			}
			expect(portals()).toHaveLength(0);
		},
	);

	it.each(parts)(
		"%s portals once the server markup is hydrated",
		(_name, _slot, Part) => {
			const page = () =>
				html`<section>${Part({ children: html`<p id="inside">portalled</p>` })}</section>`;
			const root = document.createElement("div");
			document.body.appendChild(root);
			resetIds();
			root.innerHTML = renderToString(page());
			const stop = hydrate(root, page);
			expect(portals()).toHaveLength(1);
			expect(document.getElementById("inside")?.textContent).toBe("portalled");
			stop();
			expect(portals()).toHaveLength(0);
		},
	);
});
