// @vitest-environment node
/**
 * The five `*Portal` parts on the server, where there is no document.
 *
 * A portal is a browser operation: it appends a host to `<body>`. Built in
 * the component's setup, it ran inside `renderToString` and threw
 * `document is not defined`, failing the whole request for a page that
 * merely contained one. They render nothing on the server and portal once
 * mounted, as a portal that waits for its mount effect does.
 */

import { html, renderToString, resetIds } from "@c9up/aurora";
import { describe, expect, it } from "vitest";
import { AlertDialogPortal } from "../../src/organisms/AlertDialog.js";
import { ContextMenuPortal } from "../../src/organisms/ContextMenu.js";
import { DialogPortal } from "../../src/organisms/Dialog.js";
import { DropdownMenuPortal } from "../../src/organisms/DropdownMenu.js";
import { MenubarPortal } from "../../src/organisms/Menubar.js";

const parts = [
	["DialogPortal", DialogPortal],
	["AlertDialogPortal", AlertDialogPortal],
	["DropdownMenuPortal", DropdownMenuPortal],
	["ContextMenuPortal", ContextMenuPortal],
	["MenubarPortal", MenubarPortal],
] as const;

describe("nebula > *Portal parts > server", () => {
	it.each(parts)(
		"%s renders on the server without touching document",
		(_name, Part) => {
			resetIds();
			const markup = renderToString(
				html`<main>${Part({ children: html`<p id="inside">portalled</p>` })}</main>`,
			);
			expect(markup).toContain("<main>");
			// Client-only content: nothing to hydrate, nothing leaked in place.
			expect(markup).not.toContain("portalled");
		},
	);
});
