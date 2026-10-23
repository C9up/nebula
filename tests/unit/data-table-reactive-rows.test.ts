/**
 * DataTable follows rows that change, keeping what the user set.
 *
 * `rows` was read once, at setup. aurora never re-renders a component, so a
 * table built over a signal stayed on its first data, and rebuilding it to show
 * the new data threw away the sort, the filter and the page. The model is
 * TanStack Table, which shadcn's DataTable sits on: new `data` keeps sorting and
 * filters and returns to the first page unless `autoResetPageIndex` is off.
 */

import { signal } from "@c9up/aurora";
import { describe, expect, it } from "vitest";
import { type Column, DataTable } from "../../src/organisms/DataTable.js";
import { mount } from "./helpers.js";

interface Domain {
	name: string;
	hits: number;
}

const columns: readonly Column<Domain>[] = [
	{ key: "name", header: "Name" },
	{ key: "hits", header: "Hits" },
];

function domains(count: number, offset = 0): Domain[] {
	return Array.from({ length: count }, (_, i) => ({
		name: `d${String(i + offset).padStart(2, "0")}`,
		hits: i,
	}));
}

function names(host: HTMLElement): string[] {
	return [...host.querySelectorAll("tbody tr")].map(
		(row) => row.querySelector("td")?.textContent ?? "",
	);
}

function clickHeader(host: HTMLElement, label: string): void {
	const header = [...host.querySelectorAll("th")].find(
		(cell) => cell.textContent?.trim() === label,
	);
	header?.click();
}

function filterBox(host: HTMLElement): HTMLInputElement | null {
	return host.querySelector("input[type=search]");
}

function typeFilter(host: HTMLElement, value: string): void {
	const input = filterBox(host);
	if (input === null) throw new Error("expected the filter box");
	input.value = value;
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function pageLinks(host: HTMLElement): string[] {
	// Numbers only: Previous and Next are pagination links too.
	return [...host.querySelectorAll("[data-slot=pagination-link]")]
		.map((link) => link.textContent?.trim() ?? "")
		.filter((label) => /^\d+$/.test(label));
}

function clickPage(host: HTMLElement, label: string): void {
	const link = [
		...host.querySelectorAll<HTMLElement>("[data-slot=pagination-link]"),
	].find((entry) => entry.textContent?.trim() === label);
	link?.click();
}

describe("nebula > DataTable over changing rows", () => {
	it("shows the new rows, still sorted and filtered", () => {
		const data = signal<readonly Domain[]>([
			{ name: "b.ch", hits: 1 },
			{ name: "a.ch", hits: 2 },
			{ name: "x.io", hits: 3 },
		]);
		const view = mount(
			DataTable({
				columns,
				rows: data,
				rowKey: (row) => row.name,
				filterMatch: (row, query) => row.name.includes(query),
			}),
		);
		clickHeader(view.host, "Name");
		typeFilter(view.host, ".ch");
		expect(names(view.host)).toEqual(["a.ch", "b.ch"]);

		data([...data(), { name: "0.ch", hits: 4 }, { name: "y.io", hits: 5 }]);
		expect(names(view.host)).toEqual(["0.ch", "a.ch", "b.ch"]);
		view.dispose();
	});

	it("goes back to the first page when the rows change, as TanStack does", () => {
		const data = signal<readonly Domain[]>(domains(25));
		const view = mount(
			DataTable({
				columns,
				rows: data,
				rowKey: (row) => row.name,
				pageSize: 10,
			}),
		);
		clickPage(view.host, "3");
		expect(names(view.host)[0]).toBe("d20");

		data(domains(25, 50));
		expect(names(view.host)[0]).toBe("d50");
		view.dispose();
	});

	it("keeps the page with autoResetPage off, clamped to the pages left", () => {
		const data = signal<readonly Domain[]>(domains(25));
		const view = mount(
			DataTable({
				columns,
				rows: data,
				rowKey: (row) => row.name,
				pageSize: 10,
				autoResetPage: false,
			}),
		);
		clickPage(view.host, "2");
		data(domains(25, 50));
		expect(names(view.host)[0]).toBe("d60");

		data(domains(5, 50));
		expect(names(view.host)).toHaveLength(5);
		view.dispose();
	});

	it("offers as many page links as the rows now need", () => {
		const data = signal<readonly Domain[]>(domains(15));
		const view = mount(
			DataTable({
				columns,
				rows: data,
				rowKey: (row) => row.name,
				pageSize: 10,
			}),
		);
		expect(pageLinks(view.host)).toEqual(["1", "2"]);
		data(domains(35));
		expect(pageLinks(view.host)).toEqual(["1", "2", "3", "4"]);
		view.dispose();
	});

	it("still takes a plain array", () => {
		const view = mount(
			DataTable({ columns, rows: domains(2), rowKey: (row) => row.name }),
		);
		expect(names(view.host)).toEqual(["d00", "d01"]);
		view.dispose();
	});
});

describe("nebula > DataTable filter box", () => {
	it("is named by its placeholder, or by filterLabel", () => {
		const match = (row: Domain, query: string) => row.name.includes(query);
		const placeholder = mount(
			DataTable({
				columns,
				rows: domains(1),
				rowKey: (row) => row.name,
				filterMatch: match,
				filterPlaceholder: "Filter domains…",
			}),
		);
		expect(filterBox(placeholder.host)?.getAttribute("aria-label")).toBe(
			"Filter domains…",
		);
		placeholder.dispose();

		const labelled = mount(
			DataTable({
				columns,
				rows: domains(1),
				rowKey: (row) => row.name,
				filterMatch: match,
				filterLabel: "Filter by name",
			}),
		);
		expect(filterBox(labelled.host)?.getAttribute("aria-label")).toBe(
			"Filter by name",
		);
		labelled.dispose();
	});
});
