// @vitest-environment node
/**
 * Toasts raised on the server, where there is no document.
 *
 * One process renders every user's pages. A toast kept in module state there
 * would be rendered into the next user's page and never removed, since its
 * timer starts only once a row is mounted. Nothing raised on the server is
 * kept: the page code that raised it runs again in the browser, where the
 * toast belongs.
 */

import { html, renderToString, resetIds } from "@c9up/aurora";
import { describe, expect, it } from "vitest";
import { Toaster, toast } from "../../src/organisms/Sonner.js";
import {
	Toaster as LegacyToaster,
	toast as legacyToast,
} from "../../src/organisms/Toaster.js";

function page(flash: string | undefined) {
	return () => {
		if (flash !== undefined) toast.success(flash);
		return html`<main>${Toaster({})}</main>`;
	};
}

function legacyPage(flash: string | undefined) {
	return () => {
		if (flash !== undefined) legacyToast.success(flash);
		return html`<main>${LegacyToaster({})}</main>`;
	};
}

describe("Sonner > on the server", () => {
	it("keeps one request's toast out of the next request's markup", () => {
		resetIds();
		const alice = renderToString(page("Welcome back, alice@example.com")());
		resetIds();
		const bob = renderToString(page(undefined)());
		expect(alice).not.toContain("alice@example.com");
		expect(bob).not.toContain("alice@example.com");
	});

	it("keeps nothing in module state", () => {
		toast("one");
		toast.error("two", { id: "fixed" });
		toast.loading("three");
		expect(toast.getToasts()).toEqual([]);
	});

	it("still returns an id, so a caller that keeps it does not break", () => {
		expect(toast("hello", { id: "greeting" })).toBe("greeting");
		expect(typeof toast("minted")).toBe("number");
	});

	it("keeps nothing from a promise toast either", async () => {
		const { unwrap } = toast.promise(Promise.resolve(1), {
			loading: "Saving",
			success: "Saved",
		});
		await expect(unwrap()).resolves.toBe(1);
		expect(toast.getToasts()).toEqual([]);
	});
});

describe("deprecated Toaster > on the server", () => {
	it("keeps one request's toast out of the next request's markup", () => {
		resetIds();
		renderToString(legacyPage("Secret for carol")());
		resetIds();
		const dave = renderToString(legacyPage(undefined)());
		expect(dave).not.toContain("Secret for carol");
	});

	it("keeps a loading toast, which has no timer, out of the next request", () => {
		legacyToast.loading("Uploading carol's file");
		resetIds();
		const next = renderToString(legacyPage(undefined)());
		expect(next).not.toContain("carol");
	});
});
