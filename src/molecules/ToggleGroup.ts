/**
 * ToggleGroup — a row of toggles acting as one control.
 *
 * `type` decides both the behaviour and the semantics, and they have to move
 * together. `"single"` is a radio group: one value, `role="radio"` on each
 * button, and picking one clears the rest. `"multiple"` is a set of
 * independent toggle buttons, each with `aria-pressed`.
 *
 * Getting that pairing wrong is the usual bug here — a single-select group
 * announcing each option as "pressed" tells a screen-reader user they can turn
 * several on at once.
 *
 * The classes come from `Toggle`'s own `cva`, so a grouped button and a
 * standalone one cannot drift apart. Only the corner rounding is overridden,
 * to weld the row into one shape.
 */

import {
	component,
	createContext,
	html,
	inject,
	provide,
	signal,
} from "@c9up/aurora";
import { type ToggleVariants, toggleVariants } from "../atoms/Toggle.js";
import type { Parts, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read, readOr } from "../lib/props.js";

interface ToggleGroupApi {
	readonly type: "single" | "multiple";
	readonly variant: ToggleVariants["variant"];
	readonly size: ToggleVariants["size"];
	readonly spacing: "default" | "0";
	readonly disabled: () => boolean;
	isOn(value: string): boolean;
	toggle(value: string): void;
}

const ToggleGroupContext = createContext<ToggleGroupApi>("ToggleGroup");

export interface ToggleGroupProps {
	type?: "single" | "multiple";
	defaultValue?: string | readonly string[];
	variant?: Reactive<ToggleVariants["variant"]>;
	size?: Reactive<ToggleVariants["size"]>;
	/** `"0"` joins the items into one bar; `"default"` spaces them. */
	spacing?: "default" | "0";
	disabled?: Reactive<boolean>;
	onValueChange?: (value: readonly string[]) => void;
	class?: Reactive<string>;
	children?: Parts;
}

export const ToggleGroup = component<ToggleGroupProps>((props) => {
	const type = props.type ?? "single";
	const spacing = props.spacing ?? "0";
	const selected = signal<readonly string[]>(
		props.defaultValue === undefined
			? []
			: typeof props.defaultValue === "string"
				? [props.defaultValue]
				: props.defaultValue,
	);

	function toggle(value: string): void {
		const current = selected();
		const next =
			type === "single"
				? current.includes(value)
					? []
					: [value]
				: current.includes(value)
					? current.filter((entry) => entry !== value)
					: [...current, value];
		selected(next);
		props.onValueChange?.(next);
	}

	provide<ToggleGroupApi>(ToggleGroupContext, {
		type,
		variant: read(props.variant),
		size: read(props.size),
		spacing,
		disabled: () => readOr(props.disabled, false),
		isOn: (value) => selected().includes(value),
		toggle,
	});

	return html`<div
		data-slot="toggle-group"
		role="${type === "single" ? "radiogroup" : "group"}"
		data-variant="${() => readOr(props.variant, "default")}"
		data-size="${() => readOr(props.size, "default")}"
		data-spacing="${spacing}"
		class="${() =>
			cn(
				"group/toggle-group flex w-fit items-center rounded-md data-[spacing=default]:gap-1 data-[spacing=default]:data-[variant=outline]:shadow-xs",
				read(props.class),
			)}"
	>${props.children?.()}</div>`;
});

export interface ToggleGroupItemProps {
	value: string;
	children?: Slot;
	/** Required when the label is an icon alone. */
	ariaLabel?: string;
	disabled?: boolean;
	variant?: ToggleVariants["variant"];
	size?: ToggleVariants["size"];
	class?: Reactive<string>;
}

export const ToggleGroupItem = component<ToggleGroupItemProps>((props) => {
	const group = inject(ToggleGroupContext);
	const on = (): boolean => group.isOn(props.value);
	const single = group.type === "single";

	return html`<button
		type="button"
		data-slot="toggle-group-item"
		data-state="${() => (on() ? "on" : "off")}"
		data-value="${props.value}"
		data-variant="${group.variant ?? props.variant ?? "default"}"
		data-size="${group.size ?? props.size ?? "default"}"
		data-spacing="${group.spacing}"
		role="${single ? "radio" : undefined}"
		aria-checked="${() => (single ? (on() ? "true" : "false") : undefined)}"
		aria-pressed="${() => (single ? undefined : on() ? "true" : "false")}"
		aria-label="${props.ariaLabel}"
		?disabled="${() => props.disabled === true || group.disabled()}"
		class="${() =>
			cn(
				toggleVariants({
					variant: group.variant ?? props.variant,
					size: group.size ?? props.size,
				}),
				"w-auto min-w-0 shrink-0 px-3 focus:z-10 focus-visible:z-10",
				"data-[spacing=0]:rounded-none data-[spacing=0]:shadow-none data-[spacing=0]:first:rounded-l-md data-[spacing=0]:last:rounded-r-md data-[spacing=0]:data-[variant=outline]:border-l-0 data-[spacing=0]:data-[variant=outline]:first:border-l",
				"aria-checked:bg-accent aria-checked:text-accent-foreground",
				read(props.class),
			)}"
		@click="${() => group.toggle(props.value)}"
	>${slot(props.children)}</button>`;
});
