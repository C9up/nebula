/**
 * The `<form>` a server renders is submitted natively until the page is
 * hydrated, and for good when a script fails to load. Without a method that
 * submission is a GET, and every named field — a password included — lands
 * in the URL, the history and the access logs. The form defaults to POST,
 * and the application can set its method, action and encoding.
 */

import { form, html, renderToString, resetIds } from "@c9up/aurora";
import { afterEach, describe, expect, it } from "vitest";
import { bind, Form, TextField } from "../../src/organisms/Form.js";
import { mount } from "./helpers.js";

afterEach(() => {
	document.body.innerHTML = "";
});

function login() {
	return form({
		initial: { email: "", password: "" },
		submit: () => Promise.resolve(),
	});
}

function formTag(markup: string): string {
	return /<form[^>]*>/.exec(markup)?.[0] ?? "";
}

describe("Form > before hydration", () => {
	it("is rendered with method=post by default", () => {
		const controller = login();
		resetIds();
		const markup = renderToString(
			html`${Form({
				form: controller,
				children: TextField({
					bind: bind(controller, "password"),
					label: "Password",
					type: "password",
				}),
			})}`,
		);
		expect(formTag(markup)).toMatch(/\smethod="post"/);
	});

	it("renders the action, method and enctype it is given", () => {
		const controller = login();
		resetIds();
		const markup = renderToString(
			html`${Form({
				form: controller,
				method: "get",
				action: "/search",
				enctype: "multipart/form-data",
			})}`,
		);
		const tag = formTag(markup);
		expect(tag).toMatch(/\smethod="get"/);
		expect(tag).toMatch(/\saction="\/search"/);
		expect(tag).toMatch(/\senctype="multipart\/form-data"/);
	});

	it("neutralises a javascript: action", () => {
		const controller = login();
		const view = mount(
			Form({ form: controller, action: "javascript:alert(1)" }),
		);
		const element = view.host.querySelector("form");
		expect(element?.getAttribute("method")).toBe("post");
		expect(element?.getAttribute("action")).not.toMatch(/^javascript:/i);
		view.dispose();
	});

	it("leaves out an action it was not given, so the form posts to its page", () => {
		const view = mount(Form({ form: login() }));
		expect(view.host.querySelector("form")?.hasAttribute("action")).toBe(false);
		view.dispose();
	});
});
