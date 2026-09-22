/**
 * Field — a labelled control with its help text and its error.
 *
 *   Field({ ids, children: () => html`
 *     ${FieldLabel({ children: "Email" })}
 *     ${Input({ id: ids.control, describedBy: ids.describedBy })}
 *     ${FieldDescription({ children: "We never share it." })}
 *     ${FieldError({ children: error })}
 *   ` })
 *
 * The ids are the whole point of the component. Upstream leaves them to the
 * caller — `<FieldLabel htmlFor="x">` beside `<Input id="x">` — which works
 * until the two drift. `fieldIds()` mints a matching set and `Field` shares it
 * through context, so the label, the description and the error all point at
 * the right thing without anyone repeating a string. A caller still needs the
 * set for the CONTROL, which is why `fieldIds()` is exported and may be passed
 * in; left out, the field mints its own.
 *
 * `describedBy` names the description AND the error unconditionally. A screen
 * reader skips an id that resolves to nothing, so listing an absent error is
 * harmless — whereas recomputing the attribute when an error appears means the
 * control has to re-render, which Aurora does not do.
 */

import { component, createContext, html, inject, provide } from "@c9up/aurora";
import type { Parts, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";
import { styledDiv } from "../lib/styled.js";

export interface FieldIds {
	/** Put on the control. The label's `for` points here. */
	readonly control: string;
	readonly label: string;
	readonly description: string;
	readonly error: string;
	/** Ready-made `aria-describedby` naming both the description and the error. */
	readonly describedBy: string;
}

export function fieldIds(): FieldIds {
	const control = uid("field");
	const description = `${control}-description`;
	const error = `${control}-error`;
	return {
		control,
		label: `${control}-label`,
		description,
		error,
		describedBy: `${description} ${error}`,
	};
}

interface FieldApi {
	readonly ids: FieldIds;
	readonly required: boolean;
}

const FieldContext = createContext<FieldApi>("Field");

export interface FieldProps {
	/** Reuse a set the caller already put on the control. */
	ids?: FieldIds;
	required?: boolean;
	disabled?: Reactive<boolean>;
	orientation?: "vertical" | "horizontal";
	class?: Reactive<string>;
	children?: Parts;
}

export const Field = component<FieldProps>((props) => {
	const ids = props.ids ?? fieldIds();
	const orientation = props.orientation ?? "vertical";

	provide<FieldApi>(FieldContext, { ids, required: props.required === true });

	return html`<div
		data-slot="field"
		data-orientation="${orientation}"
		data-disabled="${() => (read(props.disabled) === true ? "true" : undefined)}"
		class="${() =>
			cn(
				"group/field flex w-full gap-3 data-[invalid=true]:text-destructive",
				orientation === "horizontal"
					? "flex-row items-center justify-between"
					: "flex-col",
				read(props.class),
			)}"
	>${props.children?.()}</div>`;
});

export interface FieldSectionProps {
	children?: Slot;
	class?: Reactive<string>;
}

/**
 * The label.
 *
 * A `<label>` with `for`, not a `<div>`: clicking it focuses the control, and
 * that is not something `aria-labelledby` gives you.
 */
export const FieldLabel = component<FieldSectionProps>((props) => {
	const field = inject(FieldContext);
	return html`<label
		data-slot="field-label"
		id="${field.ids.label}"
		for="${field.ids.control}"
		class="${() =>
			cn(
				"group/field-label peer/field-label flex w-fit gap-2 text-sm leading-snug font-medium select-none group-data-[disabled=true]/field:opacity-50",
				read(props.class),
			)}"
	>${slot(props.children)}${
		field.required
			? html`<span aria-hidden="true" class="text-destructive">*</span>`
			: null
	}</label>`;
});

/** A heading inside a field that is not the control's label. */
export const FieldTitle = component<FieldSectionProps>(
	(props) => html`<div
		data-slot="field-label"
		class="${() =>
			cn(
				"flex w-fit items-center gap-2 text-sm leading-snug font-medium group-data-[disabled=true]/field:opacity-50",
				read(props.class),
			)}"
	>${slot(props.children)}</div>`,
);

export const FieldDescription = component<FieldSectionProps>((props) => {
	const field = inject(FieldContext);
	return html`<p
		data-slot="field-description"
		id="${field.ids.description}"
		class="${() =>
			cn(
				"text-muted-foreground text-sm leading-normal font-normal group-has-[[data-orientation=horizontal]]/field:text-balance",
				read(props.class),
			)}"
	>${slot(props.children)}</p>`;
});

export interface FieldErrorProps {
	/** Reactive — renders nothing while absent. */
	children?: Reactive<string | undefined>;
	/** Several messages, rendered as a list. */
	errors?: Reactive<readonly string[] | undefined>;
	class?: Reactive<string>;
}

/**
 * The validation message.
 *
 * Always in the DOM, `empty:hidden` rather than conditionally rendered: the id
 * `describedBy` names has to resolve to something the moment an error appears,
 * and a node added later is announced late or not at all.
 */
export const FieldError = component<FieldErrorProps>((props) => {
	const field = inject(FieldContext);
	return html`<p
		data-slot="field-error"
		id="${field.ids.error}"
		role="alert"
		class="${() =>
			cn(
				"text-destructive text-sm font-normal empty:hidden",
				read(props.class),
			)}"
	>${() => {
		const many = read(props.errors);
		if (many !== undefined && many.length > 0) {
			return many.length === 1
				? (many[0] ?? "")
				: html`<ul class="ml-4 flex list-disc flex-col gap-1">${many.map(
						(message) => html`<li>${message}</li>`,
					)}</ul>`;
		}
		return read(props.children) ?? "";
	}}</p>`;
});

/** Several fields stacked, with the spacing upstream gives a form. */
export const FieldGroup = styledDiv(
	"field-group",
	"group/field-group @container/field-group flex w-full flex-col gap-7 data-[slot=checkbox-group]:gap-3 [&>[data-slot=field-group]]:gap-4",
);

/** The text half of a horizontal field, beside its control. */
export const FieldContent = styledDiv(
	"field-content",
	"group/field-content flex flex-1 flex-col gap-1.5 leading-snug",
);

/** A `<fieldset>`, for a group of fields that answer one question together. */
export const FieldSet = component<FieldSectionProps>(
	(props) => html`<fieldset
		data-slot="field-set"
		class="${() => cn("flex flex-col gap-6", read(props.class))}"
	>${slot(props.children)}</fieldset>`,
);

export interface FieldLegendProps extends FieldSectionProps {
	variant?: "legend" | "label";
}

export const FieldLegend = component<FieldLegendProps>(
	(props) => html`<legend
		data-slot="field-legend"
		data-variant="${props.variant ?? "legend"}"
		class="${() =>
			cn(
				"mb-3 font-medium data-[variant=label]:text-sm data-[variant=legend]:text-base",
				read(props.class),
			)}"
	>${slot(props.children)}</legend>`,
);

export interface FieldSeparatorProps {
	/** A word in the middle of the rule — "or". */
	children?: Slot;
	class?: Reactive<string>;
}

export const FieldSeparator = component<FieldSeparatorProps>(
	(props) => html`<div
		data-slot="field-separator"
		data-content="${props.children === undefined ? undefined : ""}"
		class="${() =>
			cn(
				"relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2",
				read(props.class),
			)}"
	><span class="bg-border absolute inset-x-0 top-1/2 h-px"></span>${
		props.children === undefined
			? null
			: html`<span
					data-slot="field-separator-content"
					class="bg-background text-muted-foreground relative mx-auto block w-fit px-2"
				>${slot(props.children)}</span>`
	}</div>`,
);
