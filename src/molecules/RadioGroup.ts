/**
 * RadioGroup — one choice from a set.
 *
 *   RadioGroup({ name: "plan", children: () => html`
 *     ${RadioGroupItem({ value: "free", children: "Free" })}
 *     ${RadioGroupItem({ value: "pro", children: "Pro", description: "…" })}
 *   ` })
 *
 * A real `<input type="radio">` per item, sharing a `name`. That is what makes
 * the browser treat them as one group: arrow keys move between them, exactly
 * one can be checked, and the control posts with a plain HTML form — none of
 * which a `div` with `role="radio"` gets without reimplementing it.
 *
 * NAMED DEVIATION — upstream renders a `button` with `role="radio"`, because
 * Radix needs one element it fully controls. Everything above is what that
 * costs, so nebula keeps the native input and styles it with `appearance-none`.
 * The `data-slot` names and the indicator are upstream's.
 */

import { component, createContext, html, inject, provide } from "@c9up/aurora";
import type { Parts, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { type Reactive, read, readOr } from "../lib/props.js";

const radioClasses =
	"peer border-input dark:bg-input/30 checked:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aspect-square size-4 shrink-0 appearance-none rounded-full border bg-transparent shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

interface RadioGroupApi {
	readonly name: string;
	readonly selected: () => string | undefined;
	readonly disabled: () => boolean;
	choose(value: string): void;
}

const RadioGroupContext = createContext<RadioGroupApi>("RadioGroup");

export interface RadioGroupProps {
	/** Shared `name`, which is what makes the browser treat these as one group. */
	name: string;
	value?: Reactive<string | undefined>;
	defaultValue?: string;
	disabled?: Reactive<boolean>;
	orientation?: "vertical" | "horizontal";
	onValueChange?: (value: string) => void;
	class?: Reactive<string>;
	children?: Parts;
}

export const RadioGroup = component<RadioGroupProps>((props) => {
	provide<RadioGroupApi>(RadioGroupContext, {
		name: props.name,
		selected: () => {
			const controlled = read(props.value);
			return controlled === undefined ? props.defaultValue : controlled;
		},
		disabled: () => readOr(props.disabled, false),
		choose: (value) => props.onValueChange?.(value),
	});

	return html`<div
		data-slot="radio-group"
		role="radiogroup"
		aria-orientation="${props.orientation ?? "vertical"}"
		class="${() =>
			cn(
				"grid gap-3",
				props.orientation === "horizontal" ? "grid-flow-col auto-cols-max" : "",
				read(props.class),
			)}"
	>${props.children?.()}</div>`;
});

export interface RadioGroupItemProps {
	value: string;
	children?: Slot;
	description?: Slot;
	disabled?: boolean;
	class?: Reactive<string>;
}

export const RadioGroupItem = component<RadioGroupItemProps>((props) => {
	const group = inject(RadioGroupContext);
	const id = uid("radio");
	const descriptionId =
		props.description === undefined ? undefined : uid("radio-description");

	return html`<div class="flex items-start gap-3"><span
			class="relative flex size-4 shrink-0 items-center justify-center"
		><input
				type="radio"
				data-slot="radio-group-item"
				id="${id}"
				name="${group.name}"
				value="${props.value}"
				aria-describedby="${descriptionId}"
				?disabled="${() => props.disabled === true || group.disabled()}"
				.checked="${() => group.selected() === props.value}"
				class="${() => cn(radioClasses, read(props.class))}"
				@change="${() => group.choose(props.value)}"
			/><span
				data-slot="radio-group-indicator"
				class="bg-primary pointer-events-none absolute size-2 rounded-full opacity-0 transition-opacity peer-checked:opacity-100"
			></span></span><div class="grid gap-1 leading-none"><label
				for="${id}"
				class="text-sm leading-none font-medium select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
			>${slot(props.children)}</label>${
				props.description === undefined
					? null
					: html`<p id="${descriptionId}" class="text-muted-foreground text-sm">${slot(
							props.description,
						)}</p>`
			}</div></div>`;
});
