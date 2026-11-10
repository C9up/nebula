/**
 * Toasts on the server-rendered path.
 *
 * A toast belongs to the browser that raised it. The region is rendered by
 * the server for every request, so whatever it renders there goes to every
 * user: it renders empty until it is mounted, as sonner's `useState([])`
 * filled from an effect does, and a toast raised while a page is being built
 * reaches the screen once the region is adopted in the browser.
 */

import { html, hydrate, renderToString, resetIds } from "@c9up/aurora";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster, toast } from "../../src/organisms/Sonner.js";
import {
	Toaster as LegacyToaster,
	toast as legacyToast,
} from "../../src/organisms/Toaster.js";

afterEach(async () => {
	toast.dismiss();
	legacyToast.clear();
	await vi.advanceTimersByTimeAsync(500);
	vi.useRealTimers();
	document.body.innerHTML = "";
});

/** A toast row's marker, not the list's `data-sonner-toaster`. */
const ROW = /data-sonner-toast(?!er)/;

function ssrThenHydrate(page: () => ReturnType<typeof html>): {
	markup: string;
	host: HTMLElement;
} {
	const host = document.createElement("div");
	document.body.appendChild(host);
	resetIds();
	const markup = renderToString(page());
	host.innerHTML = markup;
	hydrate(host, page);
	return { markup, host };
}

describe("Sonner > server-rendered region", () => {
	it("renders no toast into the markup, even one raised by the page", () => {
		vi.useFakeTimers();
		resetIds();
		const markup = renderToString(
			(() => {
				toast.success("Welcome back, alice@example.com");
				return html`<main>${Toaster({})}</main>`;
			})(),
		);
		expect(markup).not.toContain("alice@example.com");
		expect(markup).not.toMatch(ROW);
	});

	it("shows, once adopted, a toast the page raised while it was built", async () => {
		vi.useFakeTimers();
		let raised = 0;
		const page = () => {
			// The page runs on both sides; only the browser's toast is kept.
			if (raised === 1) toast("Saved");
			raised += 1;
			return html`<main>${Toaster({})}</main>`;
		};
		const { markup, host } = ssrThenHydrate(page);
		await vi.advanceTimersByTimeAsync(0);
		expect(markup).not.toMatch(ROW);
		const rows = host.querySelectorAll("[data-sonner-toast]");
		expect(rows.length).toBe(1);
		expect(rows[0]?.querySelector("[data-title]")?.textContent).toBe("Saved");
	});
});

describe("deprecated Toaster > server-rendered region", () => {
	it("renders no toast into the markup", () => {
		vi.useFakeTimers();
		resetIds();
		const markup = renderToString(
			(() => {
				legacyToast.success("Secret for carol");
				return html`<main>${LegacyToaster({})}</main>`;
			})(),
		);
		expect(markup).not.toContain("Secret for carol");
	});

	it("shows, once adopted, a toast raised before it mounted", () => {
		vi.useFakeTimers();
		let raised = 0;
		const page = () => {
			if (raised === 1) legacyToast.success("Saved");
			raised += 1;
			return html`<main>${LegacyToaster({})}</main>`;
		};
		const { markup, host } = ssrThenHydrate(page);
		expect(markup).not.toContain("Saved");
		expect(host.querySelector("[data-slot='toast']")?.textContent).toContain(
			"Saved",
		);
	});
});
