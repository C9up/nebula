/**
 * Agenda — a time grid of columns, with ranges behind and events on top.
 *
 * shadcn has no agenda; the usual React ones (FullCalendar, react-big-calendar)
 * are whole libraries. This one keeps to what a booking screen needs: a day,
 * a week, or several people side by side, with events that move and stretch
 * by pointer and by keyboard alike.
 *
 * **Columns are the caller's.** A column is a key and a label: a day of the
 * week, a practitioner on one day, a room. The agenda does not know whether it
 * shows a week or a team, so the same component is the week of one person,
 * the day of five, or five days of two. A column that carries a `date` gets
 * the today mark and the now line.
 *
 * **Times are wall-clock text.** `"08:30"`, never a `Date`: a slot at half past
 * eight is half past eight wherever the page is rendered, and a server in UTC
 * hydrating for a browser in Zurich must draw the same grid. Dates, when a
 * column has one, are `YYYY-MM-DD`.
 *
 * **Controlled.** Moving or stretching an event calls `onMove` or `onResize`
 * with where it was dropped; the agenda never moves it itself. The caller
 * updates `events` (at once, or once the server agrees) or does not, and the
 * event goes back. A refused move therefore needs no undo.
 *
 * **Geometry.** The hour rows are real elements of a fixed height class, so the
 * grid has its size in the server's markup. Ranges and events are placed in
 * percentages of the grid through the CSSOM (`.style`), which a strict
 * Content-Security-Policy does not govern; the server cannot write them, so
 * they stay hidden until the agenda is mounted rather than drawn in the wrong
 * place.
 *
 * **Keyboard.** One event is tabbable. The arrows walk the events — up and
 * down within a column, left and right to the nearest one in the next column
 * — Enter activates one, Space picks it up. Picked up, the arrows move it by
 * the snap and across columns, Shift with Up or Down changes its end, Enter or
 * Space drops it, Escape puts it back. Every step is announced.
 */

import {
	component,
	each,
	html,
	onMount,
	onUnmount,
	type ReadSignal,
	signal,
} from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";

/** A column of the grid: a day, a person on a day, a room. */
export interface AgendaColumn {
	key: string;
	label: string;
	/** A second line under the label: who is away, how full the day is. */
	hint?: string;
	/** The calendar day it shows, `YYYY-MM-DD`: marks today and draws the now line. */
	date?: string;
	/** A public holiday: the header is marked. */
	holiday?: boolean;
}

/**
 * What a colour says. One meaning each, never decoration: an app maps its own
 * states (free, booked, arrived, cancelled) onto these.
 */
export type AgendaTone =
	| "default"
	| "primary"
	| "success"
	| "warning"
	| "danger"
	| "muted";

/** A span drawn behind the events: a consultation block, an absence. */
export interface AgendaRange {
	key: string;
	column: string;
	/** `HH:mm`. */
	start: string;
	/** `HH:mm`, after `start`. */
	end: string;
	label?: string;
	tone?: AgendaTone;
	/** Hatched: time that is not available (an absence, a closed block). */
	hatched?: boolean;
}

/** An event: an appointment, a free slot offered for booking. */
export interface AgendaEvent {
	key: string;
	column: string;
	/** `HH:mm`. */
	start: string;
	/** `HH:mm`, after `start`. */
	end: string;
	title: string;
	detail?: string;
	tone?: AgendaTone;
	/** Any CSS colour for the left edge: a category's own colour. */
	accent?: string;
	/** Drawn struck through: cancelled. */
	struck?: boolean;
	/** May be dragged to another time or column. */
	movable?: boolean;
	/** May have its end dragged. */
	resizable?: boolean;
}

/** Where an event was dropped. */
export interface AgendaChange {
	event: AgendaEvent;
	column: string;
	start: string;
	end: string;
}

/** A free point of the grid, clicked. */
export interface AgendaSlot {
	column: string;
	start: string;
}

/**
 * The words the agenda writes itself. `{title}`, `{column}`, `{start}` and
 * `{end}` are replaced where they appear.
 */
export interface AgendaLabels {
	/** How a screen reader is told to use an event. */
	keyboardHint: string;
	/** Announced when an event is picked up. */
	grabbed: string;
	/** Announced at each step while it is held, and when it is dropped. */
	moved: string;
	/** Announced when Escape puts it back. */
	cancelled: string;
	/** The now line. */
	now: string;
	/** The handle that stretches an event. */
	resize: string;
}

const DEFAULT_LABELS: AgendaLabels = {
	keyboardHint:
		"Arrow keys go from event to event. Enter opens one, Space picks it up.",
	grabbed:
		"{title} picked up. Arrow keys move it, Shift with Up or Down changes its end, Enter drops it, Escape puts it back.",
	moved: "{title}: {column}, {start} to {end}.",
	cancelled: "{title} put back.",
	now: "Now",
	resize: "Change the end of {title}",
};

export interface AgendaProps {
	/** The grid's accessible name. */
	label: string;
	columns: Reactive<readonly AgendaColumn[]>;
	events: Reactive<readonly AgendaEvent[]>;
	ranges?: Reactive<readonly AgendaRange[]>;
	/** First and last hour shown, `[7, 20]` by default: 07:00 to 20:00. */
	hours?: readonly [number, number];
	/** Minutes between two grid lines. Default `15`. */
	step?: number;
	/** Minutes an event moves by. Default: `step`. */
	snap?: number;
	/** Height of an hour. Default `"md"`. */
	size?: "sm" | "md" | "lg";
	/** BCP 47 locale for the hours. Default: the runtime's own. */
	locale?: string;
	labels?: Partial<AgendaLabels>;
	/** The time it is: a clock for the now line, injectable for tests. */
	now?: () => Date;
	/** `HH:mm` scrolled to when mounted. Default: the first range or event. */
	scrollTo?: string;
	class?: Reactive<string>;
	/** Classes of the scrolling body: its height. Default `"max-h-[40rem]"`. */
	bodyClass?: string;
	/** An event chosen: clicked, or Enter. */
	onActivate?: (event: AgendaEvent) => void;
	/** A range's label chosen. Without it, ranges are not interactive. */
	onRangeActivate?: (range: AgendaRange) => void;
	/** An empty point of the grid clicked. */
	onSlotActivate?: (slot: AgendaSlot) => void;
	/** An event dropped at another time or in another column (its end follows). */
	onMove?: (change: AgendaChange) => void;
	/** An event's end dragged, its start and column unchanged. */
	onResize?: (change: AgendaChange) => void;
	/** The content of an event, instead of its times, title and detail. */
	renderEvent?: (event: ReadSignal<AgendaEvent>) => Child;
}

// ─── time and layout (pure) ──────────────────────────────────────────

const CLOCK = /^([01]\d|2[0-4]):([0-5]\d)$/;

/** Minutes since midnight of `HH:mm`, or `null` when it is not one. */
export function minutesOf(clock: string): number | null {
	const match = CLOCK.exec(clock);
	if (match === null) return null;
	const minutes = Number(match[1]) * 60 + Number(match[2]);
	return minutes > 24 * 60 ? null : minutes;
}

/** `HH:mm` of minutes since midnight. */
export function clockOf(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** `YYYY-MM-DD` of a date, on its own wall clock. */
export function isoDay(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** An event's place among those it overlaps: its lane, of how many. */
export interface Lane {
	lane: number;
	lanes: number;
}

/**
 * Side-by-side lanes for the events of one column.
 *
 * Events that overlap, directly or through a chain, form a cluster; each takes
 * the first lane free at its start, and every event of the cluster is drawn
 * at the width of the cluster's lane count. Touching is not overlapping: an
 * event ending at 09:00 and one starting at 09:00 share a lane.
 */
export function lanesOf(
	events: readonly { key: string; start: number; end: number }[],
): Map<string, Lane> {
	const sorted = [...events].sort(
		(a, b) => a.start - b.start || b.end - a.end || a.key.localeCompare(b.key),
	);
	const result = new Map<string, Lane>();
	let cluster: { key: string; lane: number }[] = [];
	let laneEnds: number[] = [];
	let clusterEnd = Number.NEGATIVE_INFINITY;
	const close = (): void => {
		for (const member of cluster) {
			result.set(member.key, { lane: member.lane, lanes: laneEnds.length });
		}
		cluster = [];
		laneEnds = [];
	};
	for (const event of sorted) {
		if (event.start >= clusterEnd) close();
		let lane = laneEnds.findIndex((end) => end <= event.start);
		if (lane === -1) {
			lane = laneEnds.length;
			laneEnds.push(event.end);
		} else {
			laneEnds[lane] = event.end;
		}
		cluster.push({ key: event.key, lane });
		clusterEnd = Math.max(clusterEnd, event.end);
	}
	close();
	return result;
}

/** `value` down to a multiple of `snap`. */
export function snapDown(value: number, snap: number): number {
	return Math.floor(value / snap) * snap;
}

/** `value` to the nearest multiple of `snap`. */
export function snapNearest(value: number, snap: number): number {
	return Math.round(value / snap) * snap;
}

/**
 * A move kept within the grid: the start between the first hour and the
 * last minus the duration, the duration unchanged.
 */
export function clampMove(
	start: number,
	duration: number,
	from: number,
	to: number,
): { start: number; end: number } {
	const kept = Math.min(Math.max(start, from), Math.max(from, to - duration));
	return { start: kept, end: kept + duration };
}

/** A new end kept after the start by one snap at least, and within the grid. */
export function clampEnd(
	start: number,
	end: number,
	snap: number,
	to: number,
): number {
	return Math.min(Math.max(end, start + snap), to);
}

/** Replace `{name}` placeholders. */
function fill(
	template: string,
	values: Readonly<Record<string, string>>,
): string {
	return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
		Object.hasOwn(values, name) ? (values[name] ?? whole) : whole,
	);
}

const HOUR_HEIGHT: Record<"sm" | "md" | "lg", string> = {
	sm: "h-12",
	md: "h-20",
	lg: "h-32",
};

const EVENT_TONES: Record<AgendaTone, string> = {
	default: "bg-card text-card-foreground border-border",
	primary: "bg-primary/15 text-foreground border-primary",
	success:
		"bg-emerald-500/15 text-foreground border-emerald-600 dark:border-emerald-400",
	warning:
		"bg-amber-500/15 text-foreground border-amber-600 dark:border-amber-400",
	danger: "bg-destructive/15 text-foreground border-destructive",
	muted: "bg-muted text-muted-foreground border-muted-foreground/40",
};

const RANGE_TONES: Record<AgendaTone, string> = {
	default: "bg-accent/40",
	primary: "bg-primary/10",
	success: "bg-emerald-500/10",
	warning: "bg-amber-500/10",
	danger: "bg-destructive/10",
	muted: "bg-muted/60",
};

const HATCHED =
	"bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--color-border)_6px_8px)]";

/** Where an event is drawn while it is held, before the caller is told. */
interface Draft {
	key: string;
	column: string;
	start: number;
	end: number;
}

// ─── component ───────────────────────────────────────────────────────

export const Agenda = component<AgendaProps>((props) => {
	const labels: AgendaLabels = { ...DEFAULT_LABELS, ...props.labels };
	const [firstHour, lastHour] = props.hours ?? [7, 20];
	const from = firstHour * 60;
	const to = lastHour * 60;
	const span = Math.max(60, to - from);
	const step = props.step ?? 15;
	const snap = props.snap ?? step;
	const clock = props.now ?? (() => new Date());

	const areaId = uid("agenda-area");
	const hintId = uid("agenda-hint");
	const bodyId = uid("agenda-body");

	const columns = (): readonly AgendaColumn[] => read(props.columns);
	const events = (): readonly AgendaEvent[] => read(props.events);
	const ranges = (): readonly AgendaRange[] => read(props.ranges) ?? [];

	/** Placed once mounted: before that, ranges and events have no geometry. */
	const placed = signal(false);
	/** The event the keyboard is on; the only tabbable one. */
	const cursor = signal<string | null>(null);
	/** The event being held, by keyboard or pointer, and where it is drawn. */
	const draft = signal<Draft | null>(null);
	/** Held by the keyboard (as opposed to the pointer). */
	const grabbed = signal(false);
	const announcement = signal("");
	const nowTick = signal(clock());

	const hourFormat = new Intl.DateTimeFormat(props.locale, {
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "UTC",
	});
	const hourLabel = (minutes: number): string =>
		hourFormat.format(new Date(Date.UTC(2000, 0, 1, 0, minutes)));

	const columnIndex = (key: string): number =>
		columns().findIndex((c) => c.key === key);
	const columnLabel = (key: string): string =>
		columns().find((c) => c.key === key)?.label ?? key;

	/** The events that can be drawn: in a known column, with valid times. */
	const drawable = (): { event: AgendaEvent; start: number; end: number }[] =>
		events().flatMap((event) => {
			const start = minutesOf(event.start);
			const end = minutesOf(event.end);
			if (start === null || end === null || end <= start) return [];
			if (columnIndex(event.column) === -1) return [];
			if (end <= from || start >= to) return [];
			return [{ event, start, end }];
		});

	/** Lanes per event, each column apart. */
	const lanes = (): Map<string, Lane> => {
		const all = new Map<string, Lane>();
		const byColumn = new Map<
			string,
			{ key: string; start: number; end: number }[]
		>();
		for (const { event, start, end } of drawable()) {
			const list = byColumn.get(event.column) ?? [];
			list.push({ key: event.key, start, end });
			byColumn.set(event.column, list);
		}
		for (const list of byColumn.values()) {
			for (const [key, lane] of lanesOf(list)) all.set(key, lane);
		}
		return all;
	};

	const percent = (value: number): string => `${(value * 100).toFixed(4)}%`;

	/** The CSS placing a span of `column` from `start` to `end`, in a lane. */
	function geometry(
		column: string,
		start: number,
		end: number,
		lane: Lane = { lane: 0, lanes: 1 },
	): string {
		const count = Math.max(1, columns().length);
		const index = Math.max(0, columnIndex(column));
		const top = (Math.max(start, from) - from) / span;
		const height = (Math.min(end, to) - Math.max(start, from)) / span;
		const left = (index + lane.lane / lane.lanes) / count;
		const width = 1 / count / lane.lanes;
		// A point in time (the now line) has no height of its own: its class gives it one.
		const tall = end > start ? `height:${percent(height)};` : "";
		return `top:${percent(top)};${tall}left:${percent(left)};width:${percent(width)}`;
	}

	function say(
		template: string,
		values: Readonly<Record<string, string>>,
	): void {
		announcement(fill(template, values));
	}

	const current = (key: string): AgendaEvent | undefined =>
		events().find((e) => e.key === key);

	// ─── holding an event ────────────────────────────────────────────

	function pickUp(event: AgendaEvent): boolean {
		const start = minutesOf(event.start);
		const end = minutesOf(event.end);
		if (start === null || end === null) return false;
		draft({ key: event.key, column: event.column, start, end });
		return true;
	}

	function drop(): void {
		const held = draft();
		draft(null);
		grabbed(false);
		if (held === null) return;
		const event = current(held.key);
		if (event === undefined) return;
		const change: AgendaChange = {
			event,
			column: held.column,
			start: clockOf(held.start),
			end: clockOf(held.end),
		};
		const moved =
			change.column !== event.column || change.start !== event.start;
		const stretched = change.end !== event.end;
		say(labels.moved, {
			title: event.title,
			column: columnLabel(change.column),
			start: change.start,
			end: change.end,
		});
		if (moved) props.onMove?.(change);
		else if (stretched) props.onResize?.(change);
	}

	function putBack(): void {
		const held = draft();
		draft(null);
		grabbed(false);
		const event = held === null ? undefined : current(held.key);
		if (event !== undefined) say(labels.cancelled, { title: event.title });
	}

	function announceDraft(): void {
		const held = draft();
		const event = held === null ? undefined : current(held.key);
		if (held === null || event === undefined) return;
		say(labels.moved, {
			title: event.title,
			column: columnLabel(held.column),
			start: clockOf(held.start),
			end: clockOf(held.end),
		});
	}

	// ─── keyboard ────────────────────────────────────────────────────

	function focusEvent(key: string): void {
		cursor(key);
		queueMicrotask(() => {
			const area = document.getElementById(areaId);
			const target = [
				...(area?.querySelectorAll<HTMLElement>('[data-slot="agenda-event"]') ??
					[]),
			].find((element) => element.dataset.key === key);
			target?.focus();
		});
	}

	/** The event the arrows lead to from `event`, or `undefined`. */
	function neighbour(event: AgendaEvent, key: string): AgendaEvent | undefined {
		const all = drawable();
		const startOf = (e: AgendaEvent): number => minutesOf(e.start) ?? 0;
		const inColumn = (column: string): AgendaEvent[] =>
			all
				.filter((d) => d.event.column === column)
				.map((d) => d.event)
				.sort((a, b) => startOf(a) - startOf(b) || a.key.localeCompare(b.key));
		const ordered = columns().flatMap((c) => inColumn(c.key));
		if (key === "Home") return ordered[0];
		if (key === "End") return ordered[ordered.length - 1];
		if (key === "ArrowUp" || key === "ArrowDown") {
			const list = inColumn(event.column);
			const at = list.findIndex((e) => e.key === event.key);
			return list[at + (key === "ArrowUp" ? -1 : 1)];
		}
		const direction = key === "ArrowLeft" ? -1 : 1;
		const cols = columns();
		for (
			let index = columnIndex(event.column) + direction;
			index >= 0 && index < cols.length;
			index += direction
		) {
			const column = cols[index];
			if (column === undefined) break;
			const list = inColumn(column.key);
			if (list.length === 0) continue;
			const target = startOf(event);
			return list.reduce((best, e) =>
				Math.abs(startOf(e) - target) < Math.abs(startOf(best) - target)
					? e
					: best,
			);
		}
		return undefined;
	}

	function onEventKeyDown(event: AgendaEvent, e: KeyboardEvent): void {
		const held = draft();
		if (grabbed() && held !== null) {
			heldKeyDown(event, held, e);
			return;
		}
		if (e.key === "Enter") {
			e.preventDefault();
			props.onActivate?.(event);
			return;
		}
		if (e.key === " ") {
			e.preventDefault();
			if (
				(event.movable === true || event.resizable === true) &&
				pickUp(event)
			) {
				grabbed(true);
				say(labels.grabbed, { title: event.title });
			} else {
				props.onActivate?.(event);
			}
			return;
		}
		if (
			[
				"ArrowUp",
				"ArrowDown",
				"ArrowLeft",
				"ArrowRight",
				"Home",
				"End",
			].includes(e.key)
		) {
			e.preventDefault();
			const next = neighbour(event, e.key);
			if (next !== undefined) focusEvent(next.key);
		}
	}

	function heldKeyDown(
		event: AgendaEvent,
		held: Draft,
		e: KeyboardEvent,
	): void {
		const duration = held.end - held.start;
		const cols = columns();
		let next: Draft | null = null;
		if (e.key === "Escape") {
			e.preventDefault();
			putBack();
			return;
		}
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			drop();
			return;
		}
		if ((e.key === "ArrowUp" || e.key === "ArrowDown") && e.shiftKey) {
			if (event.resizable !== true) return;
			const end = clampEnd(
				held.start,
				held.end + (e.key === "ArrowUp" ? -snap : snap),
				snap,
				to,
			);
			next = { ...held, end };
		} else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
			if (event.movable !== true) return;
			const moved = clampMove(
				held.start + (e.key === "ArrowUp" ? -snap : snap),
				duration,
				from,
				to,
			);
			next = { ...held, ...moved };
		} else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
			if (event.movable !== true) return;
			const index = columnIndex(held.column) + (e.key === "ArrowLeft" ? -1 : 1);
			const column = cols[index];
			if (column === undefined) return;
			next = { ...held, column: column.key };
		} else if (e.key === "Tab") {
			putBack();
			return;
		}
		if (next === null) return;
		e.preventDefault();
		draft(next);
		announceDraft();
	}

	// ─── pointer ─────────────────────────────────────────────────────

	/** The column and minute under a point of the area, unsnapped. */
	function pointAt(
		x: number,
		y: number,
	): { column: string; minutes: number } | null {
		const area = document.getElementById(areaId);
		const cols = columns();
		if (area === null || cols.length === 0) return null;
		const rect = area.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return null;
		const index = Math.min(
			cols.length - 1,
			Math.max(0, Math.floor(((x - rect.left) / rect.width) * cols.length)),
		);
		const column = cols[index];
		if (column === undefined) return null;
		return {
			column: column.key,
			minutes: from + ((y - rect.top) / rect.height) * span,
		};
	}

	/** A pointer gesture in progress. */
	let gesture: {
		key: string;
		mode: "move" | "resize";
		pointerX: number;
		pointerY: number;
		/** Minutes between the event's start and the point it was taken by. */
		offset: number;
		started: boolean;
	} | null = null;
	/** A drag ends in a click on the same element: that click is not an activation. */
	let swallowClick = false;

	function onPointerDown(
		event: AgendaEvent,
		mode: "move" | "resize",
		e: PointerEvent,
	): void {
		if (e.button !== 0) return;
		if (mode === "move" && event.movable !== true) return;
		if (mode === "resize" && event.resizable !== true) return;
		const point = pointAt(e.clientX, e.clientY);
		const start = minutesOf(event.start);
		if (point === null || start === null) return;
		if (mode === "resize") e.stopPropagation();
		gesture = {
			key: event.key,
			mode,
			pointerX: e.clientX,
			pointerY: e.clientY,
			offset: point.minutes - start,
			started: false,
		};
		const target = e.currentTarget;
		if (target instanceof Element) target.setPointerCapture?.(e.pointerId);
	}

	function onPointerMove(e: PointerEvent): void {
		if (gesture === null) return;
		if (!gesture.started) {
			const distance = Math.hypot(
				e.clientX - gesture.pointerX,
				e.clientY - gesture.pointerY,
			);
			if (distance < 4) return;
			const event = current(gesture.key);
			if (event === undefined || !pickUp(event)) {
				gesture = null;
				return;
			}
			gesture.started = true;
		}
		const held = draft();
		const point = pointAt(e.clientX, e.clientY);
		if (held === null || point === null) return;
		if (gesture.mode === "resize") {
			draft({
				...held,
				end: clampEnd(held.start, snapNearest(point.minutes, snap), snap, to),
			});
			return;
		}
		const moved = clampMove(
			snapNearest(point.minutes - gesture.offset, snap),
			held.end - held.start,
			from,
			to,
		);
		draft({ ...held, column: point.column, ...moved });
	}

	function onPointerUp(): void {
		if (gesture === null) return;
		const started = gesture.started;
		gesture = null;
		if (!started) return;
		// The click that follows this release, if it lands, is the drag's own.
		swallowClick = true;
		setTimeout(() => {
			swallowClick = false;
		}, 0);
		drop();
	}

	function onPointerCancel(): void {
		if (gesture === null) return;
		const started = gesture.started;
		gesture = null;
		if (started) putBack();
	}

	function onAreaKeyDown(e: KeyboardEvent): void {
		if (e.key === "Escape" && gesture !== null) {
			gesture = null;
			putBack();
		}
	}

	function onAreaClick(e: MouseEvent): void {
		if (props.onSlotActivate === undefined) return;
		const target = e.target;
		if (
			target instanceof Element &&
			target.closest(
				"[data-slot='agenda-event'],[data-slot='agenda-range-label']",
			) !== null
		)
			return;
		const point = pointAt(e.clientX, e.clientY);
		if (point === null) return;
		const start = snapDown(point.minutes, snap);
		if (start < from || start >= to) return;
		props.onSlotActivate({ column: point.column, start: clockOf(start) });
	}

	function onEventClick(event: AgendaEvent): void {
		if (swallowClick) {
			swallowClick = false;
			return;
		}
		cursor(event.key);
		props.onActivate?.(event);
	}

	// ─── mount ───────────────────────────────────────────────────────

	let timer: ReturnType<typeof setInterval> | undefined;
	onMount(() => {
		placed(true);
		timer = setInterval(() => nowTick(clock()), 60_000);
		const body = document.getElementById(bodyId);
		const first = [
			...ranges().map((r) => minutesOf(r.start)),
			...events().map((e) => minutesOf(e.start)),
		].filter((m): m is number => m !== null && m >= from && m < to);
		const target =
			props.scrollTo === undefined
				? first.length === 0
					? null
					: Math.min(...first)
				: minutesOf(props.scrollTo);
		if (body !== null && target !== null) {
			const area = document.getElementById(areaId);
			const height = area?.getBoundingClientRect().height ?? 0;
			body.scrollTop = Math.max(0, ((target - from) / span) * height - 16);
		}
	});
	onUnmount(() => {
		if (timer !== undefined) clearInterval(timer);
	});

	// ─── rendering ───────────────────────────────────────────────────

	const hours = Array.from(
		{ length: Math.ceil(span / 60) },
		(_unused, index) => from + index * 60,
	);
	const lines = Math.max(1, Math.round(60 / step));
	const rowHeight = HOUR_HEIGHT[props.size ?? "md"];

	/** The tabbable event: the cursor, else the first drawn. */
	const tabbable = (): string | null => {
		const all = drawable();
		const at = cursor();
		if (at !== null && all.some((d) => d.event.key === at)) return at;
		return all[0]?.event.key ?? null;
	};

	const today = (): string => isoDay(nowTick());

	function nowLine(): Child {
		const at = nowTick();
		const minutes = at.getHours() * 60 + at.getMinutes();
		const column = columns().find((c) => c.date === today());
		if (column === undefined || minutes < from || minutes >= to || !placed())
			return null;
		return html`<div
			data-slot="agenda-now"
			aria-hidden="true"
			title="${labels.now}"
			class="bg-destructive pointer-events-none absolute z-20 h-0.5"
			.style="${geometry(column.key, minutes, minutes)}"
		></div>`;
	}

	function renderRange(range: ReadSignal<AgendaRange>): Child {
		const style = (): string => {
			const r = range();
			const start = minutesOf(r.start) ?? from;
			const end = minutesOf(r.end) ?? start;
			return geometry(r.column, start, end);
		};
		const visible = (): boolean => {
			const r = range();
			const start = minutesOf(r.start);
			const end = minutesOf(r.end);
			return (
				placed() &&
				start !== null &&
				end !== null &&
				end > start &&
				columnIndex(r.column) !== -1 &&
				end > from &&
				start < to
			);
		};
		const label = (): Child => {
			const r = range();
			if (r.label === undefined) return null;
			if (props.onRangeActivate === undefined) {
				return html`<span class="text-muted-foreground block truncate px-1 pt-0.5 text-[0.7rem]">${r.label}</span>`;
			}
			return html`<button
				type="button"
				data-slot="agenda-range-label"
				class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 pointer-events-auto block max-w-full truncate rounded px-1 pt-0.5 text-left text-[0.7rem] outline-none focus-visible:ring-[3px]"
				@click="${() => props.onRangeActivate?.(range())}"
			>${r.label}</button>`;
		};
		return html`<div
			data-slot="agenda-range"
			data-key="${() => range().key}"
			?hidden="${() => !visible()}"
			class="${() => cn("pointer-events-none absolute z-0 border-l-2 border-transparent", RANGE_TONES[range().tone ?? "default"], range().hatched === true ? HATCHED : "")}"
			.style="${style}"
		>${label}</div>`;
	}

	function renderEvent(event: ReadSignal<AgendaEvent>): Child {
		const held = (): Draft | null => {
			const d = draft();
			return d !== null && d.key === event().key ? d : null;
		};
		const style = (): string => {
			const e = event();
			const d = held();
			const lane = d === null ? lanes().get(e.key) : undefined;
			const start = d?.start ?? minutesOf(e.start) ?? from;
			const end = d?.end ?? minutesOf(e.end) ?? start;
			const accent =
				e.accent === undefined ? "" : `;border-left-color:${e.accent}`;
			return `${geometry(d?.column ?? e.column, start, end, lane)}${accent}`;
		};
		const times = (): string => {
			const d = held();
			const e = event();
			return d === null
				? `${e.start}–${e.end}`
				: `${clockOf(d.start)}–${clockOf(d.end)}`;
		};
		const name = (): string => {
			const e = event();
			return [e.title, e.detail, columnLabel(e.column), `${e.start}–${e.end}`]
				.filter((part) => part !== undefined && part !== "")
				.join(", ");
		};
		const content = (): Child =>
			props.renderEvent === undefined
				? html`<span class="block truncate text-[0.7rem] tabular-nums opacity-80">${times}</span>
					<span class="${() => cn("block truncate font-medium", event().struck === true ? "line-through" : "")}">${() => event().title}</span>
					${() => (event().detail === undefined ? null : html`<span class="text-muted-foreground block truncate">${() => event().detail}</span>`)}`
				: props.renderEvent(event);
		return html`<div
			data-slot="agenda-event"
			data-key="${() => event().key}"
			data-tone="${() => event().tone ?? "default"}"
			data-held="${() => (held() === null ? undefined : "")}"
			role="button"
			aria-label="${name}"
			aria-describedby="${hintId}"
			aria-pressed="${() => (held() !== null && grabbed() ? "true" : undefined)}"
			tabindex="${() => (tabbable() === event().key ? 0 : -1)}"
			?hidden="${() => !placed()}"
			class="${() =>
				cn(
					"group absolute z-10 cursor-default overflow-hidden rounded-md border border-l-4 px-1.5 py-0.5 text-xs leading-tight shadow-xs outline-none select-none",
					"focus-visible:ring-ring/50 focus-visible:z-30 focus-visible:ring-[3px]",
					EVENT_TONES[event().tone ?? "default"],
					event().movable === true ? "cursor-grab touch-none" : "",
					held() === null
						? ""
						: "z-30 cursor-grabbing opacity-90 shadow-lg ring-2 ring-primary",
				)}"
			.style="${style}"
			@click="${() => onEventClick(event())}"
			@focus="${() => cursor(event().key)}"
			@blur="${() => {
				if (grabbed() && held() !== null) putBack();
			}}"
			@keydown="${(e: KeyboardEvent) => onEventKeyDown(event(), e)}"
			@pointerdown="${(e: PointerEvent) => onPointerDown(event(), "move", e)}"
		>${content}${() =>
			event().resizable === true
				? html`<span
						data-slot="agenda-resize"
						aria-hidden="true"
						title="${() => fill(labels.resize, { title: event().title })}"
						class="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize touch-none opacity-0 group-hover:opacity-100 bg-foreground/20"
						@pointerdown="${(e: PointerEvent) => onPointerDown(event(), "resize", e)}"
					></span>`
				: null}</div>`;
	}

	function renderHeader(column: ReadSignal<AgendaColumn>): Child {
		const isToday = (): boolean =>
			column().date !== undefined && column().date === today();
		return html`<div
			data-slot="agenda-column"
			data-key="${() => column().key}"
			data-today="${() => (isToday() ? "" : undefined)}"
			data-holiday="${() => (column().holiday === true ? "" : undefined)}"
			class="${() =>
				cn(
					"min-w-0 flex-1 border-l px-2 py-1.5 text-center",
					column().holiday === true ? "bg-amber-500/10" : "",
				)}"
		>
			<span class="${() => cn("block truncate text-sm font-medium", isToday() ? "text-primary" : "")}">${() => column().label}</span>
			${() => (column().hint === undefined ? null : html`<span class="text-muted-foreground block truncate text-xs">${() => column().hint}</span>`)}
		</div>`;
	}

	function renderColumnLines(column: ReadSignal<AgendaColumn>): Child {
		return html`<div
			data-key="${() => column().key}"
			class="${() => cn("min-w-0 flex-1 border-l", column().holiday === true ? "bg-amber-500/5" : "")}"
		>${hours.map(
			() =>
				html`<div class="${cn("flex flex-col border-b", rowHeight)}">${Array.from(
					{ length: lines },
					(_unused, index) =>
						html`<div class="${cn("flex-1", index < lines - 1 ? "border-border/50 border-b border-dashed" : "")}"></div>`,
				)}</div>`,
		)}</div>`;
	}

	return html`<div
		data-slot="agenda"
		role="group"
		aria-label="${props.label}"
		class="${() => cn("bg-background flex min-w-0 flex-col overflow-hidden rounded-lg border", read(props.class))}"
	>
		<span id="${hintId}" hidden>${labels.keyboardHint}</span>
		<div role="status" aria-live="polite" class="sr-only">${() => announcement()}</div>
		<div class="bg-muted/30 flex border-b">
			<div class="w-14 shrink-0"></div>
			${each(columns, (c) => c.key, renderHeader)}
		</div>
		<div id="${bodyId}" data-slot="agenda-body" class="${cn("overflow-y-auto", props.bodyClass ?? "max-h-[40rem]")}">
			<div class="flex">
				<div aria-hidden="true" class="w-14 shrink-0">${hours.map(
					(hour) =>
						html`<div class="${cn("text-muted-foreground -mt-2 pr-2 text-right text-[0.7rem] tabular-nums first:mt-0", rowHeight)}">${hourLabel(hour)}</div>`,
				)}</div>
				<div
					id="${areaId}"
					data-slot="agenda-area"
					class="relative flex min-w-0 flex-1"
					@click="${onAreaClick}"
					@keydown="${onAreaKeyDown}"
					@pointermove="${onPointerMove}"
					@pointerup="${onPointerUp}"
					@pointercancel="${onPointerCancel}"
				>
					${each(columns, (c) => c.key, renderColumnLines)}
					<div class="pointer-events-none absolute inset-0">${each(ranges, (r) => r.key, renderRange)}</div>
					<div class="absolute inset-0 pointer-events-none [&>*]:pointer-events-auto">${each(drawableEvents, (e) => e.key, renderEvent)}</div>
					${nowLine}
				</div>
			</div>
		</div>
	</div>`;

	function drawableEvents(): readonly AgendaEvent[] {
		return drawable().map((d) => d.event);
	}
});
