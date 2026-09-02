/**
 * Slider — pick a number from a range.
 *
 * A native `<input type="range">`, restyled. Radix builds its own from a div
 * and pointer maths because it supports multiple thumbs; nebula does not, and
 * for the single-thumb case the native control already brings keyboard
 * support (arrows, Page Up/Down, Home/End), the correct ARIA role and value
 * announcements, and touch behaviour that no reimplementation gets right for
 * free.
 *
 * The cost is the thumb, which can only be reached through the two vendor
 * pseudo-elements. Both are written out, as literals — see `sliderClasses`.
 */

import { component, html } from "@c9up/aurora";
import { cn } from "../lib/cn.js";
import { accessor, type Reactive, read } from "../lib/props.js";

// Every thumb variant is written out, and the repetition is the point.
//
// Tailwind finds class names by SCANNING this file as text — it never runs it.
// A variant built at runtime, `[&::-webkit-slider-thumb]:${THUMB.split(...)}`,
// is never a literal here, so no rule is generated for it and the attribute
// ends up naming classes that do not exist. Nothing throws and the markup looks
// right; the thumb simply falls back to the browser's default.
//
// The two vendor pseudo-elements cannot be folded into one selector either: a
// browser drops an entire rule containing a pseudo-element it does not know.
export const sliderClasses = cn(
	"h-1.5 w-full cursor-pointer appearance-none rounded-full bg-primary/20 outline-none disabled:pointer-events-none disabled:opacity-50",
	"[&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-[color,box-shadow]",
	"[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-background [&::-moz-range-thumb]:shadow-sm [&::-moz-range-thumb]:transition-[color,box-shadow]",
	"focus-visible:[&::-webkit-slider-thumb]:ring-ring/50 focus-visible:[&::-webkit-slider-thumb]:ring-[3px]",
	"focus-visible:[&::-moz-range-thumb]:ring-ring/50 focus-visible:[&::-moz-range-thumb]:ring-[3px]",
);

export interface SliderProps {
	id?: string;
	name?: string;
	value?: Reactive<number>;
	min?: Reactive<number>;
	max?: Reactive<number>;
	step?: Reactive<number>;
	disabled?: Reactive<boolean>;
	label?: Reactive<string | undefined>;
	class?: Reactive<string>;
	onValueChange?: (value: number, event: Event) => void;
}

function inputValue(event: Event): number {
	const target = event.target;
	return target instanceof HTMLInputElement ? Number(target.value) : 0;
}

export const Slider = component<SliderProps>((props) => {
	return html`<input
		type="range"
		data-slot="slider"
		id="${props.id}"
		name="${props.name}"
		min="${accessor(props.min, 0)}"
		max="${accessor(props.max, 100)}"
		step="${accessor(props.step, 1)}"
		aria-label="${accessor(props.label, undefined)}"
		?disabled="${accessor(props.disabled, false)}"
		.value="${accessor(props.value, 0)}"
		class="${() => cn(sliderClasses, read(props.class))}"
		@input="${(event: Event) => props.onValueChange?.(inputValue(event), event)}"
	/>`;
});
