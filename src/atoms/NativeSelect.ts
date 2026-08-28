/**
 * NativeSelect — a real `<select>`, styled.
 *
 * The counterpart to `Select`, and the one to reach for first. `Select` builds
 * a listbox out of divs because the operating system draws a native popup that
 * cannot be styled at all — options take no markup, no colours, no checkmarks.
 * That freedom costs everything the native control does for free, and `Select`
 * has to put it all back by hand: roles, `aria-activedescendant`, type-ahead,
 * arrows, a hidden input.
 *
 * When the options are plain text, none of that is worth paying for. A native
 * select gives you the platform's own picker — the wheel on iOS, the
 * search-as-you-type list on desktop — form participation, and zero JavaScript.
 * `appearance-none` plus a background chevron gets it to match the design
 * system everywhere except the open popup itself.
 *
 * Use `Select` when an option needs an icon, a description, or a swatch. Use
 * this one otherwise.
 */

import { component, html } from "@c9up/aurora";
import { cn } from "../lib/cn.js";
import { accessor, type Reactive, read } from "../lib/props.js";

export interface NativeSelectOption {
	value: string;
	label: string;
	disabled?: boolean;
	/** Groups consecutive options under an `<optgroup>`. */
	group?: string;
}

export const nativeSelectClasses =
	"border-input dark:bg-input/30 flex h-9 w-full min-w-0 appearance-none rounded-md border bg-transparent py-1 pr-8 pl-3 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm aria-invalid:border-destructive aria-invalid:ring-destructive/20";

export interface NativeSelectProps {
	options: readonly NativeSelectOption[];
	id?: string;
	name?: string;
	value?: Reactive<string | undefined>;
	/** Shown as a disabled first entry while nothing is chosen. */
	placeholder?: string;
	disabled?: Reactive<boolean>;
	required?: Reactive<boolean>;
	invalid?: Reactive<boolean>;
	describedBy?: Reactive<string | undefined>;
	class?: Reactive<string>;
	onValueChange?: (value: string, event: Event) => void;
}

function selectedValue(event: Event): string {
	const target = event.target;
	return target instanceof HTMLSelectElement ? target.value : "";
}

export const NativeSelect = component<NativeSelectProps>((props) => {
	/**
	 * Options grouped in source order.
	 *
	 * Consecutive entries sharing a `group` become one `<optgroup>`; a run that
	 * starts again later becomes a second one. Sorting by group instead would
	 * quietly reorder a list the caller arranged deliberately.
	 */
	function runs(): Array<{ group?: string; items: NativeSelectOption[] }> {
		const out: Array<{ group?: string; items: NativeSelectOption[] }> = [];
		for (const option of props.options) {
			const last = out[out.length - 1];
			if (last !== undefined && last.group === option.group)
				last.items.push(option);
			else out.push({ group: option.group, items: [option] });
		}
		return out;
	}

	const renderOption = (option: NativeSelectOption) =>
		html`<option value="${option.value}" ?disabled="${option.disabled === true}">
			${option.label}
		</option>`;

	return html`<div data-slot="native-select" class="relative inline-flex w-full items-center">
		<select
			id="${props.id}"
			name="${props.name}"
			aria-invalid="${() => (read(props.invalid) === true ? "true" : undefined)}"
			aria-describedby="${accessor(props.describedBy, undefined)}"
			?disabled="${accessor(props.disabled, false)}"
			?required="${accessor(props.required, false)}"
			.value="${accessor(props.value, "")}"
			class="${() => cn(nativeSelectClasses, read(props.class))}"
			@change="${(event: Event) => props.onValueChange?.(selectedValue(event), event)}"
		>
			${
				props.placeholder === undefined
					? null
					: html`<option value="" disabled selected>${props.placeholder}</option>`
			}
			${runs().map((run) =>
				run.group === undefined
					? run.items.map(renderOption)
					: html`<optgroup label="${run.group}">${run.items.map(renderOption)}</optgroup>`,
			)}
		</select>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			class="pointer-events-none absolute end-3 size-4 opacity-50"
		><path d="m6 9 6 6 6-6" /></svg>
	</div>`;
});
