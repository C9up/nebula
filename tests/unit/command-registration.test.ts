/**
 * Command items belong to the palette only while they are on screen.
 *
 * A palette fed by search results swaps its items all the time. As cmdk's
 * store: an item unregisters when it unmounts, the highlight falls back to
 * the first item still there, and selecting runs the mounted item's own
 * `onSelect` — never an action that is no longer rendered.
 */

import { html, signal } from "@c9up/aurora";
import { afterEach, describe, expect, it } from "vitest";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "../../src/organisms/Command.js";
import { mount, press, tick } from "./helpers.js";

afterEach(() => {
	document.body.innerHTML = "";
});

interface Result {
	readonly value: string;
	readonly label: string;
	readonly run: () => void;
}

function palette(results: () => readonly Result[]) {
	return mount(
		Command({
			children: () =>
				html`${CommandInput({})}${CommandList({
					children: () =>
						html`${CommandEmpty({ children: "Nothing found." })}${() =>
							results().map((result) =>
								CommandItem({
									value: result.value,
									children: result.label,
									onSelect: result.run,
								}),
							)}`,
				})}`,
		}),
	);
}

const input = (): HTMLInputElement | null =>
	document.querySelector<HTMLInputElement>("[data-slot='command-input']");
const rendered = (): string[] =>
	[...document.querySelectorAll("[data-slot='command-item']")].map(
		(item) => item.textContent ?? "",
	);

describe("Command > items that come and go", () => {
	it("runs the visible first item on Enter after the results changed", async () => {
		const ran: string[] = [];
		const results = signal<readonly Result[]>([
			{
				value: "delete",
				label: "Delete account",
				run: () => ran.push("delete"),
			},
		]);
		const view = palette(results);
		results([
			{
				value: "settings",
				label: "Open settings",
				run: () => ran.push("settings"),
			},
		]);
		await tick();
		expect(rendered()).toEqual(["Open settings"]);
		input()?.dispatchEvent(press("Enter"));
		expect(ran).toEqual(["settings"]);
		view.dispose();
	});

	it("runs the new onSelect of an item rendered again under the same value", async () => {
		const ran: string[] = [];
		const results = signal<readonly Result[]>([
			{ value: "open", label: "Open", run: () => ran.push("old") },
		]);
		const view = palette(results);
		results([{ value: "open", label: "Open", run: () => ran.push("new") }]);
		await tick();
		document.querySelector<HTMLElement>("[data-slot='command-item']")?.click();
		input()?.dispatchEvent(press("Enter"));
		expect(ran).toEqual(["new", "new"]);
		view.dispose();
	});

	it("shows CommandEmpty once every item has unmounted", async () => {
		const results = signal<readonly Result[]>([
			{ value: "a", label: "A", run: () => {} },
		]);
		const view = palette(results);
		// The items of a reactive list mount after the empty state is built.
		await tick();
		const empty = document.querySelector("[data-slot='command-empty']");
		expect(empty?.hasAttribute("hidden")).toBe(true);
		results([]);
		await tick();
		expect(empty?.hasAttribute("hidden")).toBe(false);
		input()?.dispatchEvent(press("Enter"));
		results([{ value: "b", label: "B", run: () => {} }]);
		await tick();
		expect(empty?.hasAttribute("hidden")).toBe(true);
		view.dispose();
	});

	it("moves the highlight off an item that unmounted", async () => {
		const ran: string[] = [];
		const results = signal<readonly Result[]>([
			{ value: "a", label: "A", run: () => ran.push("a") },
			{ value: "b", label: "B", run: () => ran.push("b") },
		]);
		const view = palette(results);
		await tick();
		// From the implicit first match to the second.
		input()?.dispatchEvent(press("ArrowDown"));
		expect(input()?.getAttribute("aria-activedescendant")).toBe(
			document.querySelectorAll("[data-slot='command-item']")[1]?.id,
		);
		results([{ value: "c", label: "C", run: () => ran.push("c") }]);
		await tick();
		const only = document.querySelector("[data-slot='command-item']");
		expect(input()?.getAttribute("aria-activedescendant")).toBe(only?.id);
		expect(only?.getAttribute("aria-selected")).toBe("true");
		input()?.dispatchEvent(press("Enter"));
		expect(ran).toEqual(["c"]);
		view.dispose();
	});
});
