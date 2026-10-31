/**
 * DataTable keeps its rows by `rowKey`.
 *
 * The body rebuilt every row whenever the rows changed: a list re-read every
 * few seconds lost its open menus, its focus and its hover on each read, even
 * when nothing in it had moved. The body now renders through aurora's `each`
 * on `rowKey`: a row that stays keeps its element, and a row whose data
 * changed redraws its cells and nothing else.
 */

import { html, signal } from "@c9up/aurora";
import { describe, expect, it } from "vitest";
import { type Column, DataTable } from "../../src/organisms/DataTable.js";
import { mount } from "./helpers.js";

interface Site {
	id: string;
	status: string;
}

const builds: string[] = [];

const columns: readonly Column<Site>[] = [
	{ key: "id", header: "Site" },
	{
		key: "status",
		header: "Status",
		cell: (site) => {
			builds.push(site.id);
			return html`<span>${site.status}</span>`;
		},
	},
];

const rowsOf = (host: HTMLElement): HTMLTableRowElement[] => [
	...host.querySelectorAll<HTMLTableRowElement>("tbody tr"),
];

function expectSameRows(actual: Node[], expected: Array<Node | undefined>) {
	expect(actual.length).toBe(expected.length);
	for (const [i, node] of actual.entries()) expect(node).toBe(expected[i]);
}

describe("nebula > DataTable keeps rows by key", () => {
	it("keeps every row when the rows are read again unchanged", () => {
		const first: readonly Site[] = [
			{ id: "a", status: "up" },
			{ id: "b", status: "up" },
		];
		const data = signal<readonly Site[]>(first);
		const view = mount(
			DataTable({ columns, rows: data, rowKey: (site) => site.id }),
		);
		const before = rowsOf(view.host);
		builds.length = 0;

		// Same elements in a new array: nothing to redraw.
		data([...first]);
		expectSameRows(rowsOf(view.host), before);
		expect(builds).toEqual([]);
		view.dispose();
	});

	it("redraws only the cells of a row whose data changed", () => {
		const a = { id: "a", status: "up" };
		const data = signal<readonly Site[]>([a, { id: "b", status: "up" }]);
		const view = mount(
			DataTable({ columns, rows: data, rowKey: (site) => site.id }),
		);
		const before = rowsOf(view.host);
		builds.length = 0;

		data([a, { id: "b", status: "down" }]);
		expectSameRows(rowsOf(view.host), before);
		expect(builds).toEqual(["b"]);
		expect(view.host.querySelector("tbody")?.textContent).toContain("down");
		view.dispose();
	});

	it("moves the rows when the sort changes, without rebuilding them", () => {
		const data = signal<readonly Site[]>([
			{ id: "b", status: "up" },
			{ id: "a", status: "up" },
		]);
		const view = mount(
			DataTable({ columns, rows: data, rowKey: (site) => site.id }),
		);
		const [b, a] = rowsOf(view.host);
		const header = [...view.host.querySelectorAll("th")].find(
			(cell) => cell.textContent?.trim() === "Site",
		);
		header?.click();
		expectSameRows(rowsOf(view.host), [a, b]);
		view.dispose();
	});

	it("switches to the empty row and back", () => {
		const data = signal<readonly Site[]>([{ id: "a", status: "up" }]);
		const view = mount(
			DataTable({
				columns,
				rows: data,
				rowKey: (site) => site.id,
				emptyMessage: "Nothing yet",
			}),
		);
		data([]);
		expect(view.host.querySelector("tbody")?.textContent).toBe("Nothing yet");
		data([{ id: "c", status: "up" }]);
		expect(rowsOf(view.host).length).toBe(1);
		expect(view.host.querySelector("tbody")?.textContent).toContain("c");
		view.dispose();
	});
});
