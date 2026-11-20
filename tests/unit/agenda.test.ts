import { renderToString, resetIds, signal } from "@c9up/aurora";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	Agenda,
	type AgendaChange,
	type AgendaEvent,
	clampEnd,
	clampMove,
	clockOf,
	lanesOf,
	minutesOf,
} from "../../src/organisms/Agenda.js";
import { type Mounted, mount } from "./helpers.js";

describe("agenda time and layout", () => {
	it("reads and writes wall-clock times, refusing what is not one", () => {
		expect([
			minutesOf("00:00"),
			minutesOf("08:30"),
			minutesOf("24:00"),
		]).toEqual([0, 510, 1440]);
		expect([
			minutesOf("8:30"),
			minutesOf("24:01"),
			minutesOf("12:60"),
			minutesOf(""),
		]).toEqual([null, null, null, null]);
		expect([clockOf(0), clockOf(510), clockOf(1439)]).toEqual([
			"00:00",
			"08:30",
			"23:59",
		]);
	});

	it("puts overlapping events side by side, chains included, and lets touching ones share a lane", () => {
		const lanes = lanesOf([
			{ key: "a", start: 480, end: 540 },
			{ key: "b", start: 510, end: 570 },
			{ key: "c", start: 555, end: 600 },
			{ key: "d", start: 600, end: 630 },
		]);
		// a, b and c form one cluster (a-b overlap, b-c overlap): two lanes, c reusing a's.
		expect([lanes.get("a"), lanes.get("b"), lanes.get("c")]).toEqual([
			{ lane: 0, lanes: 2 },
			{ lane: 1, lanes: 2 },
			{ lane: 0, lanes: 2 },
		]);
		// d starts when c ends: a cluster of its own, full width.
		expect(lanes.get("d")).toEqual({ lane: 0, lanes: 1 });
	});

	it("keeps a move and a stretch within the grid", () => {
		expect(clampMove(400, 30, 420, 1200)).toEqual({ start: 420, end: 450 });
		expect(clampMove(1190, 30, 420, 1200)).toEqual({ start: 1170, end: 1200 });
		expect(clampEnd(600, 600, 15, 1200)).toBe(615);
		expect(clampEnd(600, 1300, 15, 1200)).toBe(1200);
	});
});

const columns = [
	{ key: "mon", label: "Monday", date: "2026-11-16" },
	{
		key: "tue",
		label: "Tuesday",
		date: "2026-11-17",
		holiday: true,
		hint: "Holiday",
	},
];

function visit(over: Partial<AgendaEvent> & { key: string }): AgendaEvent {
	return {
		column: "mon",
		start: "08:30",
		end: "09:00",
		title: `Visit ${over.key}`,
		movable: true,
		resizable: true,
		...over,
	};
}

describe("Agenda", () => {
	let mounted: Mounted | undefined;
	afterEach(() => {
		mounted?.dispose();
		mounted = undefined;
		vi.restoreAllMocks();
	});

	const eventEl = (key: string): HTMLElement => {
		const found = [
			...(mounted?.host.querySelectorAll<HTMLElement>(
				'[data-slot="agenda-event"]',
			) ?? []),
		].find((e) => e.dataset.key === key);
		if (found === undefined) throw new Error(`no event ${key}`);
		return found;
	};
	const key = (target: HTMLElement, name: string, shiftKey = false): void => {
		target.dispatchEvent(
			new KeyboardEvent("keydown", { key: name, shiftKey, bubbles: true }),
		);
	};
	const status = (): string =>
		mounted?.host.querySelector('[role="status"]')?.textContent ?? "";
	/** A percentage the CSSOM holds, as a number to two decimals. */
	const pct = (value: string | undefined): number =>
		Math.round(Number.parseFloat(value ?? "") * 100) / 100;
	const flush = (): Promise<void> =>
		new Promise((resolve) => queueMicrotask(resolve));

	it("places events in percentages of the grid, in their column and lane", () => {
		mounted = mount(
			Agenda({
				label: "Week",
				columns,
				hours: [8, 18],
				events: [
					visit({ key: "a", start: "08:00", end: "09:00" }),
					visit({ key: "b", start: "08:30", end: "09:30" }),
					visit({ key: "c", column: "tue", start: "13:00", end: "18:00" }),
				],
			}),
		);
		const a = eventEl("a").style;
		expect([a.top, a.height, a.left, a.width].map(pct)).toEqual([0, 10, 0, 25]);
		const b = eventEl("b").style;
		expect([b.top, b.left, b.width].map(pct)).toEqual([5, 25, 25]);
		const c = eventEl("c").style;
		expect([c.top, c.height, c.left, c.width].map(pct)).toEqual([
			50, 50, 50, 50,
		]);
		expect(eventEl("a").hidden).toBe(false);
		const holiday = mounted.host.querySelector(
			'[data-slot="agenda-column"][data-holiday]',
		);
		expect(holiday?.textContent).toContain("Holiday");
	});

	it("writes no geometry on the server, and hides what it cannot place yet", () => {
		resetIds();
		const markup = renderToString(
			Agenda({ label: "Week", columns, events: [visit({ key: "a" })] }),
		);
		expect(markup).not.toMatch(/style=/);
		expect(markup).toMatch(/data-slot="agenda-event"[^>]*hidden/);
	});

	it("skips events of an unknown column, with times that are not times, or outside the hours", () => {
		mounted = mount(
			Agenda({
				label: "Week",
				columns,
				events: [
					visit({ key: "ok" }),
					visit({ key: "ghost", column: "sun" }),
					visit({ key: "bad", start: "8h" }),
					visit({ key: "late", start: "21:00", end: "22:00" }),
				],
			}),
		);
		const keys = [
			...mounted.host.querySelectorAll<HTMLElement>(
				'[data-slot="agenda-event"]',
			),
		].map((e) => e.dataset.key);
		expect(keys).toEqual(["ok"]);
	});

	it("walks the events with the arrows: within a column, then to the nearest in the next", async () => {
		const activated: string[] = [];
		mounted = mount(
			Agenda({
				label: "Week",
				columns,
				events: [
					visit({ key: "a", start: "08:00", end: "08:30" }),
					visit({ key: "b", start: "10:00", end: "10:30" }),
					visit({ key: "c", column: "tue", start: "09:45", end: "10:15" }),
				],
				onActivate: (e) => activated.push(e.key),
			}),
		);
		expect(eventEl("a").tabIndex).toBe(0);
		expect(eventEl("b").tabIndex).toBe(-1);
		eventEl("a").focus();
		key(eventEl("a"), "ArrowDown");
		await flush();
		expect(document.activeElement).toBe(eventEl("b"));
		key(eventEl("b"), "ArrowRight");
		await flush();
		expect(document.activeElement).toBe(eventEl("c"));
		expect(eventEl("c").tabIndex).toBe(0);
		key(eventEl("c"), "Enter");
		expect(activated).toEqual(["c"]);
	});

	it("picks an event up with Space, moves it by the snap and across columns, and drops it with Enter", () => {
		const moves: AgendaChange[] = [];
		mounted = mount(
			Agenda({
				label: "Week",
				columns,
				events: [visit({ key: "a" })],
				onMove: (c) => moves.push(c),
			}),
		);
		const a = eventEl("a");
		a.focus();
		key(a, " ");
		expect(a.getAttribute("aria-pressed")).toBe("true");
		expect(status()).toContain("Visit a picked up");
		key(a, "ArrowDown");
		key(a, "ArrowDown");
		key(a, "ArrowRight");
		expect(status()).toBe("Visit a: Tuesday, 09:00 to 09:30.");
		expect(pct(a.style.left)).toBe(50);
		key(a, "Enter");
		expect(moves.map((m) => [m.event.key, m.column, m.start, m.end])).toEqual([
			["a", "tue", "09:00", "09:30"],
		]);
		// Controlled: nothing changed the events, so it is drawn where it was.
		expect(pct(a.style.left)).toBe(0);
	});

	it("changes the end with Shift and the arrows, reported as a resize", () => {
		const moves: AgendaChange[] = [];
		const resizes: AgendaChange[] = [];
		mounted = mount(
			Agenda({
				label: "Week",
				columns,
				step: 5,
				events: [visit({ key: "a" })],
				onMove: (c) => moves.push(c),
				onResize: (c) => resizes.push(c),
			}),
		);
		const a = eventEl("a");
		a.focus();
		key(a, " ");
		key(a, "ArrowDown", true);
		key(a, "ArrowDown", true);
		key(a, "Enter");
		expect(moves).toEqual([]);
		expect(resizes.map((m) => [m.start, m.end])).toEqual([["08:30", "09:10"]]);
	});

	it("puts an event back with Escape, telling no one but the reader", () => {
		const onMove = vi.fn();
		mounted = mount(
			Agenda({ label: "Week", columns, events: [visit({ key: "a" })], onMove }),
		);
		const a = eventEl("a");
		a.focus();
		key(a, " ");
		key(a, "ArrowDown");
		key(a, "Escape");
		expect(onMove).not.toHaveBeenCalled();
		expect(status()).toBe("Visit a put back.");
		expect(a.getAttribute("aria-pressed")).toBe(null);
	});

	it("does not pick up an event that may neither move nor stretch: Space opens it", () => {
		const activated: string[] = [];
		mounted = mount(
			Agenda({
				label: "Week",
				columns,
				events: [visit({ key: "a", movable: false, resizable: false })],
				onActivate: (e) => activated.push(e.key),
			}),
		);
		key(eventEl("a"), " ");
		expect(activated).toEqual(["a"]);
	});

	it("follows the events it is given: a move the caller accepts keeps the element and its focus", async () => {
		const events = signal<readonly AgendaEvent[]>([visit({ key: "a" })]);
		mounted = mount(
			Agenda({
				label: "Week",
				columns,
				events,
				onMove: (c) =>
					events([
						{ ...c.event, column: c.column, start: c.start, end: c.end },
					]),
			}),
		);
		const a = eventEl("a");
		a.focus();
		key(a, " ");
		key(a, "ArrowRight");
		key(a, "Enter");
		await flush();
		expect(eventEl("a")).toBe(a);
		expect(document.activeElement).toBe(a);
		expect(pct(a.style.left)).toBe(50);
	});

	describe("with a pointer", () => {
		// Hours 07-20 on a 780-pixel grid, two 100-pixel columns: one pixel a minute.
		const layout = (): void => {
			const area = mounted?.host.querySelector<HTMLElement>(
				'[data-slot="agenda-area"]',
			);
			if (area === null || area === undefined) throw new Error("no area");
			vi.spyOn(area, "getBoundingClientRect").mockReturnValue(
				new DOMRect(0, 0, 200, 780),
			);
		};
		const pointer = (
			target: Element,
			type: string,
			x: number,
			y: number,
		): void => {
			target.dispatchEvent(
				new MouseEvent(type, {
					bubbles: true,
					clientX: x,
					clientY: y,
					button: 0,
				}),
			);
		};

		it("drags an event to another column and time, snapped, keeping where it was taken", () => {
			const moves: AgendaChange[] = [];
			const activate = vi.fn();
			mounted = mount(
				Agenda({
					label: "Week",
					columns,
					events: [visit({ key: "a" })],
					onMove: (c) => moves.push(c),
					onActivate: activate,
				}),
			);
			layout();
			const a = eventEl("a");
			// Taken ten minutes into it (08:40 = 100 px), dropped at 150 px of the second column.
			pointer(a, "pointerdown", 50, 100);
			pointer(a, "pointermove", 150, 160);
			pointer(a, "pointerup", 150, 160);
			pointer(a, "click", 150, 160);
			expect(moves.map((m) => [m.column, m.start, m.end])).toEqual([
				["tue", "09:30", "10:00"],
			]);
			expect(activate).not.toHaveBeenCalled();
		});

		it("stretches an event by its handle", () => {
			const resizes: AgendaChange[] = [];
			mounted = mount(
				Agenda({
					label: "Week",
					columns,
					events: [visit({ key: "a" })],
					onResize: (c) => resizes.push(c),
				}),
			);
			layout();
			const handle = eventEl("a").querySelector('[data-slot="agenda-resize"]');
			if (handle === null) throw new Error("no handle");
			pointer(handle, "pointerdown", 50, 120);
			pointer(handle, "pointermove", 50, 168);
			pointer(handle, "pointerup", 50, 168);
			expect(resizes.map((m) => [m.start, m.end])).toEqual([
				["08:30", "09:45"],
			]);
		});

		it("opens an event clicked without moving, and reports an empty point clicked", () => {
			const activated: string[] = [];
			const slots: string[] = [];
			mounted = mount(
				Agenda({
					label: "Week",
					columns,
					events: [visit({ key: "a" })],
					onActivate: (e) => activated.push(e.key),
					onSlotActivate: (s) => slots.push(`${s.column} ${s.start}`),
				}),
			);
			layout();
			const a = eventEl("a");
			pointer(a, "pointerdown", 50, 95);
			pointer(a, "pointerup", 50, 95);
			pointer(a, "click", 50, 95);
			const area = mounted.host.querySelector('[data-slot="agenda-area"]');
			if (area === null) throw new Error("no area");
			pointer(area, "click", 120, 247);
			expect(activated).toEqual(["a"]);
			expect(slots).toEqual(["tue 11:00"]);
		});
	});

	it("scrolls on its own by default, and not at all with an empty body class, its headers sticky", () => {
		mounted = mount(Agenda({ label: "Week", columns, events: [] }));
		const body = () =>
			mounted?.host.querySelector('[data-slot="agenda-body"]')?.className ?? "";
		expect(body()).toContain("overflow-y-auto");
		mounted.dispose();
		mounted = mount(
			Agenda({ label: "Week", columns, events: [], bodyClass: "" }),
		);
		expect(body()).not.toContain("overflow");
		expect(
			mounted.host.querySelector('[data-slot="agenda-header"]')?.className,
		).toContain("sticky");
		expect(
			mounted.host.querySelector('[data-slot="agenda"]')?.className,
		).toContain("overflow-clip");
	});

	it("draws the now line in today's column only", () => {
		const now = (): Date => new Date(2026, 10, 17, 10, 0);
		mounted = mount(Agenda({ label: "Week", columns, now, events: [] }));
		const line = mounted.host.querySelector<HTMLElement>(
			'[data-slot="agenda-now"]',
		);
		expect(pct(line?.style.left)).toBe(50);
		expect(pct(line?.style.top)).toBe(23.08);
		// A point has no height of its own: its class draws it, an inline 0% would hide it.
		expect(line?.style.height).toBe("");
	});
});
