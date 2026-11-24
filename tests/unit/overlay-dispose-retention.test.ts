/**
 * An overlay disposed while it is open keeps nothing alive: no document
 * listener, no layer, no portal holds its panel or what its rows close over.
 * The same as an overlay closed before it is disposed.
 */
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { html, type TemplateResult } from "@c9up/aurora";
import { describe, expect, it } from "vitest";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "../../src/organisms/ContextMenu.js";
import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "../../src/organisms/Dialog.js";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../src/organisms/DropdownMenu.js";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "../../src/organisms/HoverCard.js";
import {
	Menubar,
	MenubarContent,
	MenubarItem,
	MenubarMenu,
	MenubarTrigger,
} from "../../src/organisms/Menubar.js";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "../../src/organisms/Popover.js";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "../../src/organisms/Tooltip.js";
import { mount } from "./helpers.js";

setFlagsFromString("--expose-gc");
const gc: () => void = runInNewContext("gc");

interface Secret {
	payload: string;
}

/** A row that closes over `secret`, the way a real item closes over its data. */
function row(secret: Secret): TemplateResult {
	return html`<button type="button" @click="${() => void secret.payload.length}">Row</button>`;
}

interface Overlay {
	readonly name: string;
	readonly content: string;
	build(secret: Secret): TemplateResult;
	open(): void;
}

const one = (selector: string): HTMLElement | null =>
	document.querySelector<HTMLElement>(selector);

const overlays: readonly Overlay[] = [
	{
		name: "DropdownMenu",
		content: "dropdown-menu-content",
		build: (secret) =>
			DropdownMenu({
				children: () =>
					html`${DropdownMenuTrigger({ children: "Account" })}${DropdownMenuContent(
						{
							children: () =>
								DropdownMenuItem({
									children: "Export",
									onSelect: () => void secret.payload.length,
								}),
						},
					)}`,
			}),
		open: () => one("[data-slot='dropdown-menu-trigger']")?.click(),
	},
	{
		name: "ContextMenu",
		content: "context-menu-content",
		build: (secret) =>
			ContextMenu({
				children: () =>
					html`${ContextMenuTrigger({ children: "Area" })}${ContextMenuContent({
						children: () =>
							ContextMenuItem({
								children: "Copy",
								onSelect: () => void secret.payload.length,
							}),
					})}`,
			}),
		open: () =>
			one("[data-slot='context-menu-trigger']")?.dispatchEvent(
				new MouseEvent("contextmenu", {
					bubbles: true,
					cancelable: true,
					clientX: 10,
					clientY: 10,
				}),
			),
	},
	{
		name: "Menubar",
		content: "menubar-content",
		build: (secret) =>
			Menubar({
				children: () =>
					MenubarMenu({
						children: () =>
							html`${MenubarTrigger({ children: "File" })}${MenubarContent({
								children: () =>
									MenubarItem({
										children: "New",
										onSelect: () => void secret.payload.length,
									}),
							})}`,
					}),
			}),
		open: () => one("[data-slot='menubar-trigger']")?.click(),
	},
	{
		name: "Popover",
		content: "popover-content",
		build: (secret) =>
			Popover({
				children: () =>
					html`${PopoverTrigger({ children: "Open" })}${PopoverContent({
						children: row(secret),
					})}`,
			}),
		open: () => one("[data-slot='popover-trigger']")?.click(),
	},
	{
		name: "HoverCard",
		content: "hover-card-content",
		build: (secret) =>
			HoverCard({
				defaultOpen: true,
				children: () =>
					html`${HoverCardTrigger({ children: "@ada" })}${HoverCardContent({
						children: row(secret),
					})}`,
			}),
		open: () => {},
	},
	{
		name: "Tooltip",
		content: "tooltip-content",
		build: (secret) =>
			Tooltip({
				defaultOpen: true,
				children: () =>
					html`${TooltipTrigger({ children: "Save" })}${TooltipContent({
						children: row(secret),
					})}`,
			}),
		open: () => {},
	},
	{
		name: "Dialog",
		content: "dialog-content",
		build: (secret) =>
			Dialog({
				defaultOpen: true,
				children: () =>
					DialogContent({
						children: () =>
							html`${DialogTitle({ children: "Edit" })}${row(secret)}`,
					}),
			}),
		open: () => {},
	},
];

async function collect(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		await new Promise((resolve) => setTimeout(resolve, 5));
		gc();
	}
}

/** One mount, opened, disposed while open. Its own frame, so no local outlives it. */
function round(overlay: Overlay, refs: WeakRef<object>[]): void {
	const secret = { payload: `${"x".repeat(20_000)}${refs.length}` };
	refs.push(new WeakRef(secret));
	const view = mount(overlay.build(secret));
	overlay.open();
	expect(one(`[data-slot='${overlay.content}']`)).not.toBeNull();
	view.dispose();
	expect(one(`[data-slot='${overlay.content}']`)).toBeNull();
}

describe("nebula > an overlay disposed while open", () => {
	for (const overlay of overlays) {
		it(`releases a ${overlay.name} and what its content closes over`, async () => {
			const refs: WeakRef<object>[] = [];
			for (let i = 0; i < 3; i++) round(overlay, refs);
			// One more round, with nothing to watch: the DOM keeps the element
			// that last held focus, and with it the most recent mount only.
			round(overlay, []);
			document.body.innerHTML = "";
			await collect();
			expect(refs.filter((ref) => ref.deref() !== undefined)).toHaveLength(0);
		}, 30_000);
	}
});
