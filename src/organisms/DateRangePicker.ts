/**
 * DateRangePicker — a Calendar in range mode, behind a button.
 *
 * The same shell as `DatePicker`, and deliberately so: the two differ in what
 * they collect, not in how they behave. Both close on completion, both return
 * focus to the trigger, both format through `Intl` and both post ISO dates.
 *
 * The one behavioural difference is when to close. A single date is done in
 * one click; a range is not done until the second, so the popover stays open
 * between them. Closing on the first click and reopening for the second is the
 * usual bug here, and it makes the control feel broken.
 *
 * Two hidden inputs rather than one comma-joined field. A server parsing
 * `from`/`to` separately never has to split a string, and an empty `to` is
 * unambiguous.
 */

import { component, html, signal } from "@c9up/aurora";
import { buttonVariants } from "../atoms/Button.js";
import { cn } from "../lib/cn.js";
import { CalendarIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { zoomInOut } from "../lib/motion.js";
import { type Reactive, read, readOr } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";
import { floatingSurface } from "../primitives/floatingSurface.js";
import { focusSilently } from "../primitives/focusable.js";
import { Calendar, type DateRange, startOfDay } from "./Calendar.js";
import { toISODate } from "./DatePicker.js";

export interface DateRangePickerProps {
	/** Base name for the hidden inputs — `"stay"` posts `stay_from` / `stay_to`. */
	name?: string;
	value?: Reactive<DateRange | undefined>;
	defaultValue?: DateRange;
	placeholder?: string;
	min?: Date;
	max?: Date;
	disabled?: Reactive<boolean>;
	invalid?: Reactive<boolean>;
	locale?: string;
	class?: Reactive<string>;
	/** Fires on both clicks — `to` is absent after the first. */
	onValueChange?: (range: DateRange) => void;
}

export const DateRangePicker = component<DateRangePickerProps>((props) => {
	const triggerId = uid("date-range-trigger");
	const contentId = uid("date-range-content");
	const open = signal(false);

	const selection = controllable<DateRange | undefined>({
		value: props.value,
		initial: props.defaultValue,
		onChange: (next) => {
			if (next !== undefined) props.onValueChange?.(next);
		},
	});

	const format = new Intl.DateTimeFormat(props.locale, { dateStyle: "medium" });

	function pick(range: DateRange): void {
		selection.set({
			from: startOfDay(range.from),
			to: range.to === undefined ? undefined : startOfDay(range.to),
		});
		// Only a completed span closes the popover.
		if (range.to === undefined) return;
		open(false);
		focusSilently(document.getElementById(triggerId));
	}

	function label(): string {
		const current = selection.current();
		if (current === undefined) return props.placeholder ?? "Pick a date range";
		if (current.to === undefined) return `${format.format(current.from)} — …`;
		return `${format.format(current.from)} — ${format.format(current.to)}`;
	}

	floatingSurface({
		anchor: () => document.getElementById(triggerId),
		open: () => open(),
		onClose: () => open(false),
		placement: "bottom-start",
		offset: 4,
		trapFocus: true,
		initialFocus: (content) => content.querySelector("[data-cursor]"),
		content: () =>
			html`<div
				data-slot="date-range-picker-content"
				id="${contentId}"
				role="dialog"
				aria-label="Choose a date range"
				class="${cn(
					"bg-popover text-popover-foreground z-50 rounded-md border p-0 shadow-md outline-none",
					zoomInOut,
				)}"
			>
				${Calendar({
					mode: "range",
					range: () => selection.current(),
					defaultMonth: selection.current()?.from,
					min: props.min,
					max: props.max,
					locale: props.locale,
					onRangeChange: pick,
				})}
			</div>`,
	});

	const isoOf = (date: Date | undefined): string =>
		date === undefined ? "" : toISODate(date);

	return html`<div
		data-slot="date-range-picker"
		class="${() => cn("inline-flex", read(props.class))}"
	>
		<button
			type="button"
			id="${triggerId}"
			data-slot="date-range-picker-trigger"
			aria-haspopup="dialog"
			aria-expanded="${() => (open() ? "true" : "false")}"
			aria-controls="${() => (open() ? contentId : undefined)}"
			aria-invalid="${() => (read(props.invalid) === true ? "true" : undefined)}"
			data-placeholder="${() => (selection.current() === undefined ? "" : undefined)}"
			?disabled="${() => readOr(props.disabled, false)}"
			class="${buttonVariants({
				variant: "outline",
				class:
					"w-full justify-start gap-2 font-normal data-[placeholder]:text-muted-foreground",
			})}"
			@click="${() => open(!open())}"
		>
			${CalendarIcon({ class: "size-4" })}
			<span>${label}</span>
		</button>
		<input
			type="hidden"
			name="${props.name === undefined ? undefined : `${props.name}_from`}"
			.value="${() => isoOf(selection.current()?.from)}"
		/>
		<input
			type="hidden"
			name="${props.name === undefined ? undefined : `${props.name}_to`}"
			.value="${() => isoOf(selection.current()?.to)}"
		/>
	</div>`;
});
