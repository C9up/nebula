/**
 * Values that may come from users, through every nebula part that writes them
 * into the document, on both paths a page takes (server markup and the
 * browser's own render).
 *
 * The URL guard itself lives in aurora and is tested there. What is pinned
 * here is that each part hands an `href` to that guard as an attribute slot:
 * a part that one day builds its markup as a string, or reads a sort key back
 * from the DOM, would pass every behaviour test and still be an injection.
 */

import { renderToString, resetIds, type TemplateResult } from "@c9up/aurora";
import { afterEach, describe, expect, it } from "vitest";
import { defaultImageResolver } from "../../src/lib/image.js";
import { Attachment } from "../../src/molecules/Attachment.js";
import { BreadcrumbLink } from "../../src/molecules/Breadcrumb.js";
import { PaginationLink } from "../../src/molecules/Pagination.js";
import { type Column, DataTable } from "../../src/organisms/DataTable.js";
import { HoverCard, HoverCardTrigger } from "../../src/organisms/HoverCard.js";
import {
	NavigationMenu,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
} from "../../src/organisms/NavigationMenu.js";
import {
	SidebarMenuButton,
	SidebarMenuSubButton,
} from "../../src/organisms/Sidebar.js";
import { SettingsLayout } from "../../src/templates/SettingsLayout.js";
import { mount } from "./helpers.js";

afterEach(() => {
	document.body.innerHTML = "";
});

/** Spellings a browser resolves to the `javascript:` scheme. */
const payloads = [
	"javascript:alert(1)",
	"JaVaScRiPt:alert(1)",
	"  javascript:alert(1)",
	"java\tscript:alert(1)",
	"\u0000javascript:alert(1)",
];

const linkParts: ReadonlyArray<
	readonly [string, (href: string) => TemplateResult]
> = [
	["BreadcrumbLink", (href) => BreadcrumbLink({ href, children: "Home" })],
	["PaginationLink", (href) => PaginationLink({ href, children: "2" })],
	[
		"NavigationMenuLink",
		(href) =>
			NavigationMenu({
				children: () =>
					NavigationMenuList({
						children: NavigationMenuItem({
							children: () => NavigationMenuLink({ href, children: "Docs" }),
						}),
					}),
			}),
	],
	[
		"HoverCardTrigger",
		(href) =>
			HoverCard({
				children: () => HoverCardTrigger({ href, children: "@ada" }),
			}),
	],
	[
		"SidebarMenuButton",
		(href) => SidebarMenuButton({ href, children: "Home" }),
	],
	[
		"SidebarMenuSubButton",
		(href) => SidebarMenuSubButton({ href, children: "Sub" }),
	],
	[
		"Attachment (file)",
		(href) => Attachment({ name: "report.pdf", type: "application/pdf", href }),
	],
	[
		"Attachment (image)",
		(href) => Attachment({ name: "photo.png", type: "image/png", href }),
	],
	[
		"SettingsLayout",
		(href) =>
			SettingsLayout({
				title: "Settings",
				sections: [{ label: "Profile", href }],
			}),
	],
];

function hrefsIn(root: ParentNode): string[] {
	return [...root.querySelectorAll("a")].map(
		(anchor) => anchor.getAttribute("href") ?? "",
	);
}

function expectNeutralised(hrefs: string[]): void {
	expect(hrefs.length).toBeGreaterThan(0);
	for (const href of hrefs) expect(href.startsWith("unsafe:")).toBe(true);
}

describe("nebula > link parts neutralise a javascript: href", () => {
	for (const [name, build] of linkParts) {
		it.each(payloads)(`${name}, server markup: %j`, (payload) => {
			resetIds();
			const parsed = document.createElement("template");
			parsed.innerHTML = renderToString(build(payload));
			expectNeutralised(hrefsIn(parsed.content));
		});

		it.each(payloads)(`${name}, browser render: %j`, (payload) => {
			const view = mount(build(payload));
			expectNeutralised(hrefsIn(view.host));
			view.dispose();
		});
	}

	it("leaves an ordinary href alone", () => {
		const view = mount(BreadcrumbLink({ href: "/a?b=1#c", children: "A" }));
		expect(hrefsIn(view.host)).toEqual(["/a?b=1#c"]);
		view.dispose();
	});
});

describe("nebula > DataTable sorts only by its own columns", () => {
	interface Account {
		id: string;
		name: string;
		readonly password: string;
	}

	it("ignores a sort key written into the header's DOM", () => {
		const reads: string[] = [];
		const account = (id: string, name: string): Account => ({
			id,
			name,
			get password(): string {
				reads.push(id);
				return `secret-${id}`;
			},
		});
		const columns: readonly Column<Account>[] = [
			{ key: "name", header: "Name" },
		];
		const view = mount(
			DataTable({
				columns,
				rows: [account("1", "Zoe"), account("2", "Ada")],
				rowKey: (row) => row.id,
			}),
		);
		const header = view.host.querySelector<HTMLElement>("thead th");
		// What a script or an extension could plant on the header before the click.
		header?.setAttribute("data-key", "password");
		header?.setAttribute("data-sort", "password");
		header?.setAttribute("aria-sort", "password");
		header?.click();

		expect(reads).toEqual([]);
		expect(header?.getAttribute("aria-sort")).toBe("ascending");
		const names = [...view.host.querySelectorAll("tbody tr")].map((row) =>
			row.textContent?.trim(),
		);
		expect(names).toEqual(["Ada", "Zoe"]);
		expect(view.host.textContent).not.toContain("secret");
		view.dispose();
	});
});

describe("nebula > defaultImageResolver encodes the source", () => {
	it("keeps &, ?, =, # and spaces inside the src parameter", () => {
		const url = defaultImageResolver("/a b&c=d?e#f.jpg", { width: 640 });
		expect(url).toBe("/__image?src=a+b%26c%3Dd%3Fe%23f.jpg&w=640");
		const query = new URLSearchParams(url.slice(url.indexOf("?") + 1));
		expect(query.get("src")).toBe("a b&c=d?e#f.jpg");
		expect([...query.keys()]).toEqual(["src", "w"]);
	});

	it("cannot override the width through the source", () => {
		const url = defaultImageResolver("/a.jpg&w=99999", { width: 640 });
		const query = new URLSearchParams(url.slice(url.indexOf("?") + 1));
		expect(query.getAll("w")).toEqual(["640"]);
		expect(query.get("src")).toBe("a.jpg&w=99999");
	});
});
