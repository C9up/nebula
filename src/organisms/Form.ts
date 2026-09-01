/**
 * Form — binding between Aurora's form controller and nebula's field markup.
 *
 * shadcn's Form is a set of adapters over `react-hook-form`, and none of that
 * layer is needed here: Aurora already ships `form()`, a reactive controller
 * with values, per-field errors, touched state, submit-in-flight and optional
 * rune/zod-shaped validation. Reimplementing it would be a second source of
 * truth for the same thing.
 *
 * So this file is only the join. It wires one field to one `Field` plus one
 * control, and takes care of the three things that otherwise get forgotten:
 * `aria-invalid` when the field has an error, `aria-describedby` pointing at
 * the error element, and marking the field touched on blur so an error appears
 * after leaving a field rather than while typing in it.
 *
 *   const login = form({
 *     initial: { email: "", password: "" },
 *     validate: (values) => (values.email === "" ? { email: "Required" } : {}),
 *     submit: (values) => http.post("/login", values),
 *   })
 *
 *   Form({
 *     form: login,
 *     children: [
 *       TextField({ bind: bind(login, "email"), label: "Email", type: "email" }),
 *       TextField({ bind: bind(login, "password"), label: "Password", type: "password" }),
 *       SubmitButton({ form: login, label: "Sign in" }),
 *     ],
 *   })
 */

import type { Form as AuroraForm, FormField } from "@c9up/aurora";
import { component, html } from "@c9up/aurora";
import { Button } from "../atoms/Button.js";
import { Input } from "../atoms/Input.js";
import { Spinner } from "../atoms/Spinner.js";
import { Textarea } from "../atoms/Textarea.js";
import type { Child, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read } from "../lib/props.js";
import { Field, fieldIds } from "../molecules/Field.js";

/**
 * One field, with a setter that already knows which key it writes to.
 *
 * This shape exists so the input components are not generic over the form.
 * Inside a function generic in `T`, TypeScript cannot prove a `string` is
 * assignable to `T[K]`, and the usual escape is a cast. `bind()` is called at
 * a *concrete* call site, where `K` is a literal and `T[K]` resolves to a real
 * type — so `bind(login, "email")` is a `FieldBinding<string>` and handing it
 * to a numeric input is a compile error rather than a runtime surprise.
 */
export interface FieldBinding<V> {
	readonly name: string;
	readonly field: FormField<V>;
	set(value: V): void;
}

/** Bind one key of a form. Call it at the field's own call site. */
export function bind<T, K extends keyof T & string>(
	form: AuroraForm<T>,
	name: K,
): FieldBinding<T[K]> {
	return {
		name,
		field: form.field(name),
		set: (value: T[K]) => form.set(name, value),
	};
}

export interface FormProps<T> {
	form: AuroraForm<T>;
	children?: Slot;
	class?: Reactive<string>;
}

/**
 * The `<form>` element itself.
 *
 * `novalidate` on purpose. The browser's own validation bubbles cannot be
 * styled, appear one at a time, and vanish on scroll — and they would fire
 * before the controller's validation ever runs, so the user would see two
 * different error presentations for the same field.
 */
export function Form<T>(props: FormProps<T>): ReturnType<typeof html> {
	return html`<form
		data-slot="form"
		novalidate
		class="${() => cn("flex flex-col gap-6", read(props.class))}"
		@submit="${(event: Event) => {
			// A DOM listener returns nothing, so this promise is nobody's to
			// await. `command.run` always resolves — failures route to
			// `onFail` — but `validate()` runs first, and a validator that
			// throws rejects here: the form would silently do nothing and leave
			// a bare `Uncaught (in promise)` behind. Reported, so the thing
			// that broke is the thing the console names.
			void props.form.handleSubmit(event).catch((error: unknown) => {
				console.error("[nebula] Form submit failed:", error);
			});
		}}"
	>${slot(props.children)}</form>`;
}

interface FieldShellProps {
	bind: FieldBinding<string>;
	label: Child;
	description?: Child;
	placeholder?: string;
	required?: boolean;
	disabled?: Reactive<boolean>;
}

export interface TextFieldProps extends FieldShellProps {
	type?: string;
	autocomplete?: string;
}

/**
 * A labelled text input bound to one field.
 *
 * The error is shown only once the field has been touched, which is what stops
 * a pristine form opening with "Required" under every empty box.
 *
 * When errors actually appear is Aurora's decision, not this file's, and it is
 * worth knowing: `form()` populates them on `validate()` — which `handleSubmit`
 * calls — and clears a field's error as soon as it is written to. So the
 * sequence is: submit, see every problem at once, and watch each one disappear
 * as it is fixed. Typing into an untouched field does not raise an error, and
 * `markTouched` on blur does not validate; it only lifts the gate for an error
 * that validation has already found.
 */
export const TextField = component<TextFieldProps>((props) => {
	const ids = fieldIds();
	const { field, set, name } = props.bind;
	const visibleError = (): string | undefined =>
		field.touched() ? (field.error() ?? undefined) : undefined;

	return Field({
		ids,
		label: props.label,
		description: props.description,
		error: visibleError,
		required: props.required,
		disabled: props.disabled,
		children: Input({
			id: ids.control,
			name,
			type: props.type ?? "text",
			placeholder: props.placeholder,
			autocomplete: props.autocomplete,
			required: props.required,
			disabled: props.disabled,
			invalid: () => visibleError() !== undefined,
			describedBy: ids.describedBy,
			value: () => field.value(),
			onInput: set,
			onBlur: () => field.markTouched(),
		}),
	});
});

export interface TextAreaFieldProps extends FieldShellProps {
	rows?: number;
}

/** The same, with a multi-line control. */
export const TextAreaField = component<TextAreaFieldProps>((props) => {
	const ids = fieldIds();
	const { field, set, name } = props.bind;
	const visibleError = (): string | undefined =>
		field.touched() ? (field.error() ?? undefined) : undefined;

	return Field({
		ids,
		label: props.label,
		description: props.description,
		error: visibleError,
		required: props.required,
		disabled: props.disabled,
		children: Textarea({
			id: ids.control,
			name,
			rows: props.rows,
			placeholder: props.placeholder,
			required: props.required,
			disabled: props.disabled,
			invalid: () => visibleError() !== undefined,
			describedBy: ids.describedBy,
			value: () => field.value(),
			onInput: set,
			onBlur: () => field.markTouched(),
		}),
	});
});

export interface SubmitButtonProps<T> {
	form: AuroraForm<T>;
	label: Child;
	/** Replaces the label while the submit is in flight. */
	pendingLabel?: Child;
	class?: Reactive<string>;
}

/**
 * A submit button that disables itself while the submit is in flight.
 *
 * Disabled on `submitting` only — never on `!valid`. A submit button that is
 * dead until the form is correct gives the user nothing to press and no
 * explanation; pressing it and seeing every error at once is how a form tells
 * you what is wrong.
 */
export function SubmitButton<T>(
	props: SubmitButtonProps<T>,
): ReturnType<typeof html> {
	return Button({
		type: "submit",
		disabled: () => props.form.submitting(),
		class: props.class,
		children: () =>
			props.form.submitting()
				? [Spinner({ class: "mr-2" }), props.pendingLabel ?? props.label]
				: props.label,
	});
}
