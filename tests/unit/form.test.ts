/**
 * The Form layer is a binding, not a controller — Aurora's own `form()` owns
 * the state. What these check is the join: that a field writes back to the
 * right key, that errors appear only once a field has been left, and that the
 * ARIA wiring between label, control and error actually resolves.
 */

import { form } from "@c9up/aurora";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	bind,
	Form,
	SubmitButton,
	TextAreaField,
	TextField,
} from "../../src/organisms/Form.js";
import { mount } from "./helpers.js";

afterEach(() => {
	document.body.innerHTML = "";
});

interface Login {
	email: string;
	bio: string;
}

function loginForm(
	submit: (values: Login) => Promise<unknown> = async () => undefined,
) {
	return form<Login>({
		initial: { email: "", bio: "" },
		validate: (values) =>
			values.email === "" ? { email: "Email is required" } : {},
		submit,
	});
}

const input = (): HTMLInputElement | null =>
	document.querySelector<HTMLInputElement>("input[name='email']");

function type(
	element: HTMLInputElement | HTMLTextAreaElement,
	value: string,
): void {
	element.value = value;
	element.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("bind", () => {
	it("writes back to the key it was bound to", () => {
		const controller = loginForm();
		const email = bind(controller, "email");
		email.set("ada@example.com");
		expect(controller.values().email).toBe("ada@example.com");
		expect(controller.values().bio).toBe("");
	});

	it("exposes the field's own reactive handles", () => {
		const controller = loginForm();
		const email = bind(controller, "email");
		expect(email.field.value()).toBe("");
		email.set("x");
		expect(email.field.value()).toBe("x");
	});
});

describe("TextField", () => {
	it("wires label, control and error to each other", () => {
		const controller = loginForm();
		const view = mount(
			TextField({ bind: bind(controller, "email"), label: "Email" }),
		);

		const label = document.querySelector("label");
		const control = input();
		const error = document.querySelector("[data-slot='field-error']");

		expect(label?.getAttribute("for")).toBe(control?.id);
		expect(control?.getAttribute("aria-describedby")).toContain(
			error?.id ?? "",
		);
		view.dispose();
	});

	it("stays quiet until the field has been left", () => {
		// Reporting "Required" into an empty field nobody has reached yet is the
		// fastest way to make a form feel hostile.
		const controller = loginForm();
		const view = mount(
			TextField({ bind: bind(controller, "email"), label: "Email" }),
		);
		expect(
			document.querySelector("[data-slot='field-error']")?.textContent?.trim(),
		).toBe("");
		view.dispose();
	});

	it("shows the error once validation has run and the field is touched", () => {
		// Two conditions, and they come from different places: `validate()` is
		// what finds the error (Aurora's `form()` does not validate on keystroke
		// or on blur), and `markTouched` is what lifts nebula's gate on showing
		// it. Either one alone leaves the field silent.
		const controller = loginForm();
		const view = mount(
			TextField({ bind: bind(controller, "email"), label: "Email" }),
		);
		const control = input();

		controller.validate();
		expect(
			document.querySelector("[data-slot='field-error']")?.textContent?.trim(),
		).toBe("");

		control?.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
		expect(
			document.querySelector("[data-slot='field-error']")?.textContent,
		).toContain("Email is required");
		expect(control?.getAttribute("aria-invalid")).toBe("true");
		view.dispose();
	});

	it("clears the error as soon as the field is written to", () => {
		const controller = loginForm();
		const view = mount(
			TextField({ bind: bind(controller, "email"), label: "Email" }),
		);
		const control = input();
		controller.validate();
		control?.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
		if (control !== null) type(control, "ada@example.com");

		expect(
			document.querySelector("[data-slot='field-error']")?.textContent?.trim(),
		).toBe("");
		view.dispose();
	});

	it("marks a required field for assistive technology", () => {
		const controller = loginForm();
		const view = mount(
			TextField({
				bind: bind(controller, "email"),
				label: "Email",
				required: true,
			}),
		);
		expect(input()?.hasAttribute("required")).toBe(true);
		view.dispose();
	});

	it("passes the type through, so a password field is one", () => {
		const controller = loginForm();
		const view = mount(
			TextField({
				bind: bind(controller, "email"),
				label: "Email",
				type: "email",
			}),
		);
		expect(input()?.getAttribute("type")).toBe("email");
		view.dispose();
	});
});

describe("TextAreaField", () => {
	it("binds a multi-line control to its key", () => {
		const controller = loginForm();
		const view = mount(
			TextAreaField({ bind: bind(controller, "bio"), label: "Bio", rows: 3 }),
		);
		const area = document.querySelector<HTMLTextAreaElement>(
			"textarea[name='bio']",
		);
		if (area !== null) type(area, "Mathematician");
		expect(controller.values().bio).toBe("Mathematician");
		view.dispose();
	});
});

describe("Form", () => {
	it("turns off the browser's own validation bubbles", () => {
		// They cannot be styled, appear one at a time, and would fire before the
		// controller ever runs — two presentations for the same error.
		const controller = loginForm();
		const view = mount(Form({ form: controller, children: "fields" }));
		expect(document.querySelector("form")?.hasAttribute("novalidate")).toBe(
			true,
		);
		view.host.remove();
	});

	it("submits through the controller and prevents the default", async () => {
		const submit = vi.fn<(values: Login) => Promise<unknown>>(
			async () => undefined,
		);
		const controller = loginForm(submit);
		controller.set("email", "ada@example.com");
		const view = mount(Form({ form: controller, children: "fields" }));

		const event = new Event("submit", { bubbles: true, cancelable: true });
		document.querySelector("form")?.dispatchEvent(event);
		await Promise.resolve();

		expect(event.defaultPrevented).toBe(true);
		expect(submit).toHaveBeenCalledTimes(1);
		view.host.remove();
	});

	it("does not submit an invalid form", async () => {
		const submit = vi.fn<(values: Login) => Promise<unknown>>(
			async () => undefined,
		);
		const controller = loginForm(submit);
		const view = mount(Form({ form: controller, children: "fields" }));

		document
			.querySelector("form")
			?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await Promise.resolve();
		expect(submit).not.toHaveBeenCalled();
		view.host.remove();
	});
});

describe("SubmitButton", () => {
	it("is enabled on an invalid form", () => {
		// Disabled until correct gives the user nothing to press and no
		// explanation; pressing it and seeing the errors is how a form teaches.
		const controller = loginForm();
		const view = mount(SubmitButton({ form: controller, label: "Sign in" }));
		expect(document.querySelector("button")?.hasAttribute("disabled")).toBe(
			false,
		);
		view.dispose();
	});

	it("submits the form it belongs to", () => {
		const controller = loginForm();
		const view = mount(SubmitButton({ form: controller, label: "Sign in" }));
		expect(document.querySelector("button")?.getAttribute("type")).toBe(
			"submit",
		);
		view.dispose();
	});
});
