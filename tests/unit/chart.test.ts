/**
 * Chart — what a dashboard reads off it.
 *
 * A value axis with round, readable ticks; a domain that can leave zero or run
 * upside down; category labels that do not overlap; gaps where data is
 * missing instead of invented zeros; a point readable by pointer and by
 * keyboard; text that keeps its shape; and the app's own number and date
 * formats everywhere a value is written.
 */

import { hydrate, renderToString, resetIds } from "@c9up/aurora";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	Chart,
	type ChartDatum,
	type ChartProps,
	niceTicks,
	valueAxis,
	valueRange,
	visibleCategories,
} from "../../src/organisms/Chart.js";
import { mount } from "./helpers.js";

const SERIES = [
	{ key: "desktop", label: "Desktop" },
	{ key: "mobile", label: "Mobile" },
];
const VISITS: ChartDatum[] = [
	{ month: "Jan", desktop: 186, mobile: 80 },
	{ month: "Feb", desktop: 305, mobile: 200 },
	{ month: "Mar", desktop: 237, mobile: 120 },
];

function props(overrides: Partial<ChartProps> = {}): ChartProps {
	return {
		label: "Visitors",
		categoryKey: "month",
		data: VISITS,
		series: SERIES,
		...overrides,
	};
}

function server(overrides: Partial<ChartProps> = {}): HTMLElement {
	resetIds();
	const host = document.createElement("div");
	host.innerHTML = renderToString(Chart(props(overrides)));
	return host;
}

const texts = (root: ParentNode, selector: string): string[] =>
	[...root.querySelectorAll(selector)].map((node) => node.textContent ?? "");

const axisLabels = (root: ParentNode): string[] =>
	texts(root, "[data-slot='chart-value-axis'] text");

const categoryLabels = (root: ParentNode): string[] =>
	texts(root, "[data-slot='chart-plot'] > svg > g > text");

/** The `y` of each point of a series' line, in drawing order, per run. */
function runs(root: ParentNode, key: string): number[][] {
	const path = root
		.querySelector(`[data-series='${key}'] path[fill='none']`)
		?.getAttribute("d");
	if (path === null || path === undefined || path === "") return [];
	return path
		.split("M")
		.filter((part) => part.trim() !== "")
		.map((part) =>
			part.split("L").map((point) => Number(point.trim().split(",")[1])),
		);
}

/**
 * A `ResizeObserver` the test drives: `report(width)` delivers a resize to
 * whatever the chart observes.
 */
function stubResizeObserver(): (width: number) => void {
	const observers: Observer[] = [];
	class Observer implements ResizeObserver {
		readonly #callback: ResizeObserverCallback;
		constructor(callback: ResizeObserverCallback) {
			this.#callback = callback;
			observers.push(this);
		}
		deliver(entry: ResizeObserverEntry): void {
			this.#callback([entry], this);
		}
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	}
	vi.stubGlobal("ResizeObserver", Observer);
	return (width) => {
		const entry: ResizeObserverEntry = {
			target: document.createElement("div"),
			contentRect: DOMRect.fromRect({ width, height: 240 }),
			borderBoxSize: [],
			contentBoxSize: [],
			devicePixelContentBoxSize: [],
		};
		for (const observer of [...observers]) observer.deliver(entry);
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	document.body.innerHTML = "";
});

describe("Chart > the value axis", () => {
	it("steps by round numbers: 1, 2, 2.5 or 5 times a power of ten", () => {
		expect(niceTicks(0, 523).ticks).toEqual([0, 200, 400, 600]);
		expect(niceTicks(480, 520).ticks).toEqual([480, 490, 500, 510, 520]);
		expect(niceTicks(0, 1).ticks).toEqual([0, 0.25, 0.5, 0.75, 1]);
		// No floating-point dust: 0.1 * 3 is written 0.3.
		expect(niceTicks(0, 0.27, 4).ticks).toEqual([0, 0.1, 0.2, 0.3]);
	});

	it("writes each tick on the axis, beside a gridline", () => {
		const host = server();
		expect(axisLabels(host)).toEqual(["0", "100", "200", "300", "400"]);
		expect(
			host.querySelectorAll("[data-slot='chart-plot'] > svg > g > line"),
		).toHaveLength(5);
	});

	it("starts at zero by default, and need not", () => {
		const data = [
			{ day: "1", ms: 482 },
			{ day: "2", ms: 517 },
		];
		const series = [{ key: "ms", label: "Latency" }];
		expect(valueAxis(data, series)).toMatchObject({ min: 0, max: 600 });
		expect(valueAxis(data, series, { zero: false })).toEqual({
			min: 480,
			max: 520,
			ticks: [480, 490, 500, 510, 520],
		});
	});

	it("keeps bars on zero whatever `zero` says", () => {
		const host = server({
			type: "bar",
			zero: false,
			data: [
				{ month: "Jan", desktop: 482, mobile: 490 },
				{ month: "Feb", desktop: 517, mobile: 500 },
			],
		});
		expect(axisLabels(host)[0]).toBe("0");
	});

	it("keeps a fixed end exactly, as a tick of its own", () => {
		const ranks = [
			{ day: "1", position: 3 },
			{ day: "2", position: 37 },
		];
		const series = [{ key: "position", label: "Position" }];
		expect(
			valueAxis(ranks, series, { domain: [1, "auto"], zero: false }),
		).toEqual({ min: 1, max: 40, ticks: [1, 10, 20, 30, 40] });
		expect(valueAxis(ranks, series, { domain: [0, 50] }).ticks.at(-1)).toBe(50);
	});

	it("runs upside down when reversed: position 1 at the top", () => {
		const data = [
			{ month: "Jan", position: 1 },
			{ month: "Feb", position: 10 },
		];
		const series = [{ key: "position", label: "Position" }];
		const [upright] = runs(server({ data, series, zero: false }), "position");
		const [reversed] = runs(
			server({ data, series, zero: false, reversed: true }),
			"position",
		);
		// Smaller y is higher on the screen.
		expect(upright?.[0]).toBeGreaterThan(upright?.[1] ?? 0);
		expect(reversed?.[0]).toBeLessThan(reversed?.[1] ?? 0);
	});

	it("skips gaps when it measures the data, and reads no data as 0–1", () => {
		const series = [{ key: "v", label: "V" }];
		expect(
			valueRange([{ v: 5 }, { v: null }, { v: -2 }], series, { zero: false }),
		).toEqual({ min: -2, max: 5 });
		expect(valueRange([{ v: null }], series)).toEqual({ min: 0, max: 1 });
	});
});

describe("Chart > missing values", () => {
	const data: ChartDatum[] = [
		{ month: "Jan", desktop: 10, mobile: 4 },
		{ month: "Feb", desktop: 12, mobile: null },
		{ month: "Mar", desktop: null, mobile: 6 },
		{ month: "Apr", desktop: 14, mobile: null },
		{ month: "May", desktop: 16 },
	];

	it("breaks the line at a gap instead of dropping it to zero", () => {
		const host = server({ data });
		const desktop = runs(host, "desktop");
		expect(desktop.map((run) => run.length)).toEqual([2, 2]);
		const zero = Number(
			host
				.querySelector("[data-slot='chart-value-axis'] text")
				?.getAttribute("y"),
		);
		expect(desktop.flat()).not.toContain(zero);
	});

	it("shows a value with a gap on each side as a dot", () => {
		const host = server({ data });
		// mobile: 4, gap, 6, gap, gap — Jan has no right neighbour, Mar none.
		expect(host.querySelectorAll("[data-lone='mobile'] circle")).toHaveLength(
			2,
		);
		expect(host.querySelectorAll("[data-lone='desktop'] circle")).toHaveLength(
			0,
		);
	});

	it("fills an area only under the stretches that exist", () => {
		const host = server({ data, type: "area" });
		const area = host
			.querySelector("[data-series='desktop'] path[fill-opacity]")
			?.getAttribute("d");
		expect(area?.match(/Z/g)).toHaveLength(2);
	});

	it("draws no bar for a missing value", () => {
		const host = server({ data, type: "bar" });
		expect(host.querySelectorAll("[data-series='desktop'] rect")).toHaveLength(
			4,
		);
		expect(host.querySelectorAll("[data-series='mobile'] rect")).toHaveLength(
			2,
		);
	});

	it("says so in the table rather than writing 0", () => {
		const host = server({ data });
		const row = [...host.querySelectorAll("tbody tr")][2];
		expect(texts(row ?? host, "td")).toEqual(["—", "6"]);
	});
});

describe("Chart > category labels", () => {
	const days: ChartDatum[] = Array.from({ length: 90 }, (_, index) => ({
		day: `2026-08-${String(index + 1).padStart(2, "0")}`,
		clicks: index,
	}));
	const series = [{ key: "clicks", label: "Clicks" }];

	it("thins the labels until the widest one fits its share of the room", () => {
		const shown = visibleCategories(90, 60, 600);
		expect(shown).toHaveLength(9);
		const slot = 600 / 90;
		const room = ((shown[1] ?? 0) - (shown[0] ?? 0)) * slot;
		expect(room).toBeGreaterThanOrEqual(60);
		expect(visibleCategories(3, 20, 600)).toEqual([0, 1, 2]);
	});

	it("thins on the server for a nominal width, then for the measured one", () => {
		const report = stubResizeObserver();
		const onServer = categoryLabels(
			server({ data: days, series, categoryKey: "day" }),
		);
		expect(onServer.length).toBeGreaterThan(1);
		expect(onServer.length).toBeLessThan(90);

		const view = mount(
			Chart(props({ data: days, series, categoryKey: "day" })),
		);
		report(1800);
		const wide = categoryLabels(view.host).length;
		report(300);
		const narrow = categoryLabels(view.host).length;
		expect(wide).toBeGreaterThan(onServer.length);
		expect(narrow).toBeLessThan(onServer.length);
		expect(narrow).toBeGreaterThan(0);
		view.dispose();
	});
});

describe("Chart > text keeps its shape", () => {
	it("draws no text inside a stretched drawing", () => {
		const view = mount(Chart(props()));
		const allText = [...view.host.querySelectorAll("text")];
		expect(allText.length).toBeGreaterThan(0);
		for (const node of allText) {
			// Rendered by the client in the SVG namespace, not as unknown HTML.
			expect(node).toBeInstanceOf(SVGElement);
			expect(node.closest("svg[preserveAspectRatio='none']")).toBeNull();
		}
		view.dispose();
	});

	it("keeps lines at their width where the drawing is stretched", () => {
		const paths = server().querySelectorAll(
			"svg[preserveAspectRatio='none'] path[fill='none']",
		);
		expect(paths.length).toBe(2);
		for (const path of paths) {
			expect(path.getAttribute("vector-effect")).toBe("non-scaling-stroke");
		}
	});
});

describe("Chart > reading a point", () => {
	function plotOf(host: ParentNode): HTMLElement {
		const plot = host.querySelector<HTMLElement>("[data-slot='chart-plot']");
		if (plot === null) throw new Error("no plot");
		return plot;
	}

	const tooltip = (): HTMLElement | null =>
		document.querySelector<HTMLElement>("[data-slot='chart-tooltip']");
	const status = (): string =>
		document.querySelector("[role='status']")?.textContent ?? "";
	const press = (target: HTMLElement, key: string): void => {
		target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
	};

	it("shows a guide and a tooltip for the category under the pointer", () => {
		const view = mount(Chart(props()));
		const plot = plotOf(view.host);
		plot.getBoundingClientRect = () =>
			DOMRect.fromRect({ x: 100, width: 300, height: 240 });

		plot.dispatchEvent(new PointerEvent("pointermove", { clientX: 350 }));
		expect(tooltip()?.textContent).toContain("Mar");
		expect(tooltip()?.textContent).toContain("237");
		// Placed through the CSSOM, on the centre of the third of three slots.
		expect(tooltip()?.style.left).toBe("83.3333333333%");
		expect(tooltip()?.hasAttribute("aria-hidden")).toBe(true);
		expect(
			view.host.querySelectorAll("[data-slot='chart-marker'] circle"),
		).toHaveLength(2);

		plot.dispatchEvent(new PointerEvent("pointerleave"));
		expect(tooltip()).toBeNull();
		expect(view.host.querySelector("[data-slot='chart-marker']")).toBeNull();
		view.dispose();
	});

	it("is reachable by keyboard: the arrows walk the categories and are announced", () => {
		const view = mount(Chart(props()));
		const plot = plotOf(view.host);
		expect(plot.tabIndex).toBe(0);
		expect(plot.getAttribute("aria-roledescription")).toBe("chart");
		expect(
			document.getElementById(plot.getAttribute("aria-labelledby") ?? "")
				?.textContent,
		).toBe("Visitors");

		press(plot, "ArrowRight");
		expect(status()).toBe("Jan — Desktop: 186, Mobile: 80");
		press(plot, "ArrowRight");
		expect(status()).toBe("Feb — Desktop: 305, Mobile: 200");
		expect(tooltip()?.textContent).toContain("Feb");
		press(plot, "End");
		expect(status()).toContain("Mar");
		press(plot, "ArrowRight");
		expect(status()).toContain("Mar");
		press(plot, "Home");
		expect(status()).toContain("Jan");
		press(plot, "Escape");
		expect(status()).toBe("");
		expect(tooltip()).toBeNull();
		view.dispose();
	});
});

describe("Chart > formats", () => {
	it("uses the given formatters on the axis, in the tooltip and in the table", () => {
		const view = mount(
			Chart(
				props({
					data: [
						{ day: new Date(Date.UTC(2026, 10, 2)), ms: 1250.5 },
						{ day: new Date(Date.UTC(2026, 10, 3)), ms: null },
					],
					series: [{ key: "ms", label: "Latency" }],
					categoryKey: "day",
					formatValue: (value) => `${value} ms`,
					formatCategory: (day) =>
						day instanceof Date ? day.toISOString().slice(5, 10) : String(day),
				}),
			),
		);
		expect(axisLabels(view.host).every((text) => text.endsWith(" ms"))).toBe(
			true,
		);
		expect(categoryLabels(view.host)).toEqual(["11-02", "11-03"]);
		expect(texts(view.host, "tbody th")).toEqual(["11-02", "11-03"]);
		expect(texts(view.host, "tbody td")).toEqual(["1250.5 ms", "—"]);

		const plot = view.host.querySelector<HTMLElement>(
			"[data-slot='chart-plot']",
		);
		plot?.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
		);
		expect(
			document.querySelector("[data-slot='chart-tooltip']")?.textContent,
		).toContain("1250.5 ms");
		view.dispose();
	});

	it("formats numbers and dates in `locale` by default", () => {
		const first = new Date(Date.UTC(2026, 10, 2, 12));
		const host = server({
			locale: "de-CH",
			data: [
				{ day: first, visits: 12500 },
				{ day: new Date(Date.UTC(2026, 10, 3, 12)), visits: 9800 },
			],
			series: [{ key: "visits", label: "Visits" }],
			categoryKey: "day",
		});
		const number = new Intl.NumberFormat("de-CH");
		const date = new Intl.DateTimeFormat("de-CH", { dateStyle: "medium" });
		expect(axisLabels(host)).toContain(number.format(10000));
		expect(texts(host, "tbody td")[0]).toBe(number.format(12500));
		expect(texts(host, "tbody th")[0]).toBe(date.format(first));
	});
});

describe("Chart > after hydration", () => {
	it("adopts the server's chart, then reads points and re-thins labels", () => {
		const report = stubResizeObserver();
		const days: ChartDatum[] = Array.from({ length: 60 }, (_, index) => ({
			day: `Day ${index + 1}`,
			clicks: index % 7 === 3 ? null : index,
		}));
		const page = () =>
			Chart(
				props({
					data: days,
					series: [{ key: "clicks", label: "Clicks" }],
					categoryKey: "day",
				}),
			);
		const host = document.createElement("div");
		document.body.appendChild(host);
		resetIds();
		host.innerHTML = renderToString(page());
		const before = categoryLabels(host).length;
		hydrate(host, page);

		// One chart, not the server's plus a client copy.
		expect(host.querySelectorAll("[data-slot='chart']")).toHaveLength(1);
		expect(categoryLabels(host)).toHaveLength(before);

		const plot = host.querySelector<HTMLElement>("[data-slot='chart-plot']");
		plot?.dispatchEvent(
			new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
		);
		expect(
			host.querySelector("[data-slot='chart-tooltip']")?.textContent,
		).toContain("Day 1");
		expect(
			host.querySelector("[data-slot='chart-marker'] circle"),
		).toBeInstanceOf(SVGElement);

		report(1600);
		expect(categoryLabels(host).length).toBeGreaterThan(before);
		for (const label of host.querySelectorAll("text")) {
			expect(label).toBeInstanceOf(SVGElement);
		}
	});
});
