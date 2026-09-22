/**
 * InputGroup — an input with something attached to it.
 *
 * A currency prefix, a `.com` suffix, a search icon, a clear button. The group
 * carries the border and the focus ring; the input inside is stripped bare.
 *
 * `focus-within:` is what moves the ring onto the wrapper, so focusing the
 * input lights up the whole control including the addons. Styling the input's
 * own `:focus-visible` would draw a ring around the middle third of a control
 * that visually reads as one box.
 */

import { component, html } from "@c9up/aurora";
import { Button, type ButtonVariants } from "../atoms/Button.js";
import { Input, type InputProps } from "../atoms/Input.js";
import { Textarea, type TextareaProps } from "../atoms/Textarea.js";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read } from "../lib/props.js";

export const inputGroupControlClasses =
	"flex-1 rounded-none border-0 bg-transparent px-0 shadow-none outline-none focus-visible:border-0 focus-visible:ring-0 disabled:opacity-100 dark:bg-transparent";

export interface InputGroupProps {
	children?: Slot;
	invalid?: Reactive<boolean>;
	disabled?: Reactive<boolean>;
	class?: Reactive<string>;
}

/**
 * InputGroup — a control with things attached to it.
 *
 * The border, the ring and the invalid state live on the GROUP, not on the
 * control: an input with its own border inside a bordered group draws two
 * rectangles, and a focus ring around the input alone leaves the addons
 * outside it. So the control gives all of that up — that is the whole of
 * `inputGroupControlClasses` — and `focus-within` moves the ring to the group.
 */
export const InputGroup = component<InputGroupProps>(
	(props) => html`<div
		data-slot="input-group"
		data-disabled="${() => (read(props.disabled) === true ? "" : undefined)}"
		aria-invalid="${() => (read(props.invalid) === true ? "true" : undefined)}"
		class="${() =>
			cn(
				"group/input-group border-input dark:bg-input/30 relative flex h-9 w-full min-w-0 items-center gap-2 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none",
				"focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
				"aria-invalid:border-destructive aria-invalid:ring-destructive/20",
				"data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				read(props.class),
			)}"
	>${slot(props.children)}</div>`,
);

export const InputGroupInput = component<InputProps>((props) =>
	Input({
		...props,
		class: () => cn(inputGroupControlClasses, read(props.class)),
	}),
);

export const InputGroupTextarea = component<TextareaProps>((props) =>
	Textarea({
		...props,
		class: () =>
			cn(inputGroupControlClasses, "resize-none py-3", read(props.class)),
	}),
);

export interface InputGroupAddonProps {
	children?: Slot;
	/** Which end it sits at. `block-*` stacks it above or below the control. */
	align?: "inline-start" | "inline-end" | "block-start" | "block-end";
	class?: Reactive<string>;
}

/** An icon, a unit, a button — anything beside the control. */
export const InputGroupAddon = component<InputGroupAddonProps>(
	(props) => html`<div
		data-slot="input-group-addon"
		data-align="${props.align ?? "inline-start"}"
		class="${() =>
			cn(
				"text-muted-foreground flex shrink-0 items-center gap-2 text-sm [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
				read(props.class),
			)}"
	>${slot(props.children)}</div>`,
);

export interface InputGroupButtonProps {
	children?: Slot;
	type?: "button" | "submit" | "reset";
	variant?: ButtonVariants["variant"];
	size?: ButtonVariants["size"];
	disabled?: Reactive<boolean>;
	onClick?: (event: MouseEvent) => void;
	class?: Reactive<string>;
}

/**
 * A button inside the group.
 *
 * `ghost` and the smallest size by default: a filled button the height of the
 * field turns the group into two controls side by side, which is exactly what
 * the group exists to avoid looking like.
 */
export const InputGroupButton = component<InputGroupButtonProps>((props) =>
	Button({
		type: props.type ?? "button",
		variant: props.variant ?? "ghost",
		size: props.size ?? "sm",
		disabled: props.disabled,
		onClick: props.onClick,
		class: () => cn("shadow-none", read(props.class)),
		children: props.children,
	}),
);

export interface InputGroupTextProps {
	children?: Slot;
	class?: Reactive<string>;
}

/** Static text in the group — a currency symbol, a domain suffix. */
export const InputGroupText = component<InputGroupTextProps>(
	(props) => html`<span
		data-slot="input-group-text"
		class="${() =>
			cn(
				"text-muted-foreground flex items-center gap-2 text-sm [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
				read(props.class),
			)}"
	>${slot(props.children)}</span>`,
);
