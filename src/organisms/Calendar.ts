/**
 * Calendar — a month grid for picking a date.
 *
 * shadcn wraps `react-day-picker`, which brings `date-fns` with it. nebula
 * uses `Date` and `Intl`, which cover everything this needs: month lengths and
 * leap years come from `Date`, and weekday and month names come from
 * `Intl.DateTimeFormat` in the user's locale for free — which is more than a
 * hardcoded English array would give.
 *
 * Dates are handled at local midnight throughout. A calendar cell means "this
 * day", not "this instant", and mixing the two is how a date picker ends up
 * off by one for users west of UTC: `new Date("2026-03-14")` parses as UTC
 * midnight, which is the 13th in New York.
 *
 * The keyboard model is the WAI-ARIA grid pattern, and it is what makes the
 * control usable at all without a pointer: arrows move a day, PageUp/PageDown
 * move a month, Home and End jump to the ends of the week. Only one cell is
 * ever tabbable — the focused day — so Tab leaves the grid instead of walking
 * through thirty-one buttons.
 */

import { component, html, signal } from "@c9up/aurora";
import { buttonVariants } from "../atoms/Button.js";
import type { Child } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { ChevronLeftIcon, ChevronRightIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";

/**
 * A span of days. `to` is absent while the second end is still being picked —
 * that half-open state is what the hover preview renders against, so it is
 * part of the type rather than something the component hides internally.
 */
export interface DateRange {
	readonly from: Date;
	readonly to?: Date;
}

export interface CalendarProps {
	/**
	 * `"range"` picks a span in two clicks. Default `"single"`.
	 *
	 * The two modes carry their value in separate props rather than one union.
	 * A union would make every read of `value` a narrowing exercise for the
	 * caller as much as for this file, and the two `onChange` shapes genuinely
	 * differ — a range handler that receives a bare `Date` has no way to say
	 * which end moved.
	 */
	mode?: "single" | "range";
	/** Selected day, in `"single"` mode. Local midnight. */
	value?: Reactive<Date | undefined>;
	defaultValue?: Date;
	/** Selected span, in `"range"` mode. */
	range?: Reactive<DateRange | undefined>;
	defaultRange?: DateRange;
	/** Month shown at first render. Defaults to the selection, then today. */
	defaultMonth?: Date;
	min?: Date;
	max?: Date;
	/** Rule out individual days — weekends, holidays, taken slots. */
	disabled?: (date: Date) => boolean;
	/** `0` Sunday, `1` Monday. Defaults to the locale's own first day. */
	weekStartsOn?: number;
	locale?: string;
	class?: Reactive<string>;
	/** `"single"` mode. */
	onValueChange?: (date: Date) => void;
	/** `"range"` mode. Fires on both clicks — `to` is absent after the first. */
	onRangeChange?: (range: DateRange) => void;
}

// ─── date helpers ────────────────────────────────────────────────────

/** Local midnight of the given day — the canonical form for a calendar date. */
export function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isSameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

export function addDays(date: Date, days: number): Date {
	// Day-of-month arithmetic through the Date constructor, which normalises
	// overflow — the 32nd of March becomes the 1st of April, leap years and
	// month lengths included. Adding milliseconds would not: a day is not
	// always 86 400 000 ms across a daylight-saving boundary.
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function addMonths(date: Date, months: number): Date {
	const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
	// Clamp the day: 31 January plus one month is 28 February, not 3 March.
	const lastDay = new Date(
		target.getFullYear(),
		target.getMonth() + 1,
		0,
	).getDate();
	return new Date(
		target.getFullYear(),
		target.getMonth(),
		Math.min(date.getDate(), lastDay),
	);
}

/**
 * The six-week grid covering a month.
 *
 * Always six weeks, always 42 cells, even when five would do. A grid that
 * changes height between months makes the whole popover jump as you page
 * through it.
 */
export function monthGrid(month: Date, weekStartsOn: number): Date[] {
	const first = new Date(month.getFullYear(), month.getMonth(), 1);
	const lead = (first.getDay() - weekStartsOn + 7) % 7;
	const start = addDays(first, -lead);
	return Array.from({ length: 42 }, (_unused, index) => addDays(start, index));
}

/**
 * `Intl.Locale.getWeekInfo` — present at runtime in current engines, absent
 * from the TypeScript DOM lib. Declared here and reached through a guard, so
 * the call is checked rather than asserted.
 */
interface WithWeekInfo {
	getWeekInfo(): { firstDay: number };
}

function hasWeekInfo(value: object): value is WithWeekInfo {
	return "getWeekInfo" in value && typeof value.getWeekInfo === "function";
}

/** The locale's first day of the week, or Monday where it cannot be read. */
function localeWeekStart(locale: string | undefined): number {
	const resolved = new Intl.Locale(locale ?? navigator.language);
	if (!hasWeekInfo(resolved)) return 1;
	// `firstDay` is 1–7 with 7 for Sunday; the Date API uses 0–6 with 0 Sunday.
	return resolved.getWeekInfo().firstDay % 7;
}

// ─── range logic (pure) ──────────────────────────────────────────────

/** Where a day sits within a span. `"single"` is a span of one day. */
export type RangePosition = "single" | "start" | "end" | "middle" | "none";

/**
 * Place a day relative to a span.
 *
 * `end` is passed in rather than read off the range because it may be the
 * *preview* end — wherever the pointer is, before the second click. Keeping
 * that decision at the call site is what lets this stay a pure function over
 * three dates, which is the part worth testing exhaustively.
 */
export function rangePosition(
	date: Date,
	range: DateRange | undefined,
	end: Date | undefined,
): RangePosition {
	if (range === undefined) return "none";
	if (end === undefined) {
		return isSameDay(date, range.from) ? "single" : "none";
	}

	// Ordered, because the preview end can sit before the fixed start while the
	// pointer sweeps backwards.
	const [lo, hi] = range.from <= end ? [range.from, end] : [end, range.from];
	// A one-day span is both ends at once, and squaring either side of it would
	// leave a lone cell with a flat edge against nothing.
	if (isSameDay(lo, hi)) return isSameDay(date, lo) ? "single" : "none";
	if (isSameDay(date, lo)) return "start";
	if (isSameDay(date, hi)) return "end";
	return date > lo && date < hi ? "middle" : "none";
}

/**
 * The span after clicking `date`.
 *
 * A click before the fixed start restarts the span rather than producing an
 * inverted one. Silently swapping the ends would be the other option, and it
 * is worse: the user who clicked the 3rd after the 10th almost always meant to
 * start again, not to select the week between them.
 */
export function nextRange(
	current: DateRange | undefined,
	date: Date,
): DateRange {
	if (
		current === undefined ||
		current.to !== undefined ||
		date < current.from
	) {
		return { from: date };
	}
	return { from: current.from, to: date };
}

// ─── component ───────────────────────────────────────────────────────

export const Calendar = component<CalendarProps>((props) => {
	const gridId = uid("calendar-grid");
	const labelId = uid("calendar-label");
	const locale = props.locale;
	const weekStartsOn = props.weekStartsOn ?? safeWeekStart(locale);

	const isRange = props.mode === "range";
	const today = startOfDay(new Date());
	const initial =
		props.defaultValue ??
		props.defaultRange?.from ??
		props.defaultMonth ??
		today;
	const month = signal(new Date(initial.getFullYear(), initial.getMonth(), 1));
	/** The day the keyboard is on. Only this cell is tabbable. */
	const cursor = signal(startOfDay(initial));

	const selected = (): Date | undefined =>
		read(props.value) ?? props.defaultValue;

	/** The span being built, when the caller does not control it. */
	const draft = signal<DateRange | undefined>(props.defaultRange);
	/** The day under the pointer, for the preview half of an open range. */
	const hovered = signal<Date | undefined>(undefined);

	const activeRange = (): DateRange | undefined => read(props.range) ?? draft();

	/**
	 * The far end of the span as currently drawn.
	 *
	 * While only one end is fixed, that is wherever the pointer is — which is
	 * what makes the range visibly follow the cursor before the second click.
	 * Keyboard users get no preview, and that is fine: for them the span
	 * appears on Enter, and a preview tied to the roving cursor would announce
	 * a selection that has not happened.
	 */
	function rangeEnd(): Date | undefined {
		const current = activeRange();
		if (current === undefined) return undefined;
		return current.to ?? hovered();
	}

	type RangePosition = "single" | "start" | "end" | "middle" | "none";

	function rangePositionOf(date: Date): RangePosition {
		const current = activeRange();
		if (current === undefined) return "none";

		const end = rangeEnd();
		if (end === undefined) {
			return isSameDay(date, current.from) ? "single" : "none";
		}

		// Ordered, because the preview end can sit before the fixed start while
		// the pointer sweeps backwards.
		const [lo, hi] =
			current.from <= end ? [current.from, end] : [end, current.from];
		// A one-day span is both ends at once, and squaring either side of it
		// would leave a lone cell with a flat edge against nothing.
		if (isSameDay(lo, hi)) return isSameDay(date, lo) ? "single" : "none";
		if (isSameDay(date, lo)) return "start";
		if (isSameDay(date, hi)) return "end";
		return date > lo && date < hi ? "middle" : "none";
	}

	const monthLabel = new Intl.DateTimeFormat(locale, {
		month: "long",
		year: "numeric",
	});
	const weekdayLabel = new Intl.DateTimeFormat(locale, { weekday: "short" });
	const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: "full" });

	function isDisabled(date: Date): boolean {
		if (props.min !== undefined && date < startOfDay(props.min)) return true;
		if (props.max !== undefined && date > startOfDay(props.max)) return true;
		return props.disabled?.(date) === true;
	}

	/**
	 * Show the month containing `date`, if it is not already showing.
	 *
	 * The guard is load-bearing. `month` is a signal the whole grid is derived
	 * from, so writing a fresh `Date` for the month already on screen rebuilds
	 * all 42 cells — destroying the one the user just clicked, and with it the
	 * focus that was on it.
	 */
	function showMonthOf(date: Date): void {
		const current = month();
		if (
			current.getFullYear() === date.getFullYear() &&
			current.getMonth() === date.getMonth()
		) {
			return;
		}
		month(new Date(date.getFullYear(), date.getMonth(), 1));
	}

	function choose(date: Date): void {
		if (isDisabled(date)) return;
		cursor(date);
		showMonthOf(date);
		if (isRange) chooseInRange(date);
		else props.onValueChange?.(date);
	}

	function chooseInRange(date: Date): void {
		const next = nextRange(activeRange(), date);
		draft(next);
		// Drop the preview: it belonged to the span that just closed, and leaving
		// it would paint a band to wherever the pointer happens to rest.
		hovered(undefined);
		props.onRangeChange?.(next);
	}

	function moveCursor(next: Date): void {
		cursor(next);
		// Follow the cursor across a month boundary, otherwise arrowing off the
		// end of the grid moves focus to a cell that is not on screen.
		if (
			next.getMonth() !== month().getMonth() ||
			next.getFullYear() !== month().getFullYear()
		) {
			month(new Date(next.getFullYear(), next.getMonth(), 1));
		}
		focusCursor();
	}

	function focusCursor(): void {
		// After the signal write, so the new cell exists and carries tabindex 0.
		queueMicrotask(() => {
			const grid = document.getElementById(gridId);
			grid
				?.querySelector<HTMLElement>("[data-cursor]")
				?.focus({ preventScroll: true });
		});
	}

	function onKeyDown(event: KeyboardEvent): void {
		const from = cursor();
		const moves: Record<string, () => Date> = {
			ArrowLeft: () => addDays(from, -1),
			ArrowRight: () => addDays(from, 1),
			ArrowUp: () => addDays(from, -7),
			ArrowDown: () => addDays(from, 7),
			PageUp: () => addMonths(from, -1),
			PageDown: () => addMonths(from, 1),
			Home: () => addDays(from, -((from.getDay() - weekStartsOn + 7) % 7)),
			End: () => addDays(from, 6 - ((from.getDay() - weekStartsOn + 7) % 7)),
		};

		const move = moves[event.key];
		if (move !== undefined) {
			event.preventDefault();
			moveCursor(move());
			return;
		}
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			choose(from);
		}
	}

	const weekdayNames = Array.from({ length: 7 }, (_unused, index) =>
		weekdayLabel.format(new Date(2024, 0, 7 + ((weekStartsOn + index) % 7))),
	);

	return html`<div
		data-slot="calendar"
		class="${() => cn("bg-background w-fit rounded-md p-3", read(props.class))}"
	>
		<div class="flex items-center justify-between pb-4">
			<button
				type="button"
				aria-label="Previous month"
				class="${buttonVariants({ variant: "outline", size: "icon", class: "size-7" })}"
				@click="${() => month(addMonths(month(), -1))}"
			>${ChevronLeftIcon({ class: "size-4" })}</button>
			<div id="${labelId}" aria-live="polite" class="text-sm font-medium">
				${() => monthLabel.format(month())}
			</div>
			<button
				type="button"
				aria-label="Next month"
				class="${buttonVariants({ variant: "outline", size: "icon", class: "size-7" })}"
				@click="${() => month(addMonths(month(), 1))}"
			>${ChevronRightIcon({ class: "size-4" })}</button>
		</div>
		<div
			role="grid"
			id="${gridId}"
			aria-labelledby="${labelId}"
			class="grid grid-cols-7 gap-1"
			@keydown="${onKeyDown}"
		>
			${weekdayNames.map(
				(name) => html`<div
					role="columnheader"
					aria-label="${name}"
					class="text-muted-foreground flex size-8 items-center justify-center text-[0.8rem] font-normal"
				>${name}</div>`,
			)}
			${() => monthGrid(month(), weekStartsOn).map(renderDay)}
		</div>
	</div>`;

	function renderDay(date: Date): Child {
		const outside = date.getMonth() !== month().getMonth();
		const position = (): RangePosition =>
			isRange ? rangePositionOf(date) : "none";
		const chosen = (): boolean => {
			if (isRange) return position() !== "none";
			const current = selected();
			return current !== undefined && isSameDay(current, date);
		};
		const onCursor = (): boolean => isSameDay(cursor(), date);
		const disabled = isDisabled(date);

		return html`<button
			type="button"
			role="gridcell"
			data-slot="calendar-day"
			data-cursor="${() => (onCursor() ? "" : undefined)}"
			data-outside="${outside ? "" : undefined}"
			data-today="${isSameDay(date, today) ? "" : undefined}"
			data-range="${() => {
				const at = position();
				return at === "none" ? undefined : at;
			}}"
			aria-label="${fullDate.format(date)}"
			aria-selected="${() => (chosen() ? "true" : "false")}"
			aria-current="${isSameDay(date, today) ? "date" : undefined}"
			tabindex="${() => (onCursor() ? 0 : -1)}"
			?disabled="${disabled}"
			class="${() =>
				cn(
					"flex size-8 items-center justify-center rounded-md p-0 text-sm font-normal transition-colors outline-none",
					"hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px]",
					"aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:hover:bg-primary",
					"data-[today]:bg-accent data-[today]:aria-selected:bg-primary",
					// The interior of a span is a flat band: square, and in accent
					// rather than primary, so the two ends stay the emphasis.
					"data-[range=middle]:bg-accent data-[range=middle]:text-accent-foreground data-[range=middle]:rounded-none",
					"data-[range=start]:rounded-r-none data-[range=end]:rounded-l-none",
					outside ? "text-muted-foreground opacity-50" : "",
					disabled ? "pointer-events-none opacity-30" : "",
				)}"
			@click="${() => choose(date)}"
			@pointerenter="${() => {
				if (isRange && !disabled) hovered(date);
			}}"
		>${date.getDate()}</button>`;
	}
});

/**
 * `Intl.Locale.getWeekInfo` is not available everywhere yet, and neither is
 * `navigator` on the server. Monday is the fallback — the ISO week start, and
 * the right answer for most of the world.
 */
function safeWeekStart(locale: string | undefined): number {
	try {
		if (typeof navigator === "undefined" && locale === undefined) return 1;
		return localeWeekStart(locale);
	} catch {
		return 1;
	}
}
