/**
 * In the browser a submenu's panel factory belongs to its trigger: there while
 * the trigger is mounted, gone once it is disposed — opened or not.
 */
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { html, type TemplateResult } from "@c9up/aurora";
import { describe, expect, it } from "vitest";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "../../src/organisms/DropdownMenu.js";
import { mount } from "./helpers.js";

setFlagsFromString("--expose-gc");
const gc: () => void = runInNewContext("gc");

function menu(secret: { payload: string }): TemplateResult {
	return DropdownMenu({
		children: () =>
			html`${DropdownMenuTrigger({ children: "Account" })}${DropdownMenuContent(
				{
					children: () =>
						DropdownMenuSub({
							children: () =>
								html`${DropdownMenuSubTrigger({ children: "More" })}${DropdownMenuSubContent(
									{
										children: () =>
											DropdownMenuItem({
												children: "Export",
												onSelect: () => void secret.payload.length,
											}),
									},
								)}`,
						}),
				},
			)}`,
	});
}

async function collect(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		await new Promise((resolve) => setTimeout(resolve, 5));
		gc();
	}
}

const one = (selector: string): HTMLElement | null =>
	document.querySelector<HTMLElement>(selector);

const pressEscape = (): void => {
	const target = document.activeElement ?? document;
	target.dispatchEvent(
		new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
	);
};

/**
 * Mount a menu whose submenu item closes over a fresh object, opened or not,
 * then dispose it. Its own frame, so no local of the test outlives it.
 */
function round(refs: WeakRef<object>[], open: boolean): void {
	const secret = { payload: `${"x".repeat(20_000)}${refs.length}` };
	refs.push(new WeakRef(secret));
	const view = mount(menu(secret));
	if (open) {
		one("[data-slot='dropdown-menu-trigger']")?.click();
		one("[data-slot='dropdown-menu-sub-trigger']")?.dispatchEvent(
			new MouseEvent("pointerover", { bubbles: true }),
		);
		expect(one("[data-slot='dropdown-menu-sub-content']")).not.toBeNull();
		pressEscape();
		pressEscape();
		expect(one("[data-slot='dropdown-menu-content']")).toBeNull();
	}
	view.dispose();
}

describe("nebula > submenus in the browser", () => {
	it("opens a mounted submenu, and keeps nothing once the menu is disposed", async () => {
		const refs: WeakRef<object>[] = [];
		// Every other round opens the menu and its submenu, then closes both;
		// the others never open it at all.
		for (let i = 0; i < 6; i++) round(refs, i % 2 === 0);
		document.body.innerHTML = "";
		await collect();
		expect(refs.filter((ref) => ref.deref() !== undefined)).toHaveLength(0);
	}, 30_000);
});
